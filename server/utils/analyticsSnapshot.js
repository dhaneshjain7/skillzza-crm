// Builds a read-only, aggregated snapshot of the whole School dataset for the
// analytics-Q&A AI feature. This is the ONLY thing the LLM ever sees — it never
// gets direct database access or the ability to run its own queries. The LLM
// only ever converses over the JSON this file produces and returns text — there
// is no path from the CONTENT of a user's question, or the LLM's answer, to a
// database write. The one exception: building this snapshot opportunistically
// records a daily AdminScoreHistory row per admin (see below) — a fixed,
// server-computed value with nothing user-supplied in it, written the same way
// regardless of what was asked.

const { School, AdminScoreHistory, DailyMetricSnapshot } = require('../models');
const { attachHealthScores, computeAdminScorecard, getLastActivityMap, classify, elapsedMonthKeysFY, elapsedQuarterKeys } = require('./healthScore');

const ACTIVITY_FIELDS = [
  { key: 'loiReceived',          label: 'LOI Received' },
  { key: 'dcaisConfirmation',    label: 'DCAIS Participated' },
  { key: 'studentDataReceived',  label: 'Student Data Received' },
  { key: 'teachersDataReceived', label: 'Teachers Data Received' },
  { key: 'hackathonRegistered',  label: 'Hackathon Participated' },
  { key: 'poeSubmitted',         label: 'POE Submitted' },
  { key: 'cpdTrainingDone',      label: 'CPD Training Done' },
  { key: 'aiPlaygroundDone',     label: 'AI Playground' },
  { key: 'skillsStudioDone',     label: 'Skills Studio' },
];

const QUARTERS = ['q1', 'q2', 'q3', 'q4'];

const MONTH_LABELS = {
  jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June',
  jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December',
};

// Fiscal-year month NUMBER (1 = April … 12 = March) — this is what "Month 3/6/9/12"
// in a question means (fiscal quarter-end checkpoints), NOT the calendar month number.
const FISCAL_MONTH_NUMBER = { apr: 1, may: 2, jun: 3, jul: 4, aug: 5, sep: 6, oct: 7, nov: 8, dec: 9, jan: 10, feb: 11, mar: 12 };

// Individual-level, ONE-TIME (not quarterly/monthly) activity flags tracked per
// student/teacher — as opposed to MAU/CPD (quarterly) and DCAIS (monthly), and
// also DIFFERENT from the school-level "hackathonRegistered"/"aiPlaygroundDone"/
// "skillsStudioDone" flags in ACTIVITY_FIELDS above (whether the SCHOOL did the
// activity at all, vs whether THIS student individually participated).
const STUDENT_FLAT_ACTIVITIES = [
  { key: 'hackathonParticipated',    label: 'Annual Hackathon' },
  { key: 'aiPlaygroundParticipated', label: 'AI Playground' },
  { key: 'skillsStudioParticipated', label: 'Skills Studio' },
  { key: 'adobeIdCreated',           label: 'Adobe ID Created' },
  { key: 'adobeIdActivated',         label: 'Adobe ID Activated' },
  { key: 'certificateReceived',      label: 'Certificate Received' },
];
const TEACHER_FLAT_ACTIVITIES = [
  { key: 'certificateReceived', label: 'Certificate Received' },
];

// India fiscal year: Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar.
const currentFiscalInfo = () => {
  const now = new Date();
  const month = now.getMonth(); // 0-11
  const year  = now.getFullYear();
  const fyStartYear = month >= 3 ? year : year - 1; // April (index 3) starts the FY
  const quarterIdx  = Math.floor(((month + 9) % 12) / 3); // Apr-Jun=0 ... Jan-Mar=3
  return {
    fiscalYearLabel: `${fyStartYear}-${String((fyStartYear + 1) % 100).padStart(2, '0')}`,
    quarter: `q${quarterIdx + 1}`,
  };
};

const normaliseState = (raw) => {
  const s = (raw || '').toString().trim().replace(/\s+/g, ' ');
  if (!s || s.toLowerCase() === 'not set') return 'Not set';
  return s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
};

const pct = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 10 : null); // 1 decimal, null = no data
const avg = (arr) => (arr.length > 0 ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10 : null);

const calcCompletion = (s) => {
  const fields = [s.schoolName, s.email, s.phone, s.address?.city, s.address?.state, s.principal?.name, s.board, s.schoolType];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
};

// Combines every open item for a school — profile/pipeline issues AND being
// behind on the Monthly DCAIS Curriculum or either Quarterly component — into
// one readable list, rather than just the single pipeline-status heuristic.
const pendingActionFor = (s, healthComponents) => {
  const items = [];
  if (s.currentStatus === 'LOI Pending') items.push('Upload required documents (LOI pending)');
  if (calcCompletion(s) < 100) items.push('School profile incomplete');
  if (s.currentStatus === 'New') items.push('Awaiting admin contact');
  if (s.currentStatus === 'Rejected') items.push('Application rejected');

  const cpd = healthComponents?.teacherCpd;
  if (cpd?.applicable && cpd.percent < 100) items.push(`Behind on Quarterly Teacher CPD (${cpd.percent}%)`);
  const mau = healthComponents?.studentMau;
  if (mau?.applicable && mau.percent < 100) items.push(`Behind on Quarterly Student MAU (${mau.percent}%)`);
  const dcais = healthComponents?.dcaisMonthly;
  if (dcais?.applicable && dcais.percent < 100) items.push(`Behind on Monthly DCAIS Curriculum (${dcais.percent}%)`);

  return items.length > 0 ? items.join('; ') : 'None';
};

// A school counts as "inactive" if it hasn't progressed past being newly
// created/assigned — i.e. no real engagement activity has started yet.
const isInactive = (s) => ['New', 'Contacted'].includes(s.currentStatus);

