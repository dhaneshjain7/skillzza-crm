// DCAIS School Health Score — a single 0-100 number combining every tracked
// signal for a school, plus the Admin Scorecard built on top of it.
//
// Design notes (documented here since these are judgment calls, not something
// derivable from the data alone):
//  - A component is "not applicable" only when there is literally no one to
//    measure it on (e.g. Adobe ID / MAU / Teacher CPD need at least one
//    student or teacher record). Its weight is redistributed proportionally
//    across the remaining applicable components, exactly as specified.
//  - POE uses the existing `poeSubmitted` Yes/No flag — there's no separate
//    evidence-upload workflow, so Yes = full marks, No = zero.
//  - "Timeliness / Responsiveness" has no dedicated data source in this app
//    (no contact log). It's approximated from recency of ANY recorded
//    activity against the school (ActivityLog + AuditLog + status changes) —
//    documented as an explicit proxy, not a real "responsiveness" metric.
//  - The Admin Scorecard's "On-time Activities" and "CRM Hygiene" are
//    similarly approximated (all-activities-complete rate, and profile
//    completeness) since no due-date or data-hygiene-audit concept exists.

const { ActivityLog, AuditLog } = require('../models');
const { ACTIVITY_FIELDS } = require('./schoolFilter');

const HEALTH_WEIGHTS = {
  dataReadiness:  10,
  adobeId:        15,
  teacherCpd:     15,
  studentMau:     25,
  hackathon:      10,
  dcaisMonthly:   10,
  poe:            10,
  timeliness:      5,
};

const HEALTH_LABELS = {
  dataReadiness: 'Student/Teacher Data Readiness',
  adobeId:       'Adobe ID Creation & Activation',
  teacherCpd:    'Teacher CPD Completion',
  studentMau:    'Quarterly Student MAU / Workshop',
  hackathon:     'Hackathon Participation',
  dcaisMonthly:  'Monthly DCAIS Curriculum',
  poe:           'POE Submission',
  timeliness:    'Timeliness / Responsiveness',
};

const classify = (score) => (score >= 80 ? 'Green' : score >= 60 ? 'Amber' : 'Red');

const monthKeys = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const quarterKeys = ['q1','q2','q3','q4'];

// India fiscal-year quarter (Apr-Jun=Q1, Jul-Sep=Q2, Oct-Dec=Q3, Jan-Mar=Q4),
// matching analyticsSnapshot.js's convention. Unchanged from before.
const currentQuarterNumber = () => Math.floor(((new Date().getMonth() + 9) % 12) / 3) + 1; // 1-4
const currentQuarterKey = () => `q${currentQuarterNumber()}`;
// Only the quarters that have actually started this fiscal year — a school
// shouldn't be marked down for Q3/Q4 not being done yet when we're still in Q2.
const elapsedQuarterKeys = () => quarterKeys.slice(0, currentQuarterNumber());

// Same idea at month granularity, in fiscal-year order (Apr first, Mar last) —
// matches the Apr-Mar column order now used everywhere else in the app.
const FY_MONTH_ORDER = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar'];
const elapsedMonthKeysFY = () => {
  const fyIndex = (new Date().getMonth() + 9) % 12; // Apr=0 ... Mar=11
  return FY_MONTH_ORDER.slice(0, fyIndex + 1);
};

// ── Last-activity lookup ────────────────────────────────────────────────────
// Merges ActivityLog + AuditLog timestamps per school into one Map, used both
// for the Timeliness health component and for direct "no activity in N days"
// questions. Both collections are already indexed on (school, createdAt).
const getLastActivityMap = async () => {
  const [fromActivity, fromAudit] = await Promise.all([
    ActivityLog.aggregate([
      { $match: { relatedSchool: { $ne: null } } },
      { $group: { _id: '$relatedSchool', lastAt: { $max: '$createdAt' } } },
    ]),
    AuditLog.aggregate([
      { $group: { _id: '$school', lastAt: { $max: '$createdAt' } } },
    ]),
  ]);

  const map = new Map();
  [...fromActivity, ...fromAudit].forEach(row => {
    const key = String(row._id);
    const existing = map.get(key);
    if (!existing || row.lastAt > existing) map.set(key, row.lastAt);
  });
  return map;
};

