const fs = require('fs');
const { School, SchoolStatusHistory, AuditLog, ActivityLog, User } = require('../models');
const { notifyStatusUpdate, notifyAdminAssigned, notifyPasswordChanged } = require('../utils/notificationService');
const { parseFile, validateAgainstSchema, STUDENTS_ACTIVITY_SCHEMA, TEACHERS_ACTIVITY_SCHEMA, SCHOOLS_BULK_SCHEMA } = require('../utils/fileParser');

// ── Helpers ───────────────────────────────────────────────────────────────────

const logActivity = async ({ user, action, description, req, relatedSchool }) => {
  try {
    await ActivityLog.create({
      user:         user._id,
      userRole:     user.role,
      action,
      description,
      relatedSchool: relatedSchool || null,
      ipAddress:    req.ip,
      device:       req.headers['user-agent']?.split(' ')[0] || 'Unknown',
      browser:      req.headers['user-agent'] || 'Unknown',
    });
  } catch (err) {
    console.error('ActivityLog error:', err.message);
  }
};

const logAudit = async ({ school, eventType, performedBy, field, previousValue, newValue, description, remarks, req }) => {
  try {
    await AuditLog.create({
      school,
      eventType,
      performedBy:     performedBy._id,
      performedByRole: performedBy.role,
      field,
      previousValue,
      newValue,
      description,
      remarks,
      ipAddress: req.ip,
      device:    req.headers['user-agent']?.split(' ')[0] || 'Unknown',
      browser:   req.headers['user-agent'] || 'Unknown',
    });
  } catch (err) {
    console.error('AuditLog error:', err.message);
  }
};

