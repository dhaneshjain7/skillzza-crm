const { User, School, ActivityLog } = require('../models');
const { notifyPasswordChanged } = require('../utils/notificationService');
const { attachHealthScores, computeAdminScorecard, getLastActivityMap } = require('../utils/healthScore');

const logActivity = async ({ user, action, description, req }) => {
  try {
    await ActivityLog.create({
      user:      user._id,
      userRole:  user.role,
      action,
      description,
      ipAddress: req.ip,
      browser:   req.headers['user-agent'] || '',
    });
  } catch (e) { console.error('log error:', e.message); }
};

// ── @GET /api/admins ───────────────────────────────────────────────────────────
// List all admins with their assigned school counts
const getAdmins = async (req, res) => {
  try {
    const { search, isActive, page = 1, limit = 20 } = req.query;
    const filter = { role: 'admin' };

    if (search) {
      filter.$or = [
        { name:  new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
      ];
    }
    if (isActive === 'true')  filter.isActive = true;
    if (isActive === 'false') filter.isActive = false;

    const skip = (Number(page) - 1) * Number(limit);

    const [admins, total] = await Promise.all([
      User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
      User.countDocuments(filter),
    ]);

    // Attach school counts + scorecard for each admin. One shared last-activity
    // lookup for the whole page, rather than one aggregation per admin.
    const lastActivityMap = await getLastActivityMap();
    const adminsWithStats = await Promise.all(admins.map(async (admin) => {
      const [totalSchools, completed, pending, assignedSchools] = await Promise.all([
        School.countDocuments({ assignedAdmin: admin._id }),
        School.countDocuments({ assignedAdmin: admin._id, currentStatus: 'Completed' }),
        School.countDocuments({ assignedAdmin: admin._id, currentStatus: { $in: ['LOI Pending', 'Verification', 'Data Requested', 'Data Received'] } }),
        School.find({ assignedAdmin: admin._id }),
      ]);
      const schoolsWithHealth = await attachHealthScores(assignedSchools, lastActivityMap);
      return {
        ...admin.toObject(),
        stats: { totalSchools, completed, pending },
        scorecard: computeAdminScorecard(schoolsWithHealth),
      };
    }));

    res.status(200).json({
      success: true,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      admins: adminsWithStats,
    });
  } catch (err) {
    console.error('getAdmins error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @GET /api/admins/:id ───────────────────────────────────────────────────────
const getAdminById = async (req, res) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found.' });

    const schools = await School.find({ assignedAdmin: admin._id })
      .select('schoolName currentStatus address createdAt');

    res.status(200).json({ success: true, admin, schools });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// Shared builder — school activity flags + students/teachers activity merged
// across every school currently assigned to the given admin. Used both by the
// SuperAdmin's per-admin view and the admin's own self-service "My Activity" page.
const buildAdminActivityPayload = async (admin) => {
  const schools = await School.find({ assignedAdmin: admin._id })
    .select('schoolName currentStatus loiReceived dcaisConfirmation studentDataReceived '
      + 'teachersDataReceived hackathonRegistered poeSubmitted cpdTrainingDone '
      + 'studentsActivity teachersActivity email phone address principal board schoolType');

  const schoolActivity = schools.map(s => ({
    _id:                  s._id,
    schoolName:           s.schoolName,
    currentStatus:        s.currentStatus,
    loiReceived:          s.loiReceived,
    dcaisConfirmation:    s.dcaisConfirmation,
    studentDataReceived:  s.studentDataReceived,
    teachersDataReceived: s.teachersDataReceived,
    hackathonRegistered:  s.hackathonRegistered,
    poeSubmitted:         s.poeSubmitted,
    cpdTrainingDone:      s.cpdTrainingDone,
  }));

  // Flatten each school's activity arrays into one combined list, tagging every
  // row with the school it came from so the merged table stays traceable.
  const studentsActivity = schools.flatMap(s =>
    (s.studentsActivity || []).map(row => ({ ...row.toObject(), schoolId: s._id, schoolName: s.schoolName }))
  );
  const teachersActivity = schools.flatMap(s =>
    (s.teachersActivity || []).map(row => ({ ...row.toObject(), schoolId: s._id, schoolName: s.schoolName }))
  );

  const schoolsWithHealth = await attachHealthScores(schools);
  const scorecard = computeAdminScorecard(schoolsWithHealth);

  return {
    admin: { _id: admin._id, name: admin.name, email: admin.email, phone: admin.phone, isActive: admin.isActive },
    scorecard,
    schoolActivity,
    studentsActivity,
    teachersActivity,
  };
};

// ── @GET /api/admins/:id/activity ────────────────────────────────────────────
// SuperAdmin — combined activity view for any admin, by id.
const getAdminActivity = async (req, res) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found.' });

    const payload = await buildAdminActivityPayload(admin);
    res.status(200).json({ success: true, ...payload });
  } catch (err) {
    console.error('getAdminActivity error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @GET /api/admins/me/activity ─────────────────────────────────────────────
// Admin — self-service combined activity view, scoped to their own account.
const getMyActivity = async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'This route is for Admin accounts only.' });
    }
    const payload = await buildAdminActivityPayload(req.user);
    res.status(200).json({ success: true, ...payload });
  } catch (err) {
    console.error('getMyActivity error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @POST /api/admins ───────────────────────────────────────────────────────────
// SuperAdmin creates a new admin account
const createAdmin = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A user with this email already exists.' });
    }

    const admin = await User.create({
      name,
      email: email.toLowerCase().trim(),
      password,
      phone,
      role: 'admin',
      isActive: true,
    });

    await logActivity({ user: req.user, action: 'Admin Created', description: `Created admin: ${name} (${email})`, req });

    res.status(201).json({ success: true, admin });
  } catch (err) {
    console.error('createAdmin error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @PUT /api/admins/:id ───────────────────────────────────────────────────────
// Update admin details (name, phone, email)
const updateAdmin = async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found.' });

    if (name)  admin.name  = name;
    if (phone) admin.phone = phone;
    if (email && email.toLowerCase() !== admin.email) {
      const existing = await User.findOne({ email: email.toLowerCase().trim() });
      if (existing) return res.status(400).json({ success: false, message: 'Email already in use.' });
      admin.email = email.toLowerCase().trim();
    }

    await admin.save();
    await logActivity({ user: req.user, action: 'Admin Updated', description: `Updated admin: ${admin.name}`, req });

    res.status(200).json({ success: true, admin });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @PUT /api/admins/:id/toggle-active ────────────────────────────────────────
// Activate / Deactivate admin (soft — never deleted per scope doc)
const toggleAdminActive = async (req, res) => {
  try {
    const admin = await User.findOne({ _id: req.params.id, role: 'admin' });
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found.' });

    admin.isActive = !admin.isActive;
    await admin.save();

    await logActivity({
      user: req.user,
      action: admin.isActive ? 'Admin Assigned' : 'Admin Deactivated',
      description: `${admin.isActive ? 'Activated' : 'Deactivated'} admin: ${admin.name}`,
      req,
    });

    res.status(200).json({
      success: true,
      message: `Admin ${admin.isActive ? 'activated' : 'deactivated'} successfully.`,
      admin,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @PUT /api/admins/:id/reset-password ───────────────────────────────────────
const resetAdminPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    const admin = await User.findOne({ _id: req.params.id, role: 'admin' }).select('+password');
    if (!admin) return res.status(404).json({ success: false, message: 'Admin not found.' });

    admin.password = newPassword;
    await admin.save();

    await logActivity({ user: req.user, action: 'Password Changed', description: `Reset password for admin: ${admin.name}`, req });

    // Notify the admin their password was reset
    await notifyPasswordChanged({ user: admin, io: req.app.get('io') });

    res.status(200).json({ success: true, message: 'Password reset successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  getAdmins,
  getAdminById,
  getAdminActivity,
  getMyActivity,
  createAdmin,
  updateAdmin,
  toggleAdminActive,
  resetAdminPassword,
};