// ── Core scoring — pure function over one school + its last-activity date ──
const computeSchoolHealth = (school, lastActivityDate) => {
  const students = school.studentsActivity || [];
  const teachers = school.teachersActivity || [];
  const q = currentQuarterKey();

  const pctOf = (arr, pred) => (arr.length > 0 ? arr.filter(pred).length / arr.length : null);

  const raw = {
    dataReadiness: (
      (school.studentDataReceived === 'Yes' ? 0.5 : 0) +
      (school.teachersDataReceived === 'Yes' ? 0.5 : 0)
    ),
    adobeId: students.length > 0
      ? ((pctOf(students, s => s.adobeIdCreated) ?? 0) * 0.5 + (pctOf(students, s => s.adobeIdActivated) ?? 0) * 0.5)
      : null,
    // Only scored against quarters that have actually started this fiscal year —
    // a school fully caught up through the current quarter reads 100%, not marked
    // down for quarters that haven't happened yet.
    teacherCpd: teachers.length > 0
      ? (() => {
          const elapsed = elapsedQuarterKeys();
          return teachers.reduce((sum, t) => sum + elapsed.filter(k => t.cpdQuarterly?.[k]).length, 0) / (teachers.length * elapsed.length);
        })()
      : null,
    studentMau: students.length > 0
      ? (pctOf(students, s => s.mauQuarterly?.[q]) ?? 0)
      : null,
    hackathon: students.length > 0
      ? (pctOf(students, s => s.hackathonParticipated) ?? 0)
      : (school.hackathonRegistered === 'Yes' ? 1 : 0),
    // Only scored against months that have actually started this fiscal year —
    // same principle as Teacher CPD's elapsed-quarters fix.
    dcaisMonthly: (students.length + teachers.length) > 0
      ? (() => {
          const elapsed = elapsedMonthKeysFY();
          const studentDone = students.reduce((sum, s) => sum + elapsed.filter(m => s.dcaisMonthly?.[m]).length, 0);
          const teacherDone = teachers.reduce((sum, t) => sum + elapsed.filter(m => t.dcaisMonthly?.[m]).length, 0);
          const totalSlots = (students.length + teachers.length) * elapsed.length;
          return totalSlots > 0 ? (studentDone + teacherDone) / totalSlots : null;
        })()
      : null,
    poe: school.poeSubmitted === 'Yes' ? 1 : 0,
    timeliness: (() => {
      if (!lastActivityDate) return 0;
      const days = (Date.now() - new Date(lastActivityDate).getTime()) / 86400000;
      if (days <= 7)  return 1;
      if (days <= 30) return 0.6;
      if (days <= 90) return 0.2;
      return 0;
    })(),
  };

  const applicableKeys = Object.keys(HEALTH_WEIGHTS).filter(k => raw[k] !== null);
  const totalApplicableWeight = applicableKeys.reduce((sum, k) => sum + HEALTH_WEIGHTS[k], 0);

  let score = 0;
  const components = {};
  Object.keys(HEALTH_WEIGHTS).forEach(k => {
    const applicable = raw[k] !== null;
    const pct = applicable ? raw[k] : null;
    const adjustedWeight = applicable && totalApplicableWeight > 0 ? (HEALTH_WEIGHTS[k] / totalApplicableWeight) * 100 : 0;
    const points = applicable ? Math.round(pct * adjustedWeight * 10) / 10 : null;
    components[k] = { label: HEALTH_LABELS[k], applicable, weight: HEALTH_WEIGHTS[k], adjustedWeight: Math.round(adjustedWeight * 10) / 10, percent: applicable ? Math.round(pct * 1000) / 10 : null, points };
    if (applicable) score += points;
  });
  score = Math.round(Math.min(100, Math.max(0, score)) * 10) / 10;

  const daysSinceLastActivity = lastActivityDate ? Math.floor((Date.now() - new Date(lastActivityDate).getTime()) / 86400000) : null;

  return { score, status: classify(score), components, daysSinceLastActivity };
};