// ── @POST /api/schools ────────────────────────────────────────────────────────
// SuperAdmin + Admin — create a new school
const createSchool = async (req, res) => {
  try {
    const {
      schoolName, email, phone, address,
      principal, management, schoolType,
      board, website,
      udiseCode, studentCount,
      staffCount, tags, assignedAdmin,
      loginEmail, loginPassword,
    } = req.body;

    if (!schoolName || !email || !phone || !udiseCode) {
      return res.status(400).json({
        success: false,
        message: 'School name, email, phone and UDISE code are required.',
      });
    }

    // Check duplicate email
    const existing = await School.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'A school with this email already exists.',
      });
    }

    // If login credentials provided, validate + check for existing user account
    let schoolUserId = null;
    if (loginEmail && loginPassword) {
      if (loginPassword.length < 6) {
        return res.status(400).json({
          success: false,
          message: 'Login password must be at least 6 characters.',
        });
      }
      const existingUser = await User.findOne({ email: loginEmail.toLowerCase().trim() });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'A user account with this login email already exists.',
        });
      }
    }

    const school = await School.create({
      schoolName,
      email: email.toLowerCase().trim(),
      phone,
      address,
      principal,
      management,
      schoolType: schoolType || undefined, // '' from an unselected <select> fails the enum validator
      board,
      website,
      udiseCode,
      studentCount,
      staffCount,
      tags,
      assignedAdmin: assignedAdmin || null,
      currentStatus: 'New',
    });

    // Create school_user login account if credentials were provided
    let createdLoginInfo = null;
    if (loginEmail && loginPassword) {
      const schoolUser = await User.create({
        name:     schoolName,
        email:    loginEmail.toLowerCase().trim(),
        password: loginPassword,
        role:     'school_user',
        phone:    phone,
        isActive: true,
      });

      school.schoolUser = schoolUser._id;
      await school.save();

      createdLoginInfo = { email: schoolUser.email };

      await logActivity({
        user:          req.user,
        action:        'School Created',
        description:   `Created school portal login for: ${schoolName} (${schoolUser.email})`,
        relatedSchool: school._id,
        req,
      });
    }

    // First status history entry
    await SchoolStatusHistory.create({
      school:        school._id,
      oldStatus:     null,
      newStatus:     'New',
      updatedBy:     req.user._id,
      updatedByRole: req.user.role,
      remarks:       'School created',
    });

    // Audit log
    await logAudit({
      school:       school._id,
      eventType:    'School Created',
      performedBy:  req.user,
      description:  `School "${schoolName}" created`,
      req,
    });

    // Activity log
    await logActivity({
      user:          req.user,
      action:        'School Created',
      description:   `Created school: ${schoolName}`,
      relatedSchool: school._id,
      req,
    });

    res.status(201).json({ success: true, school, loginCreated: createdLoginInfo });
  } catch (err) {
    console.error('createSchool error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @GET /api/schools/bulk-template ─────────────────────────────────────────────
// Blank .xlsx for bulk-creating many schools at once
const downloadSchoolsBulkTemplate = (req, res) => {
  try {
    const XLSX = require('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([SCHOOLS_BULK_SCHEMA.columns]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Schools_Bulk_Template.xlsx"');
    res.send(buffer);
  } catch (err) {
    console.error('downloadSchoolsBulkTemplate error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

const randomPassword = () => {
  // 10 chars, mixed case + digits — well above the 6-char minimum
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 10; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

// ── @POST /api/schools/bulk-import ───────────────────────────────────────────────
// Create many schools at once from a CSV/XLS/XLSX file. Each school gets a portal
// login where the login email is the school's own email and the password is
// randomly generated (shown once in the response — not recoverable afterwards).
const importSchoolsBulk = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    let parsed;
    try {
      parsed = await parseFile(req.file.path);
    } catch (parseErr) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: `File parse error: ${parseErr.message}` });
    }

    const validation = validateAgainstSchema(parsed, SCHOOLS_BULK_SCHEMA);
    fs.unlinkSync(req.file.path);

    if (validation.missing?.length) {
      return res.status(400).json({ success: false, message: validation.errors[0] });
    }
    if (validation.validRows === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid rows found in file.',
        errors: validation.errors.slice(0, 20),
      });
    }

    const created = [];
    const skipped = [];

    // Rows that failed per-row schema validation (missing required fields, bad UDISE/email
    // format, etc.) never made it into validation.rows — surface them as skipped too, not silently.
    validation.errors.forEach(msg => {
      const m = msg.match(/^Row (\d+): (.+)$/);
      skipped.push({ row: m ? Number(m[1]) : null, schoolName: '', reason: m ? m[2] : msg });
    });

    // Sequential, not parallel — duplicate-email checks must see earlier rows in this same batch.
    for (let i = 0; i < validation.rows.length; i++) {
      const r = validation.rows[i];
      const rowNum = r.__rowNum;
      const schoolName = (r['School Name'] || '').trim();
      const email       = (r['Email'] || '').trim().toLowerCase();

      try {
        const existingSchool = await School.findOne({ email });
        if (existingSchool) {
          skipped.push({ row: rowNum, schoolName, reason: 'A school with this email already exists.' });
          continue;
        }
        const existingUser = await User.findOne({ email });
        if (existingUser) {
          skipped.push({ row: rowNum, schoolName, reason: 'A user account with this email already exists.' });
          continue;
        }

        const school = await School.create({
          schoolName,
          email,
          phone:       (r['Phone'] || '').trim(),
          altPhone:    (r['Alt Phone'] || '').trim(),
          website:     (r['Website'] || '').trim(),
          board:       (r['Board'] || '').trim(),
          schoolType:  (r['School Type'] || '').trim() || undefined,
          udiseCode:   (r['UDISE Code'] || '').trim(),
          studentCount: r['Student Count'] ? Number(r['Student Count']) : undefined,
          staffCount:   r['Staff Count']   ? Number(r['Staff Count'])   : undefined,
          address: {
            street:   (r['Street'] || '').trim(),
            city:     (r['City'] || '').trim(),
            district: (r['District'] || '').trim(),
            state:    (r['State'] || '').trim(),
            pincode:  (r['Pincode'] || '').trim(),
          },
          principal: {
            name:  (r['Principal Name'] || '').trim(),
            email: (r['Principal Email'] || '').trim(),
            phone: (r['Principal Phone'] || '').trim(),
          },
          assignedAdmin: null,
          currentStatus: 'New',
        });

        const password = randomPassword();
        const schoolUser = await User.create({
          name:     schoolName,
          email,
          password,
          role:     'school_user',
          phone:    (r['Phone'] || '').trim(),
          isActive: true,
        });
        school.schoolUser = schoolUser._id;
        await school.save();

        await SchoolStatusHistory.create({
          school:        school._id,
          oldStatus:     null,
          newStatus:     'New',
          updatedBy:     req.user._id,
          updatedByRole: req.user.role,
          remarks:       'School created via bulk import',
        });

        await logAudit({
          school:      school._id,
          eventType:   'School Created',
          performedBy: req.user,
          description: `School "${schoolName}" created via bulk import`,
          req,
        });

        created.push({ row: rowNum, schoolName, schoolId: school._id, loginEmail: email, password });
      } catch (rowErr) {
        skipped.push({ row: rowNum, schoolName, reason: rowErr.message || 'Failed to create school.' });
      }
    }

    await logActivity({
      user:        req.user,
      action:      'School Created',
      description: `Bulk-imported ${created.length} school(s) from ${req.file.originalname}${skipped.length ? ` (${skipped.length} skipped)` : ''}`,
      req,
    });

    res.status(200).json({ success: true, created, skipped });
  } catch (err) {
    console.error('importSchoolsBulk error:', err);
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: 'Server error during import.' });
  }
};