// "adminId" scopes the ENTIRE snapshot (and everything derived from it —
// totals, byState/byDistrict/byCity, byAdmin, every individual-level list, all
// 7 BI dashboards) down to just that admin's own assigned schools, by filtering
// at the source query. Pass it when the requester is an "admin" (not
// superadmin), so an admin's analytics/BI queries can never surface another
// admin's schools or platform-wide numbers. Leave it undefined/null for the
// full-platform (superadmin) view — the existing default behavior.
const buildAnalyticsSnapshot = async ({ adminId } = {}) => {
  const scopeFilter = { isArchived: false, ...(adminId ? { assignedAdmin: adminId } : {}) };
  const schools = await School.find(scopeFilter)
    .select('schoolName currentStatus address assignedAdmin email phone board schoolType principal '
      + 'loiReceived dcaisConfirmation studentDataReceived teachersDataReceived hackathonRegistered '
      + 'poeSubmitted cpdTrainingDone aiPlaygroundDone skillsStudioDone cpdTrainingLevel '
      + 'studentCount staffCount studentsActivity teachersActivity createdAt')
    .populate('assignedAdmin', 'name email')
    .lean();

  const { fiscalYearLabel, quarter: currentQuarter } = currentFiscalInfo();
  // Shared "today" key for every daily-snapshot write in this function (admin
  // score history, daily MAU/CPD history) — one consistent reference point.
  const todayKey = new Date().toISOString().slice(0, 10);

  const lastActivityMap = await getLastActivityMap();
  const schoolsWithHealth = await attachHealthScores(schools, lastActivityMap);
  const healthById = new Map(schoolsWithHealth.map(s => [String(s._id), s.healthScore]));

  // ── Per-school computed rows ────────────────────────────────────────────────
  const schoolRows = schools.map(s => {
    const studentsActivity = s.studentsActivity || [];
    const teachersActivity = s.teachersActivity || [];

    // "Registered" means Adobe ID Created = Yes — a student/teacher can't
    // actually perform any tracked activity (MAU, CPD, DCAIS, Hackathon, etc.)
    // without an Adobe ID, so every percentage/count below is scoped to this
    // subset rather than the raw tracked-row count. studentsActivity/
    // teachersActivity (every row, regardless of Adobe ID) are kept around only
    // for the features that are name lists rather than population percentages
    // (repeat-participant detection, engagement recency, dropped-QoQ, etc.).
    const registeredStudents = studentsActivity.filter(st => st.adobeIdCreated);
    const registeredTeachers = teachersActivity.filter(t => t.adobeIdCreated);

    // Only quarters that have actually started this fiscal year — a future
    // quarter showing "0%" reads as "behind", when really it just hasn't
    // begun yet, so it's left out entirely rather than reported misleadingly.
    const mauQuarterlyPct = {};
    elapsedQuarterKeys().forEach(q => {
      mauQuarterlyPct[q] = pct(registeredStudents.filter(st => st.mauQuarterly?.[q]).length, registeredStudents.length);
    });
    const cpdQuarterlyPct = {};
    elapsedQuarterKeys().forEach(q => {
      cpdQuarterlyPct[q] = pct(registeredTeachers.filter(t => t.cpdQuarterly?.[q]).length, registeredTeachers.length);
    });

    // Which Monthly DCAIS Curriculum months this school is BEHIND on — a month
    // counts as done for the school only once EVERY tracked student and teacher
    // has it marked, so "dcaisMonthsDue" is every elapsed month where at least
    // one of them doesn't. A school with NO tracked students/teachers at all has
    // submitted nothing, so it's treated as behind on EVERY elapsed month too —
    // not excluded as "no data" — since it's exactly as actionable a follow-up as
    // a partially-behind school, arguably more so. "dcaisTrackingStarted" flags
    // that distinction (false = nobody entered yet) so an answer can still say
    // WHY a school is behind, not just that it is. "nextDcaisMonthDue" is the
    // oldest (most overdue) month — what "currently due" means in practice, the
    // thing to chase first, not the current calendar month itself.
    const dcaisTrackingStarted = registeredStudents.length + registeredTeachers.length > 0;
    const dcaisMonthsDue = elapsedMonthKeysFY()
      .filter(m => !dcaisTrackingStarted
        || registeredStudents.some(st => !st.dcaisMonthly?.[m])
        || registeredTeachers.some(t => !t.dcaisMonthly?.[m]))
      .map(m => MONTH_LABELS[m]);

    // Month-by-month DCAIS completion %, keyed by full month name (April, May, …)
    // — as opposed to "dcaisMonthlyPct" elsewhere, which is ONE blended number
    // across all elapsed months combined. THIS is what "show monthly Jan-Dec
    // DCAIS %" / chart-by-month questions need. Students+teachers are combined
    // into one pool per month, matching how the Health Score itself scores DCAIS.
    const dcaisPctByMonth = {};
    elapsedMonthKeysFY().forEach(m => {
      const done = registeredStudents.filter(st => st.dcaisMonthly?.[m]).length + registeredTeachers.filter(t => t.dcaisMonthly?.[m]).length;
      dcaisPctByMonth[MONTH_LABELS[m]] = pct(done, registeredStudents.length + registeredTeachers.length);
    });
    const nextDcaisMonthDue = dcaisMonthsDue.length > 0 ? dcaisMonthsDue[0] : null;

    // Did this school PARTICIPATE for a while and then stop — as opposed to never
    // starting, or being currently (still) active? Walk the elapsed months in
    // fiscal order and find the last one with ANY activity (pct > 0). If that's
    // not the most recent elapsed month, the school has gone silent since then —
    // "dcaisStoppedAfterMonth"/"dcaisStoppedAfterFiscalMonthNumber" name exactly
    // when. "Month 3/6/9/12" in a question means FISCAL month number (Apr=1 …
    // Mar=12 — the quarter-end checkpoints), not the calendar month number.
    const monthsWithActivity = elapsedMonthKeysFY().filter(m => (dcaisPctByMonth[MONTH_LABELS[m]] ?? 0) > 0);
    const lastActiveMonthKey = monthsWithActivity.length > 0 ? monthsWithActivity[monthsWithActivity.length - 1] : null;
    const latestElapsedMonthKey = elapsedMonthKeysFY()[elapsedMonthKeysFY().length - 1];
    const dcaisStoppedAfterMonth = dcaisTrackingStarted && lastActiveMonthKey && lastActiveMonthKey !== latestElapsedMonthKey
      ? MONTH_LABELS[lastActiveMonthKey]
      : null;
    const dcaisStoppedAfterFiscalMonthNumber = dcaisStoppedAfterMonth ? FISCAL_MONTH_NUMBER[lastActiveMonthKey] : null;

    // The school's own self-reported total enrollment (set on its profile) — a
    // DIFFERENT number from "studentCount"/"teacherCount" below, which count only
    // the individual students/teachers actually entered into Students/Teachers
    // Activity. A school can enroll 500 students but have only 300 individually
    // tracked, so "% of registered students who participated" needs THIS as the
    // denominator, not the tracked count. Null when the school hasn't recorded it.
    const enrolledStudentCount = typeof s.studentCount === 'number' ? s.studentCount : null;
    const enrolledTeacherCount = typeof s.staffCount === 'number' ? s.staffCount : null;
    const mauParticipationOfEnrolledPct = {};
    elapsedQuarterKeys().forEach(q => {
      mauParticipationOfEnrolledPct[q] = enrolledStudentCount > 0
        ? pct(registeredStudents.filter(st => st.mauQuarterly?.[q]).length, enrolledStudentCount)
        : null;
    });
    const cpdParticipationOfEnrolledPct = {};
    elapsedQuarterKeys().forEach(q => {
      cpdParticipationOfEnrolledPct[q] = enrolledTeacherCount > 0
        ? pct(registeredTeachers.filter(t => t.cpdQuarterly?.[q]).length, enrolledTeacherCount)
        : null;
    });

    const activityFlags = {};
    ACTIVITY_FIELDS.forEach(f => { activityFlags[f.label] = s[f.key] || 'No'; });
    const allActivitiesComplete = ACTIVITY_FIELDS.every(f => s[f.key] === 'Yes');

    // "Registered vs participated" for the one-time individual activities (Annual
    // Hackathon, AI Playground, Skills Studio, Adobe ID Created/Activated,
    // Certificate Received) — "registered" here means Adobe ID Created = Yes,
    // same population as mauQuarterlyPct/cpdQuarterlyPct, just not split by
    // quarter since these aren't quarterly. EXCEPTION: "adobeIdCreated" itself is
    // measured against EVERY tracked student, not the registered subset — it IS
    // the definition of "registered", so measuring it against itself would be
    // circular (always 100%) and would make "who still needs an Adobe ID"
    // unanswerable. Its "registered" field means total TRACKED students instead;
    // every other row's "registered" field means Adobe-ID-registered as usual.
    const studentActivityParticipation = {};
    STUDENT_FLAT_ACTIVITIES.forEach(a => {
      const pool = a.key === 'adobeIdCreated' ? studentsActivity : registeredStudents;
      const count = pool.filter(st => st[a.key]).length;
      studentActivityParticipation[a.key] = { label: a.label, registered: pool.length, participated: count, pct: pct(count, pool.length) };
    });
    const teacherActivityParticipation = {};
    TEACHER_FLAT_ACTIVITIES.forEach(a => {
      const pool = a.key === 'adobeIdCreated' ? teachersActivity : registeredTeachers;
      const count = pool.filter(t => t[a.key]).length;
      teacherActivityParticipation[a.key] = { label: a.label, registered: pool.length, participated: count, pct: pct(count, pool.length) };
    });

    return {
      schoolName:     s.schoolName,
      state:          normaliseState(s.address?.state),
      district:       (s.address?.district || 'Not set').trim() || 'Not set',
      city:           (s.address?.city || 'Not set').trim() || 'Not set',
      status:         s.currentStatus,
      assignedAdmin:  s.assignedAdmin ? { name: s.assignedAdmin.name, email: s.assignedAdmin.email } : null,
      cpdTrainingLevel: s.cpdTrainingLevel || 'None',
      activityFlags,
      allActivitiesComplete,
      dcaisMonthsDue,     // every elapsed fiscal-year month this school is behind on — ALL elapsed months if nothing is tracked yet at all
      nextDcaisMonthDue,  // the oldest/most overdue month from dcaisMonthsDue — null only if genuinely fully caught up
      dcaisTrackingStarted, // false = this school has zero tracked students/teachers, so it's behind on everything by default, not partially behind
      dcaisPctByMonth,    // month-by-month DCAIS completion %, keyed by full month name — for "show monthly Jan-Dec %" / chart-by-month questions
      dcaisStoppedAfterMonth, // last month with ANY DCAIS activity, if the school has since gone silent — null if never started, or still currently active
      dcaisStoppedAfterFiscalMonthNumber, // same, as fiscal-year month number (Apr=1 … Mar=12) — matches how "Month 3/6/9/12" in a question is meant
      studentCount:   registeredStudents.length, // REGISTERED students (Adobe ID Created = Yes) — the population every % below is based on
      teacherCount:   registeredTeachers.length, // same, for teachers
      totalTrackedStudents: studentsActivity.length, // every student entered in Students Activity, regardless of Adobe ID — for "how many students are entered/tracked" questions, not "registered"
      totalTrackedTeachers: teachersActivity.length,
      enrolledStudentCount,  // school's self-reported TOTAL enrollment — null if not recorded on the school's profile
      enrolledTeacherCount,  // school's self-reported TOTAL staff count — null if not recorded
      mauQuarterlyPct,       // % of this school's REGISTERED (Adobe ID Created) students marked done, per quarter (null = no registered students)
      cpdQuarterlyPct,       // % of this school's REGISTERED (Adobe ID Created) teachers marked done, per quarter (null = no registered teachers)
      mauParticipationOfEnrolledPct, // % of TOTAL ENROLLED students who did MAU, per quarter (null = enrollment not recorded)
      cpdParticipationOfEnrolledPct, // % of TOTAL ENROLLED teachers who did CPD, per quarter (null = enrollment not recorded)
      studentActivityParticipation, // registered/participated/pct for Hackathon, AI Playground, Skills Studio, Adobe ID Created/Activated, Certificate Received — keyed by field name
      teacherActivityParticipation, // same, keyed by field name, for teacher-side one-time activities (currently just Certificate Received)
      inactive:       isInactive(s),
      pendingAction:  pendingActionFor(s, healthById.get(String(s._id))?.components),
      healthScore:    healthById.get(String(s._id))?.score ?? null,
      healthStatus:   healthById.get(String(s._id))?.status ?? null,   // Green / Amber / Red
      healthComponents: healthById.get(String(s._id))?.components ?? null,
      daysSinceLastActivity: healthById.get(String(s._id))?.daysSinceLastActivity ?? null,
    };
  });

  // ── Shared geographic rollup — same metrics whether grouped by state, ──────
  // district, or city, so the three below never drift out of sync with each other.
  const buildGeoRollup = (rows) => {
    const totalStudents = rows.reduce((sum, r) => sum + r.studentCount, 0);
    const totalTeachers = rows.reduce((sum, r) => sum + r.teacherCount, 0);
    const totalTrackedStudents = rows.reduce((sum, r) => sum + r.totalTrackedStudents, 0);
    const totalTrackedTeachers = rows.reduce((sum, r) => sum + r.totalTrackedTeachers, 0);

    const activityPct = {};
    ACTIVITY_FIELDS.forEach(f => {
      activityPct[f.label] = pct(rows.filter(r => r.activityFlags[f.label] === 'Yes').length, rows.length);
    });

    const cpdLevelCounts = { CPD1: 0, CPD2: 0, CPD3: 0, CPD4: 0, None: 0 };
    rows.forEach(r => { cpdLevelCounts[r.cpdTrainingLevel] = (cpdLevelCounts[r.cpdTrainingLevel] || 0) + 1; });

    // Student/teacher-weighted % across the group, per quarter (not a simple
    // average of school percentages, so a large school isn't diluted by small ones).
    // Only elapsed quarters — same reasoning as the per-school computation above.
    const mauQuarterlyPct = {};
    elapsedQuarterKeys().forEach(q => {
      let doneCount = 0, total = 0;
      rows.forEach(r => {
        if (r.mauQuarterlyPct[q] != null) { doneCount += (r.mauQuarterlyPct[q] / 100) * r.studentCount; total += r.studentCount; }
      });
      mauQuarterlyPct[q] = pct(doneCount, total);
    });
    const cpdQuarterlyPct = {};
    elapsedQuarterKeys().forEach(q => {
      let doneCount = 0, total = 0;
      rows.forEach(r => {
        if (r.cpdQuarterlyPct[q] != null) { doneCount += (r.cpdQuarterlyPct[q] / 100) * r.teacherCount; total += r.teacherCount; }
      });
      cpdQuarterlyPct[q] = pct(doneCount, total);
    });

    // Month-by-month DCAIS completion % for this group — student+teacher-weighted
    // the same way as mauQuarterlyPct/cpdQuarterlyPct above, per full month name.
    // This is what "show monthly Jan-Dec DCAIS %" / a bar chart by month needs —
    // "dcaisMonthlyPct" elsewhere is only ONE blended number across all months.
    const dcaisPctByMonth = {};
    elapsedMonthKeysFY().forEach(m => {
      const label = MONTH_LABELS[m];
      let done = 0, total = 0;
      rows.forEach(r => {
        const monthPct = r.dcaisPctByMonth[label];
        const weight = r.studentCount + r.teacherCount;
        if (monthPct != null) { done += (monthPct / 100) * weight; total += weight; }
      });
      dcaisPctByMonth[label] = pct(done, total);
    });

    // % of TOTAL ENROLLED students/teachers (school's self-reported headcount, not
    // just the ones individually tracked) who did MAU/CPD this quarter. Only schools
    // that have recorded an enrollment number contribute to either side of the ratio
    // — a school with no enrolled count on file is excluded rather than treated as 0.
    const totalEnrolledStudents = rows.reduce((sum, r) => sum + (r.enrolledStudentCount || 0), 0);
    const totalEnrolledTeachers = rows.reduce((sum, r) => sum + (r.enrolledTeacherCount || 0), 0);
    const mauParticipationOfEnrolledPct = {};
    elapsedQuarterKeys().forEach(q => {
      let doneCount = 0, total = 0;
      rows.forEach(r => {
        if (r.mauParticipationOfEnrolledPct[q] != null) { doneCount += (r.mauParticipationOfEnrolledPct[q] / 100) * r.enrolledStudentCount; total += r.enrolledStudentCount; }
      });
      mauParticipationOfEnrolledPct[q] = pct(doneCount, total);
    });
    const cpdParticipationOfEnrolledPct = {};
    elapsedQuarterKeys().forEach(q => {
      let doneCount = 0, total = 0;
      rows.forEach(r => {
        if (r.cpdParticipationOfEnrolledPct[q] != null) { doneCount += (r.cpdParticipationOfEnrolledPct[q] / 100) * r.enrolledTeacherCount; total += r.enrolledTeacherCount; }
      });
      cpdParticipationOfEnrolledPct[q] = pct(doneCount, total);
    });

    // Registered-vs-participated rollup for the one-time flat activities
    // (Hackathon, AI Playground, Skills Studio, Adobe ID, Certificate) —
    // student/teacher-weighted the same way as mauQuarterlyPct/cpdQuarterlyPct above.
    // EXCEPTION: "adobeIdCreated" is measured against totalTrackedStudents/Teachers
    // (everyone entered), not the registered subset — same reasoning as the
    // per-school computation above (see "studentActivityParticipation" comment there).
    const studentActivityParticipation = {};
    STUDENT_FLAT_ACTIVITIES.forEach(a => {
      const base = a.key === 'adobeIdCreated' ? totalTrackedStudents : totalStudents;
      const participated = rows.reduce((sum, r) => sum + r.studentActivityParticipation[a.key].participated, 0);
      studentActivityParticipation[a.key] = { label: a.label, registered: base, participated, pct: pct(participated, base) };
    });
    const teacherActivityParticipation = {};
    TEACHER_FLAT_ACTIVITIES.forEach(a => {
      const base = a.key === 'adobeIdCreated' ? totalTrackedTeachers : totalTeachers;
      const participated = rows.reduce((sum, r) => sum + r.teacherActivityParticipation[a.key].participated, 0);
      teacherActivityParticipation[a.key] = { label: a.label, registered: base, participated, pct: pct(participated, base) };
    });

    // Student+teacher-weighted Monthly DCAIS Curriculum completion — same
    // per-school percentage the Health Score already computes (elapsed
    // fiscal-year months only), just rolled up here rather than left ungrouped.
    let dcaisDone = 0, dcaisTotal = 0;
    rows.forEach(r => {
      const dc = r.healthComponents?.dcaisMonthly;
      if (dc?.applicable && dc.percent != null) {
        const weight = r.studentCount + r.teacherCount;
        dcaisDone += (dc.percent / 100) * weight;
        dcaisTotal += weight;
      }
    });
    const dcaisMonthlyPct = pct(dcaisDone, dcaisTotal);

    return {
      schools:            rows.length,
      students:           totalStudents, // REGISTERED (Adobe ID Created) students only
      teachers:           totalTeachers, // REGISTERED (Adobe ID Created) teachers only
      totalTrackedStudents, // every student entered, regardless of Adobe ID — for "how many students are entered/tracked" questions, not "registered"
      totalTrackedTeachers,
      enrolledStudents:   totalEnrolledStudents, // sum of schools' self-reported TOTAL enrollment (only where recorded)
      enrolledTeachers:   totalEnrolledTeachers,
      inactiveSchools:     rows.filter(r => r.inactive).length,
      inactiveSchoolsPct: pct(rows.filter(r => r.inactive).length, rows.length),
      allActivitiesCompleteSchools: rows.filter(r => r.allActivitiesComplete).length,
      activityCompletionPct: activityPct, // % of schools in this group with each activity flag = Yes
      cpdTrainingLevelCounts: cpdLevelCounts,
      mauQuarterlyPct,     // student-weighted % of REGISTERED (Adobe ID Created) students marked done, per quarter
      cpdQuarterlyPct,     // teacher-weighted % of REGISTERED (Adobe ID Created) teachers marked done, per quarter
      mauParticipationOfEnrolledPct, // % of TOTAL ENROLLED students who did MAU, per quarter
      cpdParticipationOfEnrolledPct, // % of TOTAL ENROLLED teachers who did CPD, per quarter
      studentActivityParticipation, // registered/participated/pct for Hackathon, AI Playground, Skills Studio, Adobe ID Created/Activated, Certificate Received
      teacherActivityParticipation, // same, for teacher-side one-time activities
      dcaisMonthlyPct,     // student+teacher-weighted % caught up on Monthly DCAIS Curriculum (elapsed months only) — ONE blended number
      dcaisPctByMonth,     // the SAME thing but broken out per month name (April, May, …) — use for "show monthly Jan-Dec %" / bar chart by month
      avgHealthScore: avg(rows.map(r => r.healthScore).filter(v => v != null)),
      greenSchools: rows.filter(r => r.healthStatus === 'Green').length,
      amberSchools: rows.filter(r => r.healthStatus === 'Amber').length,
      redSchools:   rows.filter(r => r.healthStatus === 'Red').length,
    };
  };

  // ── State-level rollups ─────────────────────────────────────────────────────
  const stateGroups = {};
  schoolRows.forEach(row => {
    stateGroups[row.state] = stateGroups[row.state] || [];
    stateGroups[row.state].push(row);
  });

  const byState = Object.entries(stateGroups).map(([state, rows]) => {
    const districts = new Set(rows.map(r => r.district));
    return {
      state,
      districts:     districts.size,
      districtNames: Array.from(districts),
      ...buildGeoRollup(rows),
    };
  }).sort((a, b) => b.schools - a.schools);

  // ── District-level rollups ──────────────────────────────────────────────────
  // Keyed by state+district together (district names aren't unique across
  // states), but each row still exposes state/district as separate fields.
  const districtGroups = {};
  schoolRows.forEach(row => {
    const key = `${row.state}::${row.district}`;
    districtGroups[key] = districtGroups[key] || { state: row.state, district: row.district, rows: [] };
    districtGroups[key].rows.push(row);
  });
  const byDistrict = Object.values(districtGroups)
    .map(({ state, district, rows }) => ({ state, district, ...buildGeoRollup(rows) }))
    .sort((a, b) => b.schools - a.schools);

  // ── City-level rollups ───────────────────────────────────────────────────────
  const cityGroups = {};
  schoolRows.forEach(row => {
    const key = `${row.state}::${row.city}`;
    cityGroups[key] = cityGroups[key] || { state: row.state, city: row.city, rows: [] };
    cityGroups[key].rows.push(row);
  });
  const byCity = Object.values(cityGroups)
    .map(({ state, city, rows }) => ({ state, city, ...buildGeoRollup(rows) }))
    .sort((a, b) => b.schools - a.schools);

  // ── Overall totals ──────────────────────────────────────────────────────────
  const overallActivityCompletionPct = ACTIVITY_FIELDS
    .map(f => ({ activity: f.label, yesPercent: pct(schoolRows.filter(r => r.activityFlags[f.label] === 'Yes').length, schoolRows.length) }))
    .sort((a, b) => (a.yesPercent ?? 0) - (b.yesPercent ?? 0)); // most "behind plan" first

  // Schools fully caught up on the Monthly DCAIS Curriculum component (100% of
  // elapsed fiscal-year months done) — pre-filtered here rather than left for the
  // LLM to scan the school list itself, since that kind of exhaustive filter over
  // ~15+ objects isn't reliable from a language model on a single pass.
  const schoolsMonthlyDcaisComplete = schoolRows
    .filter(r => r.healthComponents?.dcaisMonthly?.applicable && r.healthComponents.dcaisMonthly.percent === 100)
    .map(r => ({ schoolName: r.schoolName, state: r.state, district: r.district, assignedAdmin: r.assignedAdmin }));

  // Schools that have ADOPTED the Monthly DCAIS Curriculum at all this fiscal
  // year — i.e. AT LEAST ONE student or teacher has at least one elapsed month
  // marked done — as opposed to "schoolsMonthlyDcaisComplete" above, which
  // requires 100% of every elapsed month for everyone. "Adopted" is a much
  // lower bar: a school with just one student partway through counts here,
  // even though it's nowhere near fully caught up.
  // Scoped to REGISTERED (Adobe ID Created) students/teachers, same as dcaisPctByMonth.
  const adoptionMonths = elapsedMonthKeysFY();
  const hasAnyDcais = (arr) => (arr || []).some(person => person.adobeIdCreated && adoptionMonths.some(m => person.dcaisMonthly?.[m]));
  const schoolsAdoptedMonthlyDcais = schoolRows
    .filter((r, i) => hasAnyDcais(schools[i].studentsActivity) || hasAnyDcais(schools[i].teachersActivity))
    .map(r => ({ schoolName: r.schoolName, state: r.state, district: r.district, assignedAdmin: r.assignedAdmin }));

  // Ready-made answer for "which month is currently due for each school" — every
  // school with at least one tracked student/teacher that isn't fully caught up,
  // paired with the oldest month it's behind on (see "nextDcaisMonthDue" above).
  const schoolsCurrentlyDueDcaisMonth = schoolRows
    .filter(r => r.nextDcaisMonthDue != null)
    .map(r => ({ schoolName: r.schoolName, state: r.state, district: r.district, assignedAdmin: r.assignedAdmin, monthDue: r.nextDcaisMonthDue, allMonthsDue: r.dcaisMonthsDue, trackingStarted: r.dcaisTrackingStarted }));

  // Ready-made answer for "which schools stopped participating after Month
  // 3/6/9/12" (or after any month) — schools that had SOME DCAIS activity, then
  // none since, sorted most-recently-stopped first. Excludes schools that never
  // started at all (that's "schoolsAdoptedMonthlyDcais"'s complement, a different
  // question) and schools still currently active.
  const schoolsStoppedDcaisParticipation = schoolRows
    .filter(r => r.dcaisStoppedAfterMonth != null)
    .map(r => ({ schoolName: r.schoolName, state: r.state, district: r.district, assignedAdmin: r.assignedAdmin, stoppedAfterMonth: r.dcaisStoppedAfterMonth, stoppedAfterFiscalMonthNumber: r.dcaisStoppedAfterFiscalMonthNumber }))
    .sort((a, b) => b.stoppedAfterFiscalMonthNumber - a.stoppedAfterFiscalMonthNumber);

  // Same idea for the two quarterly-based Health Score components — Teacher CPD
  // Completion and Quarterly Student MAU/Workshop — both scored against only the
  // fiscal-year quarters that have elapsed so far (see healthScore.js).
  const isComplete100 = (r, key) => r.healthComponents?.[key]?.applicable && r.healthComponents[key].percent === 100;
  const schoolRowInfo = (r) => ({ schoolName: r.schoolName, state: r.state, district: r.district, assignedAdmin: r.assignedAdmin });

  const schoolsTeacherCpdComplete = schoolRows.filter(r => isComplete100(r, 'teacherCpd')).map(schoolRowInfo);
  const schoolsStudentMauComplete = schoolRows.filter(r => isComplete100(r, 'studentMau')).map(schoolRowInfo);
  // "Fully caught up on quarterly activities" — both quarterly components at 100%,
  // AND at least one of them has real students/teachers on record. A school with
  // zero of both isn't "complete", it just has no data — excluding it here avoids
  // vacuously counting empty schools as caught up.
  const schoolsQuarterlyComplete = schoolRows
    .filter(r => {
      const cpd = r.healthComponents?.teacherCpd;
      const mau = r.healthComponents?.studentMau;
      const cpdOk = !cpd?.applicable || cpd.percent === 100;
      const mauOk = !mau?.applicable || mau.percent === 100;
      return (cpd?.applicable || mau?.applicable) && cpdOk && mauOk;
    })
    .map(schoolRowInfo);

  // ── Quarter-on-quarter trend — compares the two most recently elapsed ──────
  // quarters (dynamic: whichever two are latest right now, e.g. Q1 vs Q2 today,
  // Q2 vs Q3 once Q3 starts) for both Student MAU (= "engagement") and Teacher
  // CPD. Pre-computed here rather than left for the LLM to compare across every
  // school itself — same reliability reasoning as the other pre-filtered lists.
  const qoqQuarters = elapsedQuarterKeys();
  const [prevQ, latestQ] = qoqQuarters.length >= 2 ? qoqQuarters.slice(-2) : [null, null];

  const buildQoQTrend = (pctField) => {
    if (!prevQ) return { comparable: false, declined: [], improved: [], unchanged: 0 };
    const declined = [], improved = [];
    let unchanged = 0;
    schoolRows.forEach(r => {
      const prevPct = r[pctField][prevQ];
      const latestPct = r[pctField][latestQ];
      if (prevPct == null || latestPct == null) return; // no data for one of the two quarters
      const entry = {
        schoolName: r.schoolName, state: r.state, district: r.district, assignedAdmin: r.assignedAdmin,
        previousQuarter: prevQ, previousQuarterPct: prevPct,
        latestQuarter: latestQ, latestQuarterPct: latestPct,
        changePts: Math.round((latestPct - prevPct) * 10) / 10,
      };
      if (latestPct < prevPct) declined.push(entry);
      else if (latestPct > prevPct) improved.push(entry);
      else unchanged++;
    });
    declined.sort((a, b) => a.changePts - b.changePts);   // biggest decline first
    improved.sort((a, b) => b.changePts - a.changePts);   // biggest improvement first
    return { comparable: true, declined, improved, unchanged };
  };

  const mauQoQ = buildQoQTrend('mauQuarterlyPct');
  const cpdQoQ = buildQoQTrend('cpdQuarterlyPct');

  // Individual students/teachers who completed the PREVIOUS elapsed quarter but
  // NOT the latest one (e.g. "did Q1 but not Q2") — the per-student/teacher
  // equivalent of mauQoQ/cpdQoQ's school-level "declined" list. This is a
  // DIFFERENT question from "missed the latest quarter" (which doesn't care
  // whether they did the one before it) and from "not 100% across all elapsed
  // quarters" — it specifically means they dropped off between the two most
  // recent quarters. Scoped to REGISTERED (Adobe ID Created) students/teachers,
  // same as mauQuarterlyPct/cpdQuarterlyPct.
  const studentsMauDroppedQoQ = [];
  const teachersCpdDroppedQoQ = [];
  if (prevQ) {
    schools.forEach(s => {
      (s.studentsActivity || []).filter(st => st.adobeIdCreated).forEach(st => {
        if (st.mauQuarterly?.[prevQ] && !st.mauQuarterly?.[latestQ]) {
          studentsMauDroppedQoQ.push({ name: st.name, class: st.class, section: st.section, schoolName: s.schoolName, state: normaliseState(s.address?.state) });
        }
      });
      (s.teachersActivity || []).filter(t => t.adobeIdCreated).forEach(t => {
        if (t.cpdQuarterly?.[prevQ] && !t.cpdQuarterly?.[latestQ]) {
          teachersCpdDroppedQoQ.push({ name: t.name, schoolName: s.schoolName, state: normaliseState(s.address?.state) });
        }
      });
    });
  }

  // Individual name lists for the one-time flat activities (Hackathon, AI
  // Playground, Skills Studio, Adobe ID Created/Activated, Certificate Received)
  // — "participated"/"notParticipated" per activity, keyed by field name, so
  // "which students participated in X, name them" and "which students haven't
  // done X yet" both have a ready answer instead of reading as untracked.
  // Scoped to REGISTERED (Adobe ID Created) students/teachers only — a student
  // with no Adobe ID can't have actually done any of these, so including them in
  // "notParticipated" would just be noise, not a real follow-up list. EXCEPTION:
  // "adobeIdCreated" itself covers EVERY tracked student/teacher regardless of
  // registration status, since it IS the registration step — its
  // "notParticipated" list is exactly "who still needs an Adobe ID created".
  const studentFlatActivity = {};
  STUDENT_FLAT_ACTIVITIES.forEach(a => { studentFlatActivity[a.key] = { label: a.label, participated: [], notParticipated: [] }; });
  const teacherFlatActivity = {};
  TEACHER_FLAT_ACTIVITIES.forEach(a => { teacherFlatActivity[a.key] = { label: a.label, participated: [], notParticipated: [] }; });
  schools.forEach(s => {
    (s.studentsActivity || []).forEach(st => {
      STUDENT_FLAT_ACTIVITIES.forEach(a => {
        if (a.key !== 'adobeIdCreated' && !st.adobeIdCreated) return; // not registered — can't have done this
        const entry = { name: st.name, class: st.class, section: st.section, schoolName: s.schoolName, state: normaliseState(s.address?.state) };
        (st[a.key] ? studentFlatActivity[a.key].participated : studentFlatActivity[a.key].notParticipated).push(entry);
      });
    });
    (s.teachersActivity || []).forEach(t => {
      TEACHER_FLAT_ACTIVITIES.forEach(a => {
        if (a.key !== 'adobeIdCreated' && !t.adobeIdCreated) return;
        const entry = { name: t.name, schoolName: s.schoolName, state: normaliseState(s.address?.state) };
        (t[a.key] ? teacherFlatActivity[a.key].participated : teacherFlatActivity[a.key].notParticipated).push(entry);
      });
    });
  });

  // Individual students/teachers who are personally caught up on the Monthly
  // DCAIS Curriculum through the current fiscal-year month — for "which
  // students/teachers completed X, name them" questions. Names/classes ARE
  // tracked (studentsActivity.name/class/section) — this exists so the LLM has
  // them ready-to-hand instead of needing to be told they're available.
  // Scoped to REGISTERED (Adobe ID Created) students/teachers, same as dcaisPctByMonth.
  const elapsedMonths = elapsedMonthKeysFY();
  const studentsMonthlyDcaisComplete = [];
  const teachersMonthlyDcaisComplete = [];
  schools.forEach(s => {
    (s.studentsActivity || []).filter(st => st.adobeIdCreated).forEach(st => {
      if (elapsedMonths.every(m => st.dcaisMonthly?.[m])) {
        studentsMonthlyDcaisComplete.push({ name: st.name, class: st.class, section: st.section, schoolName: s.schoolName, state: normaliseState(s.address?.state) });
      }
    });
    (s.teachersActivity || []).filter(t => t.adobeIdCreated).forEach(t => {
      if (elapsedMonths.every(m => t.dcaisMonthly?.[m])) {
        teachersMonthlyDcaisComplete.push({ name: t.name, schoolName: s.schoolName, state: normaliseState(s.address?.state) });
      }
    });
  });

  // Same idea for the quarterly components, at individual granularity — students
  // fully caught up on MAU, teachers fully caught up on CPD, through the elapsed
  // fiscal-year quarters.
  // Scoped to REGISTERED (Adobe ID Created) students/teachers, same as mauQuarterlyPct/cpdQuarterlyPct.
  const elapsedQtrs = elapsedQuarterKeys();
  const studentsQuarterlyMauComplete = [];
  const teachersQuarterlyCpdComplete = [];
  schools.forEach(s => {
    (s.studentsActivity || []).filter(st => st.adobeIdCreated).forEach(st => {
      if (elapsedQtrs.every(q => st.mauQuarterly?.[q])) {
        studentsQuarterlyMauComplete.push({ name: st.name, class: st.class, section: st.section, schoolName: s.schoolName, state: normaliseState(s.address?.state) });
      }
    });
    (s.teachersActivity || []).filter(t => t.adobeIdCreated).forEach(t => {
      if (elapsedQtrs.every(q => t.cpdQuarterly?.[q])) {
        teachersQuarterlyCpdComplete.push({ name: t.name, schoolName: s.schoolName, state: normaliseState(s.address?.state) });
      }
    });
  });

  // Distribution of students/teachers by HOW MANY of the 4 quarters (q1-q4) they
  // have MAU/CPD marked done — a histogram, for "how many students did 1/2/3/4
  // quarterly activities" questions, as opposed to the lists above which only
  // answer "all elapsed quarters" or "the single latest quarter". Buckets by the
  // raw q1-q4 flags, not just elapsed ones — but since only "elapsedQtrs" (e.g.
  // q1-q2 right now) have realistically been reachable so far this fiscal year,
  // expect counts to cluster at or below that many; a student sitting at 3 or 4
  // this early would mean a quarter was marked before it started.
  // Scoped to REGISTERED (Adobe ID Created) students/teachers, same as mauQuarterlyPct/cpdQuarterlyPct.
  const mauQuarterCountDistribution = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  const cpdQuarterCountDistribution = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  schools.forEach(s => {
    (s.studentsActivity || []).filter(st => st.adobeIdCreated).forEach(st => {
      const count = QUARTERS.filter(q => st.mauQuarterly?.[q]).length;
      mauQuarterCountDistribution[count].push({ name: st.name, class: st.class, section: st.section, schoolName: s.schoolName, state: normaliseState(s.address?.state) });
    });
    (s.teachersActivity || []).filter(t => t.adobeIdCreated).forEach(t => {
      const count = QUARTERS.filter(q => t.cpdQuarterly?.[q]).length;
      cpdQuarterCountDistribution[count].push({ name: t.name, schoolName: s.schoolName, state: normaliseState(s.address?.state) });
    });
  });

  // Individual students/teachers who did NOT complete the single most-recently-
  // elapsed quarter specifically (currentQuarter — e.g. Q2 right now), as
  // opposed to the *QuarterlyComplete lists above which require ALL elapsed
  // quarters. This is the direct answer to "who missed the latest CPD/MAU
  // session" — that data already exists per-teacher/student, it just wasn't
  // being surfaced as its own list before.
  // Scoped to REGISTERED (Adobe ID Created) students/teachers, same as mauQuarterlyPct/
  // cpdQuarterlyPct — this is the list the "target"/gap definition relies on.
  const teachersMissedLatestCpd = [];
  const studentsMissedLatestMau = [];
  schools.forEach(s => {
    (s.teachersActivity || []).filter(t => t.adobeIdCreated).forEach(t => {
      if (!t.cpdQuarterly?.[currentQuarter]) {
        teachersMissedLatestCpd.push({ name: t.name, schoolName: s.schoolName, state: normaliseState(s.address?.state) });
      }
    });
    (s.studentsActivity || []).filter(st => st.adobeIdCreated).forEach(st => {
      if (!st.mauQuarterly?.[currentQuarter]) {
        studentsMissedLatestMau.push({ name: st.name, class: st.class, section: st.section, schoolName: s.schoolName, state: normaliseState(s.address?.state) });
      }
    });
  });

  // Individual students/teachers whose current-quarter MAU/CPD flag was set by an
  // import that ran earlier TODAY (server-local calendar day), per "importedAt" —
  // the only date stamp available, since bulk import is the sole write path and
  // the quarterly/monthly flags themselves carry no date. Rows imported before
  // this field existed have no "importedAt" and so never appear here — that's a
  // real data gap (we don't know when they were entered), not a bug.
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
  const importedToday = (d) => d && new Date(d) >= todayStart && new Date(d) <= todayEnd;
  const teachersCpdSubmittedToday = [];
  const studentsMauSubmittedToday = [];
  schools.forEach(s => {
    (s.teachersActivity || []).filter(t => t.adobeIdCreated).forEach(t => {
      if (importedToday(t.importedAt) && t.cpdQuarterly?.[currentQuarter]) {
        teachersCpdSubmittedToday.push({ name: t.name, schoolName: s.schoolName, state: normaliseState(s.address?.state), importedAt: t.importedAt });
      }
    });
    (s.studentsActivity || []).filter(st => st.adobeIdCreated).forEach(st => {
      if (importedToday(st.importedAt) && st.mauQuarterly?.[currentQuarter]) {
        studentsMauSubmittedToday.push({ name: st.name, class: st.class, section: st.section, schoolName: s.schoolName, state: normaliseState(s.address?.state), importedAt: st.importedAt });
      }
    });
  });

  // "Days since [teacher/student] last engaged" — there is NO true engagement/
  // attendance timestamp for individuals anywhere in this system (no per-flag
  // date, no individual activity log — only the whole-row "importedAt" stamped
  // when that record was last created/edited). So this is a PROXY: days since
  // their record was last touched, not genuine engagement. Critically, that's
  // only meaningful for rows that actually HAVE an "importedAt" — rows that
  // predate this tracking (added before it existed) have none, and reporting
  // them as "not engaged" would be a claim we can't back up, so they go in a
  // separate "unknown" bucket instead of being silently counted as stale.
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysSince = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / msPerDay) : null;
  const teachersNotEngagedRecently = [];
  const studentsNotEngagedRecently = [];
  let teachersEngagementUnknown = 0, studentsEngagementUnknown = 0;
  schools.forEach(s => {
    (s.teachersActivity || []).forEach(t => {
      const days = daysSince(t.importedAt);
      if (days == null) { teachersEngagementUnknown++; return; }
      teachersNotEngagedRecently.push({ name: t.name, schoolName: s.schoolName, state: normaliseState(s.address?.state), daysSinceLastRecordUpdate: days });
    });
    (s.studentsActivity || []).forEach(st => {
      const days = daysSince(st.importedAt);
      if (days == null) { studentsEngagementUnknown++; return; }
      studentsNotEngagedRecently.push({ name: st.name, class: st.class, section: st.section, schoolName: s.schoolName, state: normaliseState(s.address?.state), daysSinceLastRecordUpdate: days });
    });
  });
  teachersNotEngagedRecently.sort((a, b) => b.daysSinceLastRecordUpdate - a.daysSinceLastRecordUpdate);
  studentsNotEngagedRecently.sort((a, b) => b.daysSinceLastRecordUpdate - a.daysSinceLastRecordUpdate);

  // Nationwide (all-schools) version of the REGISTERED (Adobe ID Created) mauQuarterlyPct/cpdQuarterlyPct
  // already computed per-school and per-state/district/city — this is the number
  // to reach for any time a question wants ONE overall "current MAU/CPD %" figure
  // without asking specifically about enrollment, so there's never a reason to
  // fall back to the enrolled-based figures below just because this is missing.
  const nationalMauQuarterlyPct = {};
  const nationalCpdQuarterlyPct = {};
  elapsedQuarterKeys().forEach(q => {
    let mDone = 0, mTotal = 0, cDone = 0, cTotal = 0;
    schoolRows.forEach(r => {
      if (r.mauQuarterlyPct[q] != null) { mDone += (r.mauQuarterlyPct[q] / 100) * r.studentCount; mTotal += r.studentCount; }
      if (r.cpdQuarterlyPct[q] != null) { cDone += (r.cpdQuarterlyPct[q] / 100) * r.teacherCount; cTotal += r.teacherCount; }
    });
    nationalMauQuarterlyPct[q] = pct(mDone, mTotal);
    nationalCpdQuarterlyPct[q] = pct(cDone, cTotal);
  });

  // Nationwide month-by-month DCAIS % — same weighting, per full month name.
  const nationalDcaisPctByMonth = {};
  elapsedMonthKeysFY().forEach(m => {
    const label = MONTH_LABELS[m];
    let done = 0, total = 0;
    schoolRows.forEach(r => {
      const monthPct = r.dcaisPctByMonth[label];
      const weight = r.studentCount + r.teacherCount;
      if (monthPct != null) { done += (monthPct / 100) * weight; total += weight; }
    });
    nationalDcaisPctByMonth[label] = pct(done, total);
  });

  // Nationwide (all-schools) version of the enrolled-participation rollup computed
  // per-school above — same student/teacher-weighted method as byState/byDistrict/byCity.
  const nationalEnrolledStudents = schoolRows.reduce((sum, r) => sum + (r.enrolledStudentCount || 0), 0);
  const nationalEnrolledTeachers = schoolRows.reduce((sum, r) => sum + (r.enrolledTeacherCount || 0), 0);
  const mauParticipationOfEnrolledPct = {};
  const cpdParticipationOfEnrolledPct = {};
  elapsedQuarterKeys().forEach(q => {
    let mDone = 0, mTotal = 0, cDone = 0, cTotal = 0;
    schoolRows.forEach(r => {
      if (r.mauParticipationOfEnrolledPct[q] != null) { mDone += (r.mauParticipationOfEnrolledPct[q] / 100) * r.enrolledStudentCount; mTotal += r.enrolledStudentCount; }
      if (r.cpdParticipationOfEnrolledPct[q] != null) { cDone += (r.cpdParticipationOfEnrolledPct[q] / 100) * r.enrolledTeacherCount; cTotal += r.enrolledTeacherCount; }
    });
    mauParticipationOfEnrolledPct[q] = pct(mDone, mTotal);
    cpdParticipationOfEnrolledPct[q] = pct(cDone, cTotal);
  });

  // Nationwide registered-vs-participated for the one-time flat activities.
  // EXCEPTION: "adobeIdCreated" is measured against everyone tracked, not just
  // the registered subset — see the per-school computation's comment for why.
  const nationalStudents = schoolRows.reduce((sum, r) => sum + r.studentCount, 0);
  const nationalTeachers = schoolRows.reduce((sum, r) => sum + r.teacherCount, 0);
  const nationalTrackedStudents = schoolRows.reduce((sum, r) => sum + r.totalTrackedStudents, 0);
  const nationalTrackedTeachers = schoolRows.reduce((sum, r) => sum + r.totalTrackedTeachers, 0);
  const studentActivityParticipation = {};
  STUDENT_FLAT_ACTIVITIES.forEach(a => {
    const base = a.key === 'adobeIdCreated' ? nationalTrackedStudents : nationalStudents;
    const participated = schoolRows.reduce((sum, r) => sum + r.studentActivityParticipation[a.key].participated, 0);
    studentActivityParticipation[a.key] = { label: a.label, registered: base, participated, pct: pct(participated, base) };
  });
  const teacherActivityParticipation = {};
  TEACHER_FLAT_ACTIVITIES.forEach(a => {
    const base = a.key === 'adobeIdCreated' ? nationalTrackedTeachers : nationalTeachers;
    const participated = schoolRows.reduce((sum, r) => sum + r.teacherActivityParticipation[a.key].participated, 0);
    teacherActivityParticipation[a.key] = { label: a.label, registered: base, participated, pct: pct(participated, base) };
  });

  // "Repeat participants" — a student counts as a repeat when the SAME identity
  // (name + class + fiscal year, within the same school) appears as more than
  // one row in Students Activity; a teacher, when name + fiscal year (within the
  // same school) repeats. This is almost always caused by the bulk-import flow,
  // which always APPENDS new rows rather than updating an existing person's —
  // re-importing the same student/teacher creates a duplicate row instead of
  // replacing the original one. Matching is case/whitespace-insensitive.
  const normKey = (v) => (v || '').toString().trim().toLowerCase();
  const studentGroups = new Map();
  const teacherGroups = new Map();
  schools.forEach(s => {
    (s.studentsActivity || []).forEach(st => {
      const key = `${normKey(s.schoolName)}::${normKey(st.name)}::${normKey(st.class)}::${normKey(st.fiscalYear)}`;
      if (!studentGroups.has(key)) studentGroups.set(key, []);
      studentGroups.get(key).push({ name: st.name, class: st.class, section: st.section, schoolName: s.schoolName, fiscalYear: st.fiscalYear });
    });
    (s.teachersActivity || []).forEach(t => {
      const key = `${normKey(s.schoolName)}::${normKey(t.name)}::${normKey(t.fiscalYear)}`;
      if (!teacherGroups.has(key)) teacherGroups.set(key, []);
      teacherGroups.get(key).push({ name: t.name, schoolName: s.schoolName, fiscalYear: t.fiscalYear });
    });
  });
  const studentGroupList = [...studentGroups.values()];
  const teacherGroupList = [...teacherGroups.values()];
  const studentRepeatGroups = studentGroupList.filter(g => g.length > 1);
  const teacherRepeatGroups = teacherGroupList.filter(g => g.length > 1);
  const studentsRepeatParticipants = studentRepeatGroups.map(g => ({ name: g[0].name, class: g[0].class, schoolName: g[0].schoolName, fiscalYear: g[0].fiscalYear, occurrences: g.length }));
  const teachersRepeatParticipants = teacherRepeatGroups.map(g => ({ name: g[0].name, schoolName: g[0].schoolName, fiscalYear: g[0].fiscalYear, occurrences: g.length }));
  const studentDistinctCount = studentGroupList.length;
  const teacherDistinctCount = teacherGroupList.length;
  const studentTotalRows = studentGroupList.reduce((sum, g) => sum + g.length, 0);
  const teacherTotalRows = teacherGroupList.reduce((sum, g) => sum + g.length, 0);

  const totals = {
    schools:   schoolRows.length,
    states:    byState.length,
    districts: new Set(schoolRows.map(r => `${r.state}::${r.district}`)).size,
    cities:    new Set(schoolRows.map(r => `${r.state}::${r.city}`)).size,
    students:  schoolRows.reduce((sum, r) => sum + r.studentCount, 0), // REGISTERED (Adobe ID Created) students only — see "registeredStudents" definition
    teachers:  schoolRows.reduce((sum, r) => sum + r.teacherCount, 0), // REGISTERED (Adobe ID Created) teachers only
    totalTrackedStudents: schoolRows.reduce((sum, r) => sum + r.totalTrackedStudents, 0), // every student entered, regardless of Adobe ID — NOT "registered"
    totalTrackedTeachers: schoolRows.reduce((sum, r) => sum + r.totalTrackedTeachers, 0),
    mauQuarterlyPct: nationalMauQuarterlyPct, // THE nationwide "current MAU %" — % of REGISTERED (Adobe ID Created) students done, per elapsed quarter. Use this by default.
    cpdQuarterlyPct: nationalCpdQuarterlyPct, // THE nationwide "current CPD %" — % of REGISTERED (Adobe ID Created) teachers done, per elapsed quarter. Use this by default.
    dcaisPctByMonth: nationalDcaisPctByMonth, // nationwide DCAIS completion % broken out per month name — for "show monthly Jan-Dec %" / bar chart by month
    enrolledStudents: nationalEnrolledStudents, // sum of schools' self-reported TOTAL enrollment (only where recorded) — a separate, less reliable figure
    enrolledTeachers: nationalEnrolledTeachers,
    mauParticipationOfEnrolledPct, // % of TOTAL ENROLLED (not tracked) students who did MAU, per elapsed quarter — only for questions explicitly about enrollment/capacity
    cpdParticipationOfEnrolledPct, // % of TOTAL ENROLLED (not tracked) teachers who did CPD, per elapsed quarter — only for questions explicitly about enrollment/capacity
    studentActivityParticipation, // nationwide registered/participated/pct for Hackathon, AI Playground, Skills Studio, Adobe ID Created/Activated, Certificate Received
    teacherActivityParticipation, // same, nationwide, for teacher-side one-time activities
    assignedAdmins: new Set(schools.filter(s => s.assignedAdmin).map(s => String(s.assignedAdmin._id))).size,
    schoolsWithAllActivitiesComplete: schoolRows.filter(r => r.allActivitiesComplete).length,
    schoolsMonthlyDcaisComplete: schoolsMonthlyDcaisComplete.length,
    schoolsAdoptedMonthlyDcais: schoolsAdoptedMonthlyDcais.length,
    schoolsCurrentlyDueDcaisMonth: schoolsCurrentlyDueDcaisMonth.length,
    schoolsStoppedDcaisParticipation: schoolsStoppedDcaisParticipation.length,
    schoolsTeacherCpdComplete: schoolsTeacherCpdComplete.length,
    schoolsStudentMauComplete: schoolsStudentMauComplete.length,
    schoolsQuarterlyComplete: schoolsQuarterlyComplete.length,
    studentsMonthlyDcaisComplete: studentsMonthlyDcaisComplete.length,
    teachersMonthlyDcaisComplete: teachersMonthlyDcaisComplete.length,
    studentsQuarterlyMauComplete: studentsQuarterlyMauComplete.length,
    teachersQuarterlyCpdComplete: teachersQuarterlyCpdComplete.length,
    teachersMissedLatestCpd: teachersMissedLatestCpd.length,
    studentsMissedLatestMau: studentsMissedLatestMau.length,
    teachersCpdSubmittedToday: teachersCpdSubmittedToday.length,
    studentsMauSubmittedToday: studentsMauSubmittedToday.length,
    teachersEngagementUnknown: teachersEngagementUnknown, // teachers with NO record-update timestamp at all — can't say whether they're stale or not
    studentsEngagementUnknown: studentsEngagementUnknown,
    // "Repeat participants" (same name+class+fiscalYear at the same school
    // appearing more than once in Students Activity — name+fiscalYear for
    // teachers) — TWO different percentages, don't conflate them: "RepeatPct" is
    // % of DISTINCT people who have a duplicate row; "DuplicateRowsPct" is % of
    // ALL rows that are extra copies beyond each person's first. See
    // "studentsRepeatParticipants"/"teachersRepeatParticipants" (top level) for names.
    studentsRepeatCount:       studentRepeatGroups.length,
    studentsRepeatPct:         pct(studentRepeatGroups.length, studentDistinctCount),
    studentsDuplicateRows:     studentTotalRows - studentDistinctCount,
    studentsDuplicateRowsPct:  pct(studentTotalRows - studentDistinctCount, studentTotalRows),
    teachersRepeatCount:       teacherRepeatGroups.length,
    teachersRepeatPct:         pct(teacherRepeatGroups.length, teacherDistinctCount),
    teachersDuplicateRows:     teacherTotalRows - teacherDistinctCount,
    teachersDuplicateRowsPct:  pct(teacherTotalRows - teacherDistinctCount, teacherTotalRows),
    // Counts only (see "mauQuarterCountDistribution"/"cpdQuarterCountDistribution" at
    // the top level for the actual names in each bucket) — how many students/teachers
    // have exactly 0/1/2/3/4 of the four quarters (q1-q4) marked done.
    studentsByMauQuarterCount: { 0: mauQuarterCountDistribution[0].length, 1: mauQuarterCountDistribution[1].length, 2: mauQuarterCountDistribution[2].length, 3: mauQuarterCountDistribution[3].length, 4: mauQuarterCountDistribution[4].length },
    teachersByCpdQuarterCount: { 0: cpdQuarterCountDistribution[0].length, 1: cpdQuarterCountDistribution[1].length, 2: cpdQuarterCountDistribution[2].length, 3: cpdQuarterCountDistribution[3].length, 4: cpdQuarterCountDistribution[4].length },
    studentsMauDroppedQoQ: studentsMauDroppedQoQ.length,
    teachersCpdDroppedQoQ: teachersCpdDroppedQoQ.length,
    schoolsMauDeclinedQoQ: mauQoQ.declined.length,
    schoolsMauImprovedQoQ: mauQoQ.improved.length,
    schoolsCpdDeclinedQoQ: cpdQoQ.declined.length,
    schoolsCpdImprovedQoQ: cpdQoQ.improved.length,
    inactiveSchools: schoolRows.filter(r => r.inactive).length,
    avgHealthScore: avg(schoolRows.map(r => r.healthScore).filter(v => v != null)),
    greenSchools: schoolRows.filter(r => r.healthStatus === 'Green').length,
    amberSchools: schoolRows.filter(r => r.healthStatus === 'Amber').length,
    redSchools:   schoolRows.filter(r => r.healthStatus === 'Red').length,
  };

  // ── Nationwide daily MAU/CPD snapshot — for a genuine "daily run rate" ──────
  // (Peak MAU War Room dashboard). Same opportunistic, harmless write pattern as
  // AdminScoreHistory above: one row per calendar day, first snapshot of the day
  // wins, nothing user-supplied in it. Only exists from whenever this first ran.
  // GUARDED to full-platform (unscoped) snapshots only — writing or reading this
  // from an admin-SCOPED call would silently mix a partial (one admin's schools)
  // count into what's supposed to be a true nationwide figure, corrupting it for
  // everyone else. An admin-scoped snapshot simply gets null here instead.
  let mauDailyHistory = null, mauDailyRunRate = null;
  if (!adminId) {
    const mauDoneCount = Math.round((totals.mauQuarterlyPct[currentQuarter] ?? 0) / 100 * totals.students);
    const cpdDoneCount = Math.round((totals.cpdQuarterlyPct[currentQuarter] ?? 0) / 100 * totals.teachers);
    try {
      await DailyMetricSnapshot.findOneAndUpdate(
        { dateKey: todayKey },
        { $setOnInsert: { dateKey: todayKey, mauDoneCount, mauRegisteredCount: totals.students, cpdDoneCount, cpdRegisteredCount: totals.teachers } },
        { upsert: true }
      );
    } catch (err) {
      console.error('DailyMetricSnapshot snapshot error:', err.message); // never let history-writing break the analytics query itself
    }
    const dailyHistoryDocs = await DailyMetricSnapshot.find({}, 'dateKey mauDoneCount mauRegisteredCount cpdDoneCount cpdRegisteredCount').sort({ dateKey: 1 }).limit(90).lean();
    mauDailyHistory = dailyHistoryDocs.map(d => ({ date: d.dateKey, done: d.mauDoneCount, registered: d.mauRegisteredCount, pct: pct(d.mauDoneCount, d.mauRegisteredCount) }));
    // Average day-over-day change across the recorded window — null until at
    // least 2 distinct days of history exist; this is a real rate, not a guess.
    if (mauDailyHistory.length >= 2) {
      const first = mauDailyHistory[0], last = mauDailyHistory[mauDailyHistory.length - 1];
      const daysSpan = (new Date(last.date) - new Date(first.date)) / (24 * 60 * 60 * 1000);
      if (daysSpan > 0) mauDailyRunRate = Math.round(((last.done - first.done) / daysSpan) * 10) / 10; // students/day
    }
  }
  totals.mauDailyHistory = mauDailyHistory; // [{date, done, registered, pct}, ...] — chart-ready once enough days exist; null when this snapshot is admin-scoped (nationwide-only data)
  totals.mauDailyRunRate = mauDailyRunRate; // students/day, averaged across the recorded window — null if <2 days recorded yet, or if this snapshot is admin-scoped

  // ── Admin (Account Manager) Scorecards ──────────────────────────────────────
  const adminGroups = {};
  schoolsWithHealth.forEach(s => {
    if (!s.assignedAdmin) return;
    const id = String(s.assignedAdmin._id);
    adminGroups[id] = adminGroups[id] || { admin: s.assignedAdmin, schools: [] };
    adminGroups[id].schools.push(s);
  });
  // Per-admin month-by-month DCAIS % rollup, weighted the same way as the geo
  // rollups. There is NO stored history of admin scores/MAU/CPD over time at
  // all — every admin metric elsewhere is computed live from current data, not
  // tracked month to month — so Monthly DCAIS Curriculum (the only genuinely
  // MONTHLY-cadence activity in this whole dataset, as opposed to MAU/CPD which
  // are only quarterly) is the one real signal available for "which admin is
  // improving fastest month-on-month".
  const adminDcaisRows = {};
  schoolRows.forEach(r => {
    if (!r.assignedAdmin) return;
    const key = r.assignedAdmin.email;
    (adminDcaisRows[key] = adminDcaisRows[key] || []).push(r);
  });
  const adminDcaisTrend = {};
  Object.entries(adminDcaisRows).forEach(([email, rows]) => {
    const dcaisPctByMonth = {};
    elapsedMonthKeysFY().forEach(m => {
      const label = MONTH_LABELS[m];
      let done = 0, total = 0;
      rows.forEach(r => {
        const monthPct = r.dcaisPctByMonth[label];
        const weight = r.studentCount + r.teacherCount;
        if (monthPct != null) { done += (monthPct / 100) * weight; total += weight; }
      });
      dcaisPctByMonth[label] = pct(done, total);
    });
    const monthKeys = elapsedMonthKeysFY();
    let dcaisMonthOnMonthChangePts = null;
    if (monthKeys.length >= 2) {
      const prevPct = dcaisPctByMonth[MONTH_LABELS[monthKeys[monthKeys.length - 2]]];
      const latestPct = dcaisPctByMonth[MONTH_LABELS[monthKeys[monthKeys.length - 1]]];
      if (prevPct != null && latestPct != null) dcaisMonthOnMonthChangePts = Math.round((latestPct - prevPct) * 10) / 10;
    }
    adminDcaisTrend[email] = { dcaisPctByMonth, dcaisMonthOnMonthChangePts };
  });

  const adminRaw = Object.values(adminGroups).map(({ admin, schools: adminSchools }) => ({
    admin, adminSchools, scorecard: computeAdminScorecard(adminSchools),
  }));

  // ── Admin score history — daily snapshot so "why did Admin X's score change
  // from A to B" can eventually be answered with real numbers. Writes are
  // opportunistic (triggered by an analytics query, since there's no separate
  // job scheduler in this app) and harmless: one row per admin per CALENDAR
  // DAY, upserted with $setOnInsert so only the FIRST snapshot of each day is
  // kept — later queries that same day never overwrite it — and nothing here
  // is derived from user input, so this doesn't reopen the "no write path from
  // a question" guarantee described at the top of this file; it's the same
  // server-computed score that was always shown live, just now also saved.
  // CRITICAL CAVEAT: history only exists from whenever this first ran onward —
  // any score change from before that (e.g. "why did it go from 18% to 57%")
  // has no recorded starting point and can never be reconstructed.
  try {
    await Promise.all(adminRaw.map(({ admin, scorecard }) => AdminScoreHistory.findOneAndUpdate(
      { adminEmail: admin.email.toLowerCase(), dateKey: todayKey },
      { $setOnInsert: {
          admin: admin._id, adminEmail: admin.email.toLowerCase(), dateKey: todayKey,
          score: scorecard.score, status: scorecard.status, schoolCount: scorecard.schoolCount, components: scorecard.components,
        } },
      { upsert: true }
    )));
  } catch (err) {
    console.error('AdminScoreHistory snapshot error:', err.message); // never let history-writing break the analytics query itself
  }

  const historyDocs = await AdminScoreHistory.find(
    { adminEmail: { $in: adminRaw.map(({ admin }) => admin.email.toLowerCase()) } },
    'adminEmail dateKey score status components'
  ).sort({ dateKey: 1 }).lean();
  const historyByEmail = {};
  historyDocs.forEach(h => { (historyByEmail[h.adminEmail] = historyByEmail[h.adminEmail] || []).push(h); });

  const byAdmin = adminRaw
    .map(({ admin, adminSchools, scorecard }) => {
      const history = historyByEmail[admin.email.toLowerCase()] || [];
      const scoreHistory = history.map(h => ({ date: h.dateKey, score: h.score }));
      // Compare against the OLDEST recorded snapshot (the earliest point we
      // actually have data for) vs the CURRENT live score — null unless that
      // oldest snapshot is from a different day than today, i.e. real history exists.
      let scoreChangeSinceFirstTracked = null;
      if (history.length > 0 && history[0].dateKey !== todayKey) {
        const first = history[0];
        const componentChanges = Object.keys(scorecard.components || {})
          .map(k => {
            const toPercent = scorecard.components[k]?.percent;
            const fromPercent = first.components?.[k]?.percent;
            if (toPercent == null || fromPercent == null) return null;
            return { component: k, fromPercent, toPercent, changePts: Math.round((toPercent - fromPercent) * 10) / 10 };
          })
          .filter(Boolean)
          .sort((a, b) => Math.abs(b.changePts) - Math.abs(a.changePts));
        scoreChangeSinceFirstTracked = {
          fromDate: first.dateKey, fromScore: first.score, toScore: scorecard.score,
          changePts: (scorecard.score != null && first.score != null) ? Math.round((scorecard.score - first.score) * 10) / 10 : null,
          componentChanges, // sorted biggest-movement first — this is "why" it changed
        };
      }

      return {
        name: admin.name,
        email: admin.email,
        // Month-by-month DCAIS % for this admin's schools, and the change between
        // the two most-recently-elapsed months — the only real "month-on-month"
        // signal available (see note above). Null "dcaisMonthOnMonthChangePts"
        // means fewer than 2 elapsed months, or no applicable data in one of them.
        dcaisPctByMonth: adminDcaisTrend[admin.email]?.dcaisPctByMonth || {},
        dcaisMonthOnMonthChangePts: adminDcaisTrend[admin.email]?.dcaisMonthOnMonthChangePts ?? null,
        // Raw pending-POE BACKLOG for this admin — a COUNT (and the actual school
        // names), as opposed to "components.poeCompliance.percent" from the
        // scorecard below, which is a blended completion % contributing to score,
        // not a backlog count. For "highest pending POE backlog" questions, sort
        // this array by "poePendingCount" descending — it's small (one row per
        // admin) so no separate pre-sorted list is needed.
        poePendingCount:   adminSchools.filter(s => s.poeSubmitted !== 'Yes').length,
        poePendingSchools: adminSchools.filter(s => s.poeSubmitted !== 'Yes').map(s => s.schoolName),
        // Daily score snapshots recorded from whenever this tracking started —
        // "scoreHistory" is the raw timeline (chart-ready), "scoreChangeSinceFirstTracked"
        // is null until at least 2 distinct days have been recorded for this admin.
        scoreHistory,
        scoreChangeSinceFirstTracked,
        ...scorecard,
      };
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  // ── Intervention queue — the 20 lowest-scoring schools, worst first ────────
  const interventionQueue = [...schoolRows]
    .filter(r => r.healthScore != null)
    .sort((a, b) => a.healthScore - b.healthScore)
    .slice(0, 20)
    .map(r => ({
      schoolName: r.schoolName, state: r.state, district: r.district, status: r.status,
      assignedAdmin: r.assignedAdmin, healthScore: r.healthScore, healthStatus: r.healthStatus,
      pendingAction: r.pendingAction, daysSinceLastActivity: r.daysSinceLastActivity,
    }));

  return {
    generatedAt: new Date().toISOString(),
    // 'platform' = full unscoped view (superadmin); 'admin' = filtered to just
    // one admin's assigned schools (see "adminId" param above) — every number
    // in this snapshot already reflects that scope, this just names it so an
    // answer can say "your schools" instead of implying platform-wide totals.
    scope: adminId ? 'admin' : 'platform',
    currentFiscalYear: fiscalYearLabel,
    currentQuarter,
    previousQuarter: prevQ, // the elapsed quarter just before currentQuarter, or null if currentQuarter is the first elapsed one this fiscal year
    currentMonth: MONTH_LABELS[elapsedMonthKeysFY()[elapsedMonthKeysFY().length - 1]], // full name of the current elapsed fiscal-year month (e.g. "September") — use this to check "completed THIS month" questions against a school's "dcaisMonthsDue"
    definitions: {
      crossTabulation: 'For "of the schools that satisfy A, how many also satisfy B" / "total X, and out of those how many Y" compound-breakdown questions, filter "schools[]" yourself against BOTH real conditions and count — e.g. "of the DCAIS-registered schools (activityFlags[\'DCAIS Participated\'] === \'Yes\'), how many completed this month\'s activity" means: filter to that subset, then within it count schools where "currentMonth" (top-level field, e.g. "September") does NOT appear in that school\'s "dcaisMonthsDue" array (an empty array means fully caught up, which trivially includes the current month). This is real computation over already-present fields, not fabrication — never decline a compound breakdown question just because no single pre-built list already answers it; combine the relevant fields/lists yourself and state both numbers (the total for A, and the count of A-and-B).',
      target: 'This database has no explicit numeric MAU/participation target field. Wherever a question asks about progress "against target" — including "how many more students/workshops/sessions are needed to reach target/100%" — treat the target as 100% of currently-REGISTERED (tracked) students/teachers having the relevant quarter marked done, and COMPUTE the actual gap number yourself: registered count minus the count already done this quarter (the "missed latest" lists — "studentsMissedLatestMau"/"teachersMissedLatestCpd" — ARE exactly that gap population, ready to use directly, e.g. their length is the number of additional students who\'d need to do the current MAU/workshop session to hit 100%). State the 100%-target assumption in one clause, then give the real number — never decline just because no field is literally named "target" or "gap".',
      inactiveSchool: 'A school is counted as "inactive" if its current pipeline status is New or Contacted — i.e. no real engagement/data-collection activity has started yet.',
      allActivitiesComplete: 'True only if every one of the 9 tracked Yes/No activity flags is Yes for that school. This is a DIFFERENT thing from Monthly DCAIS Curriculum completion — see "schoolsMonthlyDcaisComplete" for that.',
      schoolsMonthlyDcaisComplete: 'THREE different "DCAIS" concepts exist — do not confuse them. (1) "DCAIS registered/participated" means the simple SCHOOL-LEVEL flag "activityFlags[\'DCAIS Participated\']" === \'Yes\' on a school in schools[] — a one-time, school-wide confirmation, unrelated to any individual student/teacher activity; a school can have this flag Yes with zero individually-tracked students/teachers. (2) "schoolsAdoptedMonthlyDcais" is a completely different, INDIVIDUAL-level low bar: any school with AT LEAST ONE student or teacher who has done AT LEAST ONE elapsed fiscal-year month of the monthly curriculum — use this only for "which schools have adopted/started/taken up the MONTHLY DCAIS CURRICULUM" questions, never for a plain "DCAIS registered" question. (3) "schoolsMonthlyDcaisComplete" is the individual-level HIGH bar: 100% of every elapsed month done, for every student AND teacher at that school — use this only for "which schools are fully caught up / 100% complete" questions. Use the pre-computed lists/flags directly, never compute any of these yourself from schools[].healthComponents.',
      dcaisPctByMonth: '"dcaisMonthlyPct" (on schools[], every state/district/city row, and "totals") is ONE blended completion % across ALL elapsed fiscal-year months combined. "dcaisPctByMonth" (same locations) is the SAME underlying data but broken out per individual month name (e.g. "April": 92.3, "May": 85.1, …) — use THIS for any "show monthly Jan-Dec %", "month-by-month DCAIS", or "chart/table of DCAIS by month" question, with visualization.type "bar" (categories = the month names present in the object, one series named for the school/state/nationwide) or "table". Never say a monthly breakdown "isn\'t available" or report only the single blended number when a breakdown was asked for.',
      repeatParticipants: 'A student is a "repeat participant" when the SAME identity — name + class + fiscal year, within the same school — appears as more than one row in Students Activity (a teacher: name + fiscal year, within the same school); this is almost always the bulk-import flow appending a duplicate row instead of updating the existing person\'s. For "% of students/teachers are repeat participants" use "totals.studentsRepeatPct" / "totals.teachersRepeatPct" (% of DISTINCT people who have a duplicate) — NOT "studentsDuplicateRowsPct"/"teachersDuplicateRowsPct" (a different number: % of ALL rows that are extra copies) — state which one you\'re reporting if there\'s any ambiguity in how the question was phrased. For names, use "studentsRepeatParticipants" / "teachersRepeatParticipants" (top level), each with "occurrences" (how many times they appear). Never say repeat participation isn\'t tracked — compute it from these fields, never by scanning schools[] yourself.',
      quarterCountDistribution: 'For "how many students/teachers did 1/2/3/4 quarterly activities" or "distribution of students by number of quarters completed" questions, use "totals.studentsByMauQuarterCount" / "totals.teachersByCpdQuarterCount" directly — {"0": n, "1": n, "2": n, "3": n, "4": n}, the count of students/teachers with EXACTLY that many of the four quarters (q1-q4) marked done. For names in a specific bucket, use "mauQuarterCountDistribution"/"cpdQuarterCountDistribution" (top level) the same way, keyed "0"-"4". This is DIFFERENT from "studentsQuarterlyMauComplete" (only ALL elapsed quarters) and "teachersMissedLatestCpd" (only the single latest quarter) — this is a full histogram across every possible count. Since only "currentFiscalYear"\'s elapsed quarters (see "currentQuarter") have realistically been reachable so far, expect most people to sit at or below that count; anyone above it means a future quarter was marked prematurely — worth flagging if it comes up, not hiding. Never say this distribution isn\'t tracked.',
      individualEngagementRecency: 'There is NO true engagement/attendance timestamp for individual students/teachers anywhere in this system — no per-quarter or per-month date, no individual activity log. The closest available PROXY is "importedAt" (when that person\'s row was last created/edited), given as "daysSinceLastRecordUpdate" in "teachersNotEngagedRecently" / "studentsNotEngagedRecently" (sorted longest-stale first — filter to the threshold the question asks for, e.g. > 60, yourself). Always frame the answer as based on "days since their record was last updated", NOT genuine engagement/attendance — same honesty caveat as the school-level Timeliness health component. Critically, "totals.teachersEngagementUnknown" / "totals.studentsEngagementUnknown" count people with NO "importedAt" at all (rows entered before this tracking existed) — these are NOT in the not-engaged lists and must NOT be reported as stale, since there is genuinely no data to judge them by; mention that count separately as "unknown", never fold it into a "hasn\'t engaged" figure.',
      adminScoreHistory: 'Admin (Account Manager) score IS now tracked daily going forward — "byAdmin[].scoreHistory" is the raw timeline ([{date, score}, ...], chart-ready), and "byAdmin[].scoreChangeSinceFirstTracked" (present only once at least 2 distinct days are recorded) explains WHY it changed: {fromDate, fromScore, toScore, changePts, componentChanges} where "componentChanges" is sorted by size of movement — the top entries are the actual reason the score moved. Use these directly for "why did Admin X\'s score change" or "score trend" questions going forward. CRITICAL: this tracking only started recently — there is NO way to explain or verify any score change from BEFORE it began (e.g. a specific historical jump like "from 18% to 57%" the user already observed elsewhere) — say plainly that this specific past change has no recorded starting point and can\'t be reconstructed, while still offering what IS available (current score/components, and that tracking begins now for future comparisons). Never claim admin scores "aren\'t tracked at all" — they are, from this point forward.',
      adminMonthOnMonth: 'Overall admin score IS now tracked day-by-day going forward via "byAdmin[].scoreHistory"/"scoreChangeSinceFirstTracked" (see "adminScoreHistory" above) — use that for general score-trend questions once enough days have accumulated. Separately, Monthly DCAIS Curriculum has its OWN month-by-month tracking mechanism (dcaisMonthly is stored per elapsed calendar month already, unlike MAU/CPD which are only quarterly) — for "which AM is improving fastest month-on-month" specifically, use "byAdmin[].dcaisMonthOnMonthChangePts" (percentage-point change between the two most-recently-elapsed months) and "dcaisPctByMonth" for the full series — rank "byAdmin" by "dcaisMonthOnMonthChangePts" descending yourself, and frame the answer as based on DCAIS trend, not overall score. Null means fewer than 2 elapsed months exist yet, or no applicable data in one of them.',
      adminPoeBacklog: 'For "which account managers/admins have the highest pending POE backlog" questions, use "byAdmin[].poePendingCount" (a raw COUNT of that admin\'s schools with POE not yet submitted) and "poePendingSchools" (their actual names) directly — sort/rank "byAdmin" by "poePendingCount" descending yourself, since it\'s a small per-admin array. This is DIFFERENT from "byAdmin[].components.poeCompliance.percent", which is a blended completion percentage feeding into the admin\'s overall score, not a backlog count. Never say POE backlog isn\'t rolled up by admin — it is, via these fields.',
      dcaisStopped: 'For "which schools stopped participating after Month 3/6/9/12" (or after any specific month) — schools that DID have DCAIS activity for a while and then went silent — use "schoolsStoppedDcaisParticipation" / "totals.schoolsStoppedDcaisParticipation" directly, sorted most-recently-stopped first. "Month 3/6/9/12" in a question means the FISCAL-year month number (April=1 … March=12 — the quarter-end checkpoints), matching "stoppedAfterFiscalMonthNumber" on each entry, NOT the calendar month number — e.g. "stopped after Month 6" means "stoppedAfterFiscalMonthNumber": 6, which is September. "stoppedAfterMonth" gives the actual month name. This list deliberately EXCLUDES schools that never started at all (a different question — see "schoolsAdoptedMonthlyDcais"\'s complement) and schools still currently active in the latest elapsed month. Never say this pattern isn\'t tracked — compute it from this list, not from scanning schools[] yourself.',
      dcaisMonthDue: 'For "which month is currently due for each DCAIS school" or "which month is [school] behind on" questions, use "schoolsCurrentlyDueDcaisMonth" / "totals.schoolsCurrentlyDueDcaisMonth" directly (or "nextDcaisMonthDue" on a specific school in schools[]) — never say due months aren\'t tracked, and never silently drop schools with zero tracked students/teachers: a school that has entered NOTHING is treated as behind on EVERY elapsed month (not excluded as "no data"), since that\'s just as actionable a follow-up. Each entry\'s "trackingStarted" (false = zero tracked students/teachers there) lets you say WHY a school is behind — "hasn\'t started tracking" vs "started but incomplete" — rather than treating every entry the same. "monthDue" is the OLDEST month it\'s behind on (what to chase first), "allMonthsDue" lists every month. A school with "nextDcaisMonthDue": null (absent from this list) is genuinely fully caught up through the current elapsed month — there is no other reason to be absent.',
      quarterlyComplete: 'Two SEPARATE quarterly Health Score components exist — Teacher CPD Completion and Quarterly Student MAU/Workshop, each scored against only the fiscal-year quarters elapsed so far. Pre-computed lists: "schoolsTeacherCpdComplete" (CPD at 100%), "schoolsStudentMauComplete" (MAU at 100%), "schoolsQuarterlyComplete" (both at 100% AND the school has real students/teachers on record for at least one — a school with zero of both isn\'t counted, since it has no data rather than genuine completion; use this for a general "quarterly activities/training" question that doesn\'t specify which one). Use these lists directly, never scan schools[].healthComponents yourself.',
      pendingAction: 'A semicolon-separated list of every open item for that school — combines pipeline/profile issues (LOI pending, profile incomplete, awaiting admin contact, rejected) AND being behind on any applicable Quarterly Teacher CPD, Quarterly Student MAU, or Monthly DCAIS Curriculum component (with its current %) — not a stored field, computed here for convenience. "None" means nothing is open. Use it directly for "what\'s pending" questions rather than re-deriving it from healthComponents.',
      healthScore: '0-100 DCAIS School Health Score, combining Data Readiness (10), Adobe ID Creation & Activation (15), Teacher CPD (15), Quarterly Student MAU (25), Hackathon (10), Monthly DCAIS Curriculum (10), POE Submission (10), Timeliness (5). A component with literally no students/teachers on record is excluded and its weight redistributed proportionally across the rest, rather than penalising the school. Green >= 80, Amber 60-79, Red < 60. Adobe ID is a newly-added field — schools whose student records predate it will show 0% there until re-imported, this is a data-recency gap, not a real failure.',
      timeliness: 'The Health Score\'s Timeliness component is a proxy: how recently ANY action was recorded against the school (status change, document upload, profile edit, etc.) — there is no dedicated "account manager contacted school" log, so this is recency-of-any-activity, not communication specifically.',
      adminScorecard: 'Admin (= "Account Manager") Performance Score: 30% MAU Achievement + 20% avg School Health + 15% Teacher CPD + 10% Adobe Activation + 10% POE Compliance + 10% On-time Activities (% of their schools with all 9 activity flags Yes) + 5% CRM Hygiene (avg profile completeness). On-time Activities and CRM Hygiene are proxies — no due-date or data-hygiene-audit concept exists in this app.',
      individualCompletion: 'Student and teacher names/classes ARE tracked (per school, in studentsActivity/teachersActivity) — never say this data isn\'t available. For "which students/teachers completed X, give me their names" questions, use the matching pre-computed list directly: "studentsMonthlyDcaisComplete" / "teachersMonthlyDcaisComplete" (100% of elapsed fiscal-year months done) or "studentsQuarterlyMauComplete" / "teachersQuarterlyCpdComplete" (100% of elapsed fiscal-year quarters done). Each entry already has name (+ class/section for students) and schoolName — list them directly, never scan schools[] yourself.',
      missedLatest: 'For "who missed/didn\'t do/is absent from the latest CPD/MAU quarterly session" questions — meaning just the single most-recently-elapsed quarter (= "currentQuarter" above), NOT the cumulative all-quarters bar — use "teachersMissedLatestCpd" / "studentsMissedLatestMau" directly. This is a DIFFERENT thing from "teachersQuarterlyCpdComplete" / "studentsQuarterlyMauComplete", which require every elapsed quarter (not just the latest) to be done — the two lists are mutually exclusive, since currentQuarter is itself one of the elapsed quarters. Never say individual "missed" data isn\'t tracked — use these pre-computed lists directly, do not scan schools[] yourself.',
      submittedToday: 'For "who submitted/completed MAU or CPD TODAY" (or "today\'s MAU/CPD achievement") questions, use "teachersCpdSubmittedToday" / "studentsMauSubmittedToday" directly — these list every teacher/student whose current-quarter flag was set by a bulk import that ran earlier today (per the "importedAt" timestamp stamped at import time), which is the only date information this system has for individual submissions. This can undercount: any row imported before this tracking was added, or on a day before today, has no way to be distinguished as "today" even if that\'s genuinely when it happened — mention that caveat briefly rather than presenting the count as exhaustive. Do not say daily submissions "aren\'t tracked" — they are, from today onward.',
      geoRollups: '"byState", "byDistrict", and "byCity" all carry the exact same metrics (schools, students, teachers, activityCompletionPct, mauQuarterlyPct, cpdQuarterlyPct, dcaisMonthlyPct, avgHealthScore, Green/Amber/Red counts, etc.) — just grouped at a different level. Use "byDistrict" directly for any district-wise question, "byCity" for any city-wise question — never try to derive district/city numbers yourself from "byState" or from schools[], they are pre-aggregated exactly for this. "dcaisMonthlyPct" is the Monthly DCAIS Curriculum completion for that state/district/city — use it for any "monthly" performance/target question at that level, alongside mauQuarterlyPct/cpdQuarterlyPct for "quarterly" questions.',
      mauQuarterlyPct: '"mauQuarterlyPct" and "cpdQuarterlyPct" (on schools[] and on every state/district/city row) only include keys for fiscal-year quarters that have already started (e.g. only q1 and q2 right now) — future quarters are deliberately left out entirely rather than shown as a misleading 0%, since they simply haven\'t happened yet. Only report the quarters actually present in the object; never fabricate or assume 0% for a quarter that\'s missing.',
      registeredStudents: '"Registered" students/teachers means Adobe ID Created = Yes ("adobeIdCreated" on a person\'s record) — NOT simply "entered as a row in Students/Teachers Activity". The reasoning: a student/teacher can\'t actually perform any tracked activity (MAU, CPD, DCAIS, Hackathon, AI Playground, Skills Studio, Certificate) without an Adobe ID, so every population/percentage question uses this as the base. "studentCount"/"teacherCount" (on schools[], every state/district/city row) and "students"/"teachers" (in "totals") ALL already reflect this — they are the REGISTERED (Adobe-ID) counts, not raw tracked-row counts. For a plain "how many registered students/teachers" headcount question, use these directly (or list them by filtering schools[].studentsActivity/teachersActivity to "adobeIdCreated === true" for names). For ANY "% of registered students/teachers who participated/did MAU/did CPD/current MAU rate/did Hackathon/etc." question — whether or not it says "registered" — use "mauQuarterlyPct"/"cpdQuarterlyPct" (quarterly) or "studentActivityParticipation"/"teacherActivityParticipation" (one-time flat activities) directly: these are ALREADY computed against the registered population, per elapsed quarter on schools[]/state/district/city rows, or "totals.mauQuarterlyPct"/"totals.cpdQuarterlyPct"/"totals.studentActivityParticipation" for ONE overall nationwide figure. Never recompute these yourself against the raw tracked-row count. If a question instead explicitly asks how many students/teachers are just ENTERED/TRACKED regardless of Adobe ID status (a different, less common question), use "totalTrackedStudents"/"totalTrackedTeachers" (same locations) — do not confuse the two. Do NOT use "enrolledStudentCount"/"enrolledTeacherCount" or "mauParticipationOfEnrolledPct"/"cpdParticipationOfEnrolledPct" (including "totals.mauParticipationOfEnrolledPct") unless a question explicitly asks about the school\'s self-reported "enrollment" or "capacity" — that figure is separate, less reliable, and unrelated to Adobe ID/registration status.',
      cpdVsCpdLevel: 'Two DIFFERENT "CPD" things exist — do not confuse them. "cpdQuarterlyPct" (on schools[] and every state/district/city row) is teacher CPD TRAINING COMPLETION per quarter, as a percentage — use this for any "CPD completion" / "teacher CPD" question. "cpdTrainingLevel" (per school) and "cpdTrainingLevelCounts" (per state/district/city) are a separate CPD1/CPD2/CPD3/CPD4/None CERTIFICATION LEVEL classification, unrelated to completion percentage — only use these for a question explicitly about "CPD level" or "CPD1/2/3/4".',
      qoqTrend: '"mauQoQ" and "cpdQoQ" are pre-computed quarter-on-quarter comparisons between the two most recently elapsed fiscal-year quarters (e.g. Q1 vs Q2 right now) — "mauQoQ" for Student MAU/engagement, "cpdQoQ" for Teacher CPD. Each has "declined" (schools whose % dropped, worst first) and "improved" (schools whose % rose, best first) arrays, each entry with previousQuarter/previousQuarterPct/latestQuarter/latestQuarterPct/changePts already computed — use these directly for any "declined/improved/dropped quarter-on-quarter" question, never say this isn\'t tracked or try to compare schools[] quarters yourself. If "comparable" is false, fewer than 2 quarters have elapsed yet this fiscal year, so say that instead.',
      droppedQoQ: 'For "who did [previous quarter] but not [latest quarter]" / "who participated in Q1 but not Q2" / "which students-teachers dropped off between the last two quarters" questions — an INDIVIDUAL-level question, different from "mauQoQ"/"cpdQoQ" (which are school-level % comparisons) and from "missedLatestCpd/Mau" (which doesn\'t care about the quarter before) — use "studentsMauDroppedQoQ" / "teachersCpdDroppedQoQ" directly: every entry there did "previousQuarter" (see top-level "previousQuarter" field) but not "currentQuarter". Never scan schools[].studentsActivity/teachersActivity yourself for this, and never say it isn\'t tracked. If "previousQuarter" is null, fewer than 2 quarters have elapsed this fiscal year, so say that instead.',
      flatActivities: 'Beyond MAU (quarterly)/CPD (quarterly)/DCAIS (monthly), five more activities are tracked per INDIVIDUAL student — Annual Hackathon, AI Playground, Skills Studio, Adobe ID Created, Adobe ID Activated, Certificate Received — plus one for teachers (Certificate Received). These are ONE-TIME flags (not split by quarter/month). For "how many registered vs participated in [Hackathon/AI Playground/Skills Studio/Adobe ID Activated/Certificate]" or "% of students/teachers who did X" questions, use "studentActivityParticipation"/"teacherActivityParticipation" directly — present per school (on schools[]), per state/district/city rollup, and nationwide in "totals" — each keyed by field name (e.g. "hackathonParticipated") with {label, registered, participated, pct} already computed; "registered" there means Adobe-ID-registered (see "registeredStudents" definition), never the school-profile enrollment field. EXCEPTION: the "adobeIdCreated" entry itself is measured against EVERY tracked student/teacher, not the registered subset — it IS the registration step, so its "registered" field there means total TRACKED count instead (measuring it against itself would be circular, always 100%). For "which students/teachers participated in X, name them" or "who HASN\'T done X yet", use "studentFlatActivity"/"teacherFlatActivity" (same keys, each with "participated" and "notParticipated" name arrays) directly — "adobeIdCreated"\'s "notParticipated" list is exactly "who still needs an Adobe ID created" (covers everyone tracked); every other activity\'s lists only cover already-registered students/teachers. Never say Hackathon/AI Playground/Skills Studio/Adobe ID/Certificate participation "isn\'t tracked at student level" — these fields ARE that tracking. Note these are DIFFERENT from the school-level "hackathonRegistered"/"aiPlaygroundDone"/"skillsStudioDone" flags in "activityFlags" (whether the SCHOOL did it at all, not individual participation).',
    },
    totals,
    overallActivityCompletionPct,
    byState,
    byDistrict,
    byCity,
    byAdmin,
    interventionQueue,
    schoolsMonthlyDcaisComplete,
    schoolsAdoptedMonthlyDcais,
    schoolsCurrentlyDueDcaisMonth,
    schoolsStoppedDcaisParticipation,
    schoolsTeacherCpdComplete,
    schoolsStudentMauComplete,
    schoolsQuarterlyComplete,
    studentsMonthlyDcaisComplete,
    teachersMonthlyDcaisComplete,
    studentsQuarterlyMauComplete,
    teachersQuarterlyCpdComplete,
    teachersMissedLatestCpd,
    studentsMissedLatestMau,
    teachersCpdSubmittedToday,
    studentsMauSubmittedToday,
    teachersNotEngagedRecently, // every teacher WITH a known record-update date, sorted longest-stale first — filter by daysSinceLastRecordUpdate for a specific threshold (e.g. > 60)
    studentsNotEngagedRecently, // same, for students
    mauQuarterCountDistribution, // students bucketed by exactly how many of q1-q4 they have MAU done — { "0": [...], "1": [...], ..., "4": [...] }, each entry named
    cpdQuarterCountDistribution, // same, for teachers/CPD
    studentsRepeatParticipants, // students whose name+class+fiscalYear repeats within the same school — each with "occurrences"
    teachersRepeatParticipants, // same, for teachers (name+fiscalYear within the same school)
    studentsMauDroppedQoQ,
    teachersCpdDroppedQoQ,
    studentFlatActivity, // keyed by field name: { label, participated: [...], notParticipated: [...] } — Hackathon, AI Playground, Skills Studio, Adobe ID Created/Activated, Certificate Received
    teacherFlatActivity, // same, for teacher-side one-time activities
    mauQoQ,
    cpdQoQ,
    schools: schoolRows,
  };
};

module.exports = { buildAnalyticsSnapshot, ACTIVITY_FIELDS, QUARTERS };