// Attach `.healthScore` to a list of School docs (or plain objects with the
// same shape) — one shared last-activity lookup for the whole batch. Pass an
// already-fetched map (e.g. when scoring many admins' schools in one request)
// to skip re-running the aggregation.
const attachHealthScores = async (schools, lastActivityMap) => {
  const map = lastActivityMap || await getLastActivityMap();
  return schools.map(s => {
    const obj = typeof s.toObject === 'function' ? s.toObject() : s;
    const lastAt = map.get(String(obj._id));
    obj.healthScore = computeSchoolHealth(obj, lastAt);
    return obj;
  });
};

// ── Admin Scorecard — outcome-weighted rollup over an admin's schools, each
// of which must already carry `.healthScore` (from attachHealthScores above).
const ADMIN_WEIGHTS = { mauAchievement: 30, schoolHealth: 20, teacherCpd: 15, adobeActivation: 10, poeCompliance: 10, onTimeActivities: 10, crmHygiene: 5 };

const calcProfileCompletion = (s) => {
  const fields = [s.schoolName, s.email, s.phone, s.address?.city, s.address?.state, s.principal?.name, s.board, s.schoolType];
  return fields.filter(Boolean).length / fields.length;
};

const computeAdminScorecard = (schoolsWithHealth) => {
  if (schoolsWithHealth.length === 0) {
    return { score: null, status: null, schoolCount: 0, components: {}, note: 'No schools assigned.' };
  }

  const mauScores = schoolsWithHealth.map(s => s.healthScore.components.studentMau?.percent).filter(v => v != null);
  const cpdScores = schoolsWithHealth.map(s => s.healthScore.components.teacherCpd?.percent).filter(v => v != null);
  const adobeScores = schoolsWithHealth.map(s => s.healthScore.components.adobeId?.percent).filter(v => v != null);
  const avg = (arr) => (arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  const raw = {
    mauAchievement:   avg(mauScores),
    schoolHealth:     avg(schoolsWithHealth.map(s => s.healthScore.score)),
    teacherCpd:       avg(cpdScores),
    adobeActivation:  avg(adobeScores),
    poeCompliance:    (schoolsWithHealth.filter(s => s.poeSubmitted === 'Yes').length / schoolsWithHealth.length) * 100,
    onTimeActivities: (schoolsWithHealth.filter(s => ACTIVITY_FIELDS.every(f => s[f] === 'Yes')).length / schoolsWithHealth.length) * 100,
    crmHygiene:       avg(schoolsWithHealth.map(s => calcProfileCompletion(s) * 100)),
  };

  const applicableKeys = Object.keys(ADMIN_WEIGHTS).filter(k => raw[k] != null);
  const totalApplicableWeight = applicableKeys.reduce((sum, k) => sum + ADMIN_WEIGHTS[k], 0);

  let score = 0;
  const components = {};
  Object.keys(ADMIN_WEIGHTS).forEach(k => {
    const applicable = raw[k] != null;
    const adjustedWeight = applicable && totalApplicableWeight > 0 ? (ADMIN_WEIGHTS[k] / totalApplicableWeight) * 100 : 0;
    const points = applicable ? Math.round((raw[k] / 100) * adjustedWeight * 10) / 10 : null;
    components[k] = { weight: ADMIN_WEIGHTS[k], percent: applicable ? Math.round(raw[k] * 10) / 10 : null, points };
    if (applicable) score += points;
  });
  score = Math.round(Math.min(100, Math.max(0, score)) * 10) / 10;

  return { score, status: classify(score), schoolCount: schoolsWithHealth.length, components };
};

module.exports = { HEALTH_WEIGHTS, HEALTH_LABELS, ADMIN_WEIGHTS, classify, currentQuarterNumber, elapsedQuarterKeys, elapsedMonthKeysFY, getLastActivityMap, computeSchoolHealth, attachHealthScores, computeAdminScorecard };