// ── @GET /api/schools ─────────────────────────────────────────────────────────
// SuperAdmin — all schools | Admin — assigned schools only | School User — own school
const getSchools = async (req, res) => {
  try {
    const {
      page = 1, limit = 10,
      status, search, assignedAdmin,
      city, state, district,
      sortBy = 'createdAt', order = 'desc',
      isArchived,
      activity,
    } = req.query;

    const filter = {};

    // Role-based scoping
    if (req.user.role === 'admin') {
      filter.assignedAdmin = req.user._id;
    } else if (req.user.role === 'school_user') {
      filter.schoolUser = req.user._id;
    }

    // Filters
    if (status)        filter.currentStatus = status;
    if (assignedAdmin) filter.assignedAdmin = assignedAdmin;
    if (city)          filter['address.city']     = new RegExp(city, 'i');
    if (state)         filter['address.state']    = new RegExp(state, 'i');
    if (district)      filter['address.district'] = new RegExp(district, 'i');

    // Activity filter — from the school's Activity tab (LOI Received, DCAIS Participated, etc.)
    // `activity` is a comma-separated list of "field:value" pairs, e.g. "loiReceived:Yes,hackathonRegistered:No".
    // Multiple values for the same field are OR'd ($in); different fields are AND'd (both must match).
    const ACTIVITY_FIELDS = ['loiReceived', 'dcaisConfirmation', 'studentDataReceived', 'teachersDataReceived', 'hackathonRegistered', 'poeSubmitted'];
    if (activity) {
      const grouped = {};
      activity.split(',').forEach(pair => {
        const [field, value] = pair.split(':');
        if (ACTIVITY_FIELDS.includes(field) && ['Yes', 'No'].includes(value)) {
          grouped[field] = grouped[field] || new Set();
          grouped[field].add(value);
        }
      });
      Object.entries(grouped).forEach(([field, values]) => {
        const arr = Array.from(values);
        filter[field] = arr.length > 1 ? { $in: arr } : arr[0];
      });
    }

    // Archived filter
    if (isArchived === 'true')  filter.isArchived = true;
    else if (isArchived === 'false') filter.isArchived = false;

    // Text search
    if (search) {
      filter.$or = [
        { schoolName:         new RegExp(search, 'i') },
        { email:              new RegExp(search, 'i') },
        { phone:              new RegExp(search, 'i') },
        { udiseCode:          new RegExp(search, 'i') },
        { 'address.city':     new RegExp(search, 'i') },
        { 'address.state':    new RegExp(search, 'i') },
        { 'address.district': new RegExp(search, 'i') },
      ];
    }

    const skip      = (Number(page) - 1) * Number(limit);
    const sortOrder = order === 'asc' ? 1 : -1;

    const [schools, total] = await Promise.all([
      School.find(filter)
        .populate('assignedAdmin', 'name email phone')
        .populate('schoolUser',    'name email')
        .sort({ [sortBy]: sortOrder })
        .skip(skip)
        .limit(Number(limit)),
      School.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      total,
      page:       Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      count:      schools.length,
      schools,
    });
  } catch (err) {
    console.error('getSchools error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @GET /api/schools/:id ─────────────────────────────────────────────────────
// Get full school profile
const getSchoolById = async (req, res) => {
  try {
    const school = await School.findById(req.params.id)
      .populate('assignedAdmin', 'name email phone photo')
      .populate('schoolUser',    'name email phone photo');

    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found.' });
    }

    res.status(200).json({ success: true, school });
  } catch (err) {
    console.error('getSchoolById error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @PUT /api/schools/:id ─────────────────────────────────────────────────────
// SuperAdmin + Admin — update school profile fields
const updateSchool = async (req, res) => {
  try {
    const school = await School.findById(req.params.id);
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found.' });
    }

    // Fields that are NEVER updatable via this endpoint
    const blocked = ['currentStatus', 'assignedAdmin', 'schoolUser', 'isDeleted', 'isArchived'];
    blocked.forEach((f) => delete req.body[f]);

    // School user can only update their own profile fields — not admin-only fields
    if (req.user.role === 'school_user') {
      const allowedForSchool = ['schoolName', 'udiseCode', 'email', 'phone', 'altPhone', 'website',
        'address', 'principal', 'management', 'studentCount', 'staffCount', 'logo', 'poeSubmitted',
        'board', 'schoolType', 'spoc', 'spocPhone', 'spocEmail'];
      Object.keys(req.body).forEach(key => {
        if (!allowedForSchool.includes(key)) delete req.body[key];
      });
    }

    // Optional enum selects arrive as '' when nothing is chosen — a value the
    // enum validator rejects. Treat '' as "clear this field" instead of failing.
    const unset = {};
    ['schoolType', 'cpdTrainingLevel'].forEach((f) => {
      if (req.body[f] === '') {
        delete req.body[f];
        if (school[f] !== undefined) unset[f] = 1;
      }
    });

    // Track changes for audit
    const changes = {};
    Object.keys(req.body).forEach((key) => {
      if (JSON.stringify(school[key]) !== JSON.stringify(req.body[key])) {
        changes[key] = { from: school[key], to: req.body[key] };
      }
    });

    const updated = await School.findByIdAndUpdate(
      req.params.id,
      Object.keys(unset).length ? { $set: req.body, $unset: unset } : { $set: req.body },
      { runValidators: true, returnDocument: 'after' }
    ).populate('assignedAdmin', 'name email');

    // Audit log
    await logAudit({
      school:       school._id,
      eventType:    'School Created', // reuse — no "School Updated" event in scope doc
      performedBy:  req.user,
      description:  `School "${school.schoolName}" profile updated`,
      previousValue: changes,
      newValue:      req.body,
      req,
    });

    await logActivity({
      user:          req.user,
      action:        'School Updated',
      description:   `Updated school: ${school.schoolName}`,
      relatedSchool: school._id,
      req,
    });

    res.status(200).json({ success: true, school: updated });
  } catch (err) {
    console.error('updateSchool error:', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: Object.values(err.errors).map(e => e.message).join(' ') });
    }
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @POST /api/schools/:id/logo ───────────────────────────────────────────────
// SuperAdmin + Admin + own School user — upload/replace the school logo
const uploadLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No logo file uploaded.' });
    }

    const school = await School.findById(req.params.id);
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found.' });
    }

    school.logo = `/uploads/logos/${req.file.filename}`;
    await school.save();

    res.status(200).json({ success: true, school });
  } catch (err) {
    console.error('uploadLogo error:', err);
    res.status(500).json({ success: false, message: 'Server error while uploading logo.' });
  }
};

