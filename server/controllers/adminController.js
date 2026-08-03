const { User, School, ActivityLog } = require('../models');
const { notifyPasswordChanged } = require('../utils/notificationService');

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

    // Attach school counts for each admin
    const adminsWithStats = await Promise.all(admins.map(async (admin) => {
      const [totalSchools, completed, pending] = await Promise.all([
        School.countDocuments({ assignedAdmin: admin._id }),
        School.countDocuments({ assignedAdmin: admin._id, currentStatus: 'Completed' }),
        School.countDocuments({ assignedAdmin: admin._id, currentStatus: { $in: ['LOI Pending', 'Verification'] } }),
      ]);
      return {
        ...admin.toObject(),
        stats: { totalSchools, completed, pending },
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
  createAdmin,
  updateAdmin,
  toggleAdminActive,
  resetAdminPassword,
};