// ── @PUT /api/schools/:id/status ─────────────────────────────────────────────
// SuperAdmin + Admin — update school status (immutable history logged)
const updateSchoolStatus = async (req, res) => {
  try {
    const { newStatus, remarks, reason } = req.body;

    if (!newStatus) {
      return res.status(400).json({ success: false, message: 'newStatus is required.' });
    }

    const school = await School.findById(req.params.id);
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found.' });
    }

    const oldStatus = school.currentStatus;

    if (oldStatus === newStatus) {
      return res.status(400).json({
        success: false,
        message: `School is already in "${newStatus}" status.`,
      });
    }

    // Update current status
    school.currentStatus = newStatus;
    await school.save();

    // Immutable status history — scope doc requirement
    await SchoolStatusHistory.create({
      school:        school._id,
      oldStatus,
      newStatus,
      updatedBy:     req.user._id,
      updatedByRole: req.user.role,
      remarks,
      reason,
    });

    // Audit log
    await logAudit({
      school:        school._id,
      eventType:     'Status Changed',
      performedBy:   req.user,
      field:         'currentStatus',
      previousValue: oldStatus,
      newValue:      newStatus,
      description:   `Status changed from "${oldStatus}" to "${newStatus}"`,
      remarks,
      req,
    });

    // Activity log
    await logActivity({
      user:          req.user,
      action:        'Status Changed',
      description:   `Changed ${school.schoolName} status: ${oldStatus} → ${newStatus}`,
      relatedSchool: school._id,
      req,
    });

    // Real-time + email notification to the school user
    await notifyStatusUpdate({
      school,
      oldStatus,
      newStatus,
      remarks,
      updatedBy: req.user,
      io: req.app.get('io'),
    });

    // Notify via Socket.io
    req.app.get('io')?.to(`school_${school._id}`).emit('status_updated', {
      schoolId:  school._id,
      oldStatus,
      newStatus,
      updatedBy: req.user.name,
    });

    res.status(200).json({
      success: true,
      message: `Status updated to "${newStatus}"`,
      school: {
        _id:           school._id,
        schoolName:    school.schoolName,
        currentStatus: newStatus,
      },
    });
  } catch (err) {
    console.error('updateSchoolStatus error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @PUT /api/schools/:id/assign-admin ───────────────────────────────────────
// SuperAdmin only — assign or reassign an admin to a school
const assignAdmin = async (req, res) => {
  try {
    const { adminId } = req.body;

    if (!adminId) {
      return res.status(400).json({ success: false, message: 'adminId is required.' });
    }

    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'admin') {
      return res.status(404).json({ success: false, message: 'Admin user not found.' });
    }

    const school = await School.findById(req.params.id);
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found.' });
    }

    const previousAdmin = school.assignedAdmin;

    school.assignedAdmin = adminId;
    await school.save();

    // Audit log
    await logAudit({
      school:        school._id,
      eventType:     'Admin Changed',
      performedBy:   req.user,
      field:         'assignedAdmin',
      previousValue: previousAdmin,
      newValue:      adminId,
      description:   `Admin assigned to "${school.schoolName}": ${admin.name}`,
      req,
    });

    await logActivity({
      user:          req.user,
      action:        'Admin Assigned',
      description:   `Assigned ${admin.name} to school: ${school.schoolName}`,
      relatedSchool: school._id,
      relatedUser:   adminId,
      req,
    });

    // Real-time + email notification to the newly assigned admin
    await notifyAdminAssigned({
      school,
      admin,
      assignedBy: req.user,
      io: req.app.get('io'),
    });

    const updated = await School.findById(school._id)
      .populate('assignedAdmin', 'name email phone');

    res.status(200).json({
      success: true,
      message: `Admin "${admin.name}" assigned to "${school.schoolName}"`,
      school:  updated,
    });
  } catch (err) {
    console.error('assignAdmin error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @PUT /api/schools/:id/archive ─────────────────────────────────────────────
// SuperAdmin only — archive a school (soft, never deleted)
const archiveSchool = async (req, res) => {
  try {
    const { remarks } = req.body;

    const school = await School.findById(req.params.id);
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found.' });
    }

    if (school.isArchived) {
      return res.status(400).json({ success: false, message: 'School is already archived.' });
    }

    // Archive via plugin method
    await school.archive(req.user._id);

    // Update status to Archived
    const oldStatus = school.currentStatus;
    school.currentStatus = 'Archived';
    await school.save();

    await SchoolStatusHistory.create({
      school:        school._id,
      oldStatus,
      newStatus:     'Archived',
      updatedBy:     req.user._id,
      updatedByRole: req.user.role,
      remarks:       remarks || 'School archived',
    });

    await logAudit({
      school:       school._id,
      eventType:    'Archived',
      performedBy:  req.user,
      description:  `School "${school.schoolName}" archived`,
      remarks,
      req,
    });

    await logActivity({
      user:          req.user,
      action:        'School Archived',
      description:   `Archived school: ${school.schoolName}`,
      relatedSchool: school._id,
      req,
    });

    res.status(200).json({
      success: true,
      message: `School "${school.schoolName}" has been archived.`,
    });
  } catch (err) {
    console.error('archiveSchool error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @GET /api/schools/:id/status-history ─────────────────────────────────────
// Full immutable status timeline for a school
const getStatusHistory = async (req, res) => {
  try {
    const history = await SchoolStatusHistory.find({ school: req.params.id })
      .populate('updatedBy', 'name email role')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: history.length, history });
  } catch (err) {
    console.error('getStatusHistory error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @GET /api/schools/:id/audit-trail ────────────────────────────────────────
// Full audit trail for a school
const getAuditTrail = async (req, res) => {
  try {
    const { page = 1, limit = 20, eventType } = req.query;
    const filter = { school: req.params.id };
    if (eventType) filter.eventType = eventType;

    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('performedBy', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      AuditLog.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      total,
      page:       Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      logs,
    });
  } catch (err) {
    console.error('getAuditTrail error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @POST /api/schools/:id/notes ──────────────────────────────────────────────
// SuperAdmin + Admin — add internal note to a school
const addNote = async (req, res) => {
  try {
    const { note } = req.body;
    if (!note) {
      return res.status(400).json({ success: false, message: 'Note content is required.' });
    }

    const school = await School.findById(req.params.id);
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found.' });
    }

    school.internalNotes.unshift({
      note,
      addedBy: req.user._id,
      addedAt: new Date(),
    });
    await school.save();

    await logActivity({
      user:          req.user,
      action:        'Note Added',
      description:   `Added note to school: ${school.schoolName}`,
      relatedSchool: school._id,
      req,
    });

    res.status(200).json({
      success: true,
      message: 'Note added.',
      notes:   school.internalNotes,
    });
  } catch (err) {
    console.error('addNote error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @GET /api/schools/stats ───────────────────────────────────────────────────
// SuperAdmin — platform-wide stats for dashboard
const getStats = async (req, res) => {
  try {
    const filter = {};
    if (req.user.role === 'admin') filter.assignedAdmin = req.user._id;

    const [
      total,
      byStatus,
      byState,
      recentSchools,
      totalAdmins,
      hackathonParticipated,
      dcaisReceived,
    ] = await Promise.all([
      School.countDocuments(filter),
      School.aggregate([
        { $match: { ...filter, isDeleted: false } },
        { $group: { _id: '$currentStatus', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      School.aggregate([
        { $match: { ...filter, isDeleted: false } },
        { $group: { _id: '$address.state', count: { $sum: 1 } } },
      ]),
      School.find(filter)
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('assignedAdmin', 'name'),
      User.countDocuments({ role: 'admin', isDeleted: false }),
      School.countDocuments({ ...filter, isDeleted: false, hackathonRegistered: 'Yes' }),
      School.countDocuments({ ...filter, isDeleted: false, dcaisConfirmation: 'Yes' }),
    ]);

    // Format status/state counts into objects
    const statusCounts = byStatus.reduce((acc, s) => {
      acc[s._id] = s.count;
      return acc;
    }, {});
    // Normalise casing/whitespace so "Rajasthan" and "rajasthan" group together
    const stateCounts = byState.reduce((acc, s) => {
      const raw = (s._id || '').toString().trim().replace(/\s+/g, ' ');
      const label = (!raw || raw.toLowerCase() === 'not set')
        ? 'Not set'
        : raw.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
      acc[label] = (acc[label] || 0) + s.count;
      return acc;
    }, {});

    res.status(200).json({
      success: true,
      stats: {
        total,
        statusCounts,
        stateCounts,
        recentSchools,
        totalAdmins,
        hackathonParticipated,
        dcaisReceived,
      },
    });
  } catch (err) {
    console.error('getStats error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @PUT /api/schools/:id/reset-login-password ───────────────────────────────
// Admin/SuperAdmin resets the school portal login password
const resetSchoolPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ success: false, message: 'School not found.' });
    if (!school.schoolUser) return res.status(400).json({ success: false, message: 'This school has no portal login account yet.' });

    const schoolUser = await User.findById(school.schoolUser).select('+password');
    if (!schoolUser) return res.status(404).json({ success: false, message: 'School login account not found.' });

    schoolUser.password = newPassword;
    await schoolUser.save();

    await logActivity({
      user:          req.user,
      action:        'Password Changed',
      description:   `Reset portal login password for school: ${school.schoolName}`,
      relatedSchool: school._id,
      req,
    });

    // Notify the school user their portal password was reset
    await notifyPasswordChanged({ user: schoolUser, io: req.app.get('io') });

    res.status(200).json({ success: true, message: 'School login password reset successfully.' });
  } catch (err) {
    console.error('resetSchoolPassword error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @POST /api/schools/:id/create-login ───────────────────────────────────────
// Create a portal login for a school that doesn't have one yet
const createSchoolLogin = async (req, res) => {
  try {
    const { loginEmail, loginPassword } = req.body;

    if (!loginEmail || !loginPassword) {
      return res.status(400).json({ success: false, message: 'Login email and password are required.' });
    }
    if (loginPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ success: false, message: 'School not found.' });
    if (school.schoolUser) return res.status(400).json({ success: false, message: 'This school already has a portal login account.' });

    const existingUser = await User.findOne({ email: loginEmail.toLowerCase().trim() });
    if (existingUser) return res.status(400).json({ success: false, message: 'A user account with this email already exists.' });

    const schoolUser = await User.create({
      name:     school.schoolName,
      email:    loginEmail.toLowerCase().trim(),
      password: loginPassword,
      role:     'school_user',
      phone:    school.phone,
      isActive: true,
    });

    school.schoolUser = schoolUser._id;
    await school.save();

    await logActivity({
      user:          req.user,
      action:        'School Created',
      description:   `Created portal login for school: ${school.schoolName} (${schoolUser.email})`,
      relatedSchool: school._id,
      req,
    });

    res.status(201).json({ success: true, message: 'School login created successfully.', loginEmail: schoolUser.email });
  } catch (err) {
    console.error('createSchoolLogin error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @GET /api/schools/students-activity/template ──────────────────────────────
// Blank .xlsx with the bulk-import columns for Students Activity
const downloadStudentsActivityTemplate = (req, res) => {
  try {
    const XLSX = require('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([STUDENTS_ACTIVITY_SCHEMA.columns]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Students_Activity_Template.xlsx"');
    res.send(buffer);
  } catch (err) {
    console.error('downloadStudentsActivityTemplate error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @POST /api/schools/:id/students-activity/import ───────────────────────────
// Bulk-add students to a school's Students Activity from a CSV/XLS/XLSX file
const importStudentsActivity = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const school = await School.findById(req.params.id);
    if (!school) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: 'School not found.' });
    }

    let parsed;
    try {
      parsed = await parseFile(req.file.path);
    } catch (parseErr) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: `File parse error: ${parseErr.message}` });
    }

    const validation = validateAgainstSchema(parsed, STUDENTS_ACTIVITY_SCHEMA);
    fs.unlinkSync(req.file.path);

    if (validation.missing?.length) {
      return res.status(400).json({ success: false, message: validation.errors[0] });
    }
    if (validation.validRows === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid rows found in file.',
        errors: validation.errors.slice(0, 20),
      });
    }

    const toBool = (v) => ['yes', 'y', 'true', '1'].includes(String(v ?? '').trim().toLowerCase());

    const newStudents = validation.rows.map(r => ({
      name:       r['Student Name'] || '',
      class:      r['Class']        || '',
      section:    r['Section']      || '',
      fiscalYear: r['Fiscal Year']  || '',
      mauQuarterly: {
        q1: toBool(r['MAU Q1']), q2: toBool(r['MAU Q2']), q3: toBool(r['MAU Q3']), q4: toBool(r['MAU Q4']),
      },
      dcaisMonthly: {
        jan: toBool(r['DCAIS Jan']), feb: toBool(r['DCAIS Feb']), mar: toBool(r['DCAIS Mar']), apr: toBool(r['DCAIS Apr']),
        may: toBool(r['DCAIS May']), jun: toBool(r['DCAIS Jun']), jul: toBool(r['DCAIS Jul']), aug: toBool(r['DCAIS Aug']),
        sep: toBool(r['DCAIS Sep']), oct: toBool(r['DCAIS Oct']), nov: toBool(r['DCAIS Nov']), dec: toBool(r['DCAIS Dec']),
      },
      hackathonParticipated: toBool(r['Annual Hackathon Participated']),
      certificateReceived:   toBool(r['Certificate Received']),
      certificateLink:       r['Certificate Link'] || '',
    }));

    school.studentsActivity.push(...newStudents);
    await school.save();

    await AuditLog.create({
      school:          school._id,
      eventType:       'Students Activity Imported',
      performedBy:     req.user._id,
      performedByRole: req.user.role,
      description:     `Bulk-imported ${newStudents.length} student(s) from ${req.file.originalname}`,
      ipAddress:       req.ip,
    });

    await logActivity({
      user:          req.user,
      action:        'Students Activity Imported',
      description:   `Imported ${newStudents.length} student(s) into Students Activity for: ${school.schoolName}`,
      relatedSchool: school._id,
      req,
    });

    res.status(200).json({
      success: true,
      added:   newStudents.length,
      skipped: validation.errors.length,
      errors:  validation.errors.slice(0, 20),
      school,
    });
  } catch (err) {
    console.error('importStudentsActivity error:', err);
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: 'Server error during import.' });
  }
};

// ── @GET /api/schools/teachers-activity/template ───────────────────────────────
// Blank .xlsx with the bulk-import columns for Teachers Activity
const downloadTeachersActivityTemplate = (req, res) => {
  try {
    const XLSX = require('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([TEACHERS_ACTIVITY_SCHEMA.columns]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Teachers_Activity_Template.xlsx"');
    res.send(buffer);
  } catch (err) {
    console.error('downloadTeachersActivityTemplate error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @POST /api/schools/:id/teachers-activity/import ────────────────────────────
// Bulk-add teachers to a school's Teachers Activity from a CSV/XLS/XLSX file
const importTeachersActivity = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const school = await School.findById(req.params.id);
    if (!school) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ success: false, message: 'School not found.' });
    }

    let parsed;
    try {
      parsed = await parseFile(req.file.path);
    } catch (parseErr) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: `File parse error: ${parseErr.message}` });
    }

    const validation = validateAgainstSchema(parsed, TEACHERS_ACTIVITY_SCHEMA);
    fs.unlinkSync(req.file.path);

    if (validation.missing?.length) {
      return res.status(400).json({ success: false, message: validation.errors[0] });
    }
    if (validation.validRows === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid rows found in file.',
        errors: validation.errors.slice(0, 20),
      });
    }

    const toBool = (v) => ['yes', 'y', 'true', '1'].includes(String(v ?? '').trim().toLowerCase());

    const newTeachers = validation.rows.map(r => ({
      name:       r['Teacher Name'] || '',
      fiscalYear: r['Fiscal Year']  || '',
      cpdQuarterly: {
        q1: toBool(r['CPD Q1']), q2: toBool(r['CPD Q2']), q3: toBool(r['CPD Q3']), q4: toBool(r['CPD Q4']),
      },
      dcaisMonthly: {
        jan: toBool(r['DCAIS Jan']), feb: toBool(r['DCAIS Feb']), mar: toBool(r['DCAIS Mar']), apr: toBool(r['DCAIS Apr']),
        may: toBool(r['DCAIS May']), jun: toBool(r['DCAIS Jun']), jul: toBool(r['DCAIS Jul']), aug: toBool(r['DCAIS Aug']),
        sep: toBool(r['DCAIS Sep']), oct: toBool(r['DCAIS Oct']), nov: toBool(r['DCAIS Nov']), dec: toBool(r['DCAIS Dec']),
      },
      certificateReceived: toBool(r['Certificate Received']),
      certificateLink:     r['Certificate Link'] || '',
    }));

    school.teachersActivity.push(...newTeachers);
    await school.save();

    await AuditLog.create({
      school:          school._id,
      eventType:       'Teachers Activity Imported',
      performedBy:     req.user._id,
      performedByRole: req.user.role,
      description:     `Bulk-imported ${newTeachers.length} teacher(s) from ${req.file.originalname}`,
      ipAddress:       req.ip,
    });

    await logActivity({
      user:          req.user,
      action:        'Teachers Activity Imported',
      description:   `Imported ${newTeachers.length} teacher(s) into Teachers Activity for: ${school.schoolName}`,
      relatedSchool: school._id,
      req,
    });

    res.status(200).json({
      success: true,
      added:   newTeachers.length,
      skipped: validation.errors.length,
      errors:  validation.errors.slice(0, 20),
      school,
    });
  } catch (err) {
    console.error('importTeachersActivity error:', err);
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: 'Server error during import.' });
  }
};

module.exports = {
  createSchool,
  downloadSchoolsBulkTemplate,
  importSchoolsBulk,
  getSchools,
  getSchoolById,
  updateSchool,
  uploadLogo,
  updateSchoolStatus,
  assignAdmin,
  archiveSchool,
  getStatusHistory,
  getAuditTrail,
  addNote,
  getStats,
  resetSchoolPassword,
  createSchoolLogin,
  downloadStudentsActivityTemplate,
  importStudentsActivity,
  downloadTeachersActivityTemplate,
  importTeachersActivity,
};
