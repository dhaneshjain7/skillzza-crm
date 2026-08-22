const { School, User, AuditLog, ActivityLog, Message, Document, SchoolStatusHistory } = require('../models');

// ── Helper: CSV generator ─────────────────────────────────────────────────────
const toCSV = (headers, rows) => {
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const str = String(v).replace(/"/g, '""');
    return str.includes(',') || str.includes('\n') || str.includes('"') ? `"${str}"` : str;
  };
  const lines = [
    headers.join(','),
    ...rows.map(row => headers.map(h => escape(row[h])).join(',')),
  ];
  return lines.join('\n');
};

// ── Helper: send CSV ──────────────────────────────────────────────────────────
const sendCSV = (res, filename, headers, rows) => {
  const csv = toCSV(headers, rows);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.send(csv);
};

// ── Helper: send JSON (for Excel — frontend converts) ────────────────────────
const sendJSON = (res, data) => res.json({ success: true, ...data });

// ── @GET /api/reports/schools ─────────────────────────────────────────────────
// Super Admin — all schools with full details
const schoolsReport = async (req, res) => {
  try {
    const { format = 'json', status, state, board, fromDate, toDate } = req.query;
    const filter = {};

    if (req.user.role === 'admin') filter.assignedAdmin = req.user._id;
    if (status)  filter.currentStatus   = status;
    if (state)   filter['address.state']= new RegExp(state, 'i');
    if (board)   filter.board           = new RegExp(board, 'i');
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = new Date(fromDate);
      if (toDate)   filter.createdAt.$lte = new Date(toDate);
    }

    const schools = await School.find(filter)
      .populate('assignedAdmin', 'name email phone')
      .sort({ createdAt: -1 });

    const rows = schools.map((s, i) => ({
      'SL No':          i + 1,
      'School Name':    s.schoolName,
      'UDISE Code':     s.udiseCode || '',
      'Email':          s.email,
      'Phone':          s.phone,
      'City':           s.address?.city || '',
      'District':       s.address?.district || '',
      'State':          s.address?.state || '',
      'Pincode':        s.address?.pincode || '',
      'Board':          s.board || '',
      'Type':           s.schoolType || '',
      'Status':         s.currentStatus,
      'Assigned Admin': s.assignedAdmin?.name || 'Unassigned',
      'Admin Email':    s.assignedAdmin?.email || '',
      'Principal':      s.principal?.name || '',
      'Principal Email':s.principal?.email || '',
      'Student Count':  s.studentCount || '',
      'Staff Count':    s.staffCount || '',
      'Profile %':      s.profileCompletion || 0,
      'Created Date':   new Date(s.createdAt).toLocaleDateString('en-IN'),
      'Last Updated':   new Date(s.updatedAt).toLocaleDateString('en-IN'),
    }));

    const summary = {
      totalSchools: schools.length,
      byStatus:     groupBy(schools, 'currentStatus'),
      byState:      groupBy(schools, s => s.address?.state || 'Unknown'),
      byBoard:      groupBy(schools, 'board'),
      generatedAt:  new Date().toISOString(),
      generatedBy:  req.user.name,
    };

    if (format === 'csv') {
      return sendCSV(res, 'schools_report', Object.keys(rows[0] || {}), rows);
    }

    sendJSON(res, { report: 'Schools Report', summary, rows });
  } catch (err) {
    console.error('schoolsReport error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @GET /api/reports/status ──────────────────────────────────────────────────
// Status distribution report
const statusReport = async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    const filter = {};
    if (req.user.role === 'admin') filter.assignedAdmin = req.user._id;

    const [statusCounts, recentChanges] = await Promise.all([
      School.aggregate([
        { $match: { ...filter, isDeleted: false } },
        { $group: { _id: '$currentStatus', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      SchoolStatusHistory.find({})
        .populate('school',    'schoolName')
        .populate('updatedBy', 'name role')
        .sort({ createdAt: -1 })
        .limit(50),
    ]);

    const total = statusCounts.reduce((sum, s) => sum + s.count, 0);

    const rows = statusCounts.map(s => ({
      'Status':     s._id,
      'Count':      s.count,
      'Percentage': total ? `${((s.count / total) * 100).toFixed(1)}%` : '0%',
    }));

    const historyRows = recentChanges.map(h => ({
      'School':      h.school?.schoolName || '',
      'Old Status':  h.oldStatus || 'New',
      'New Status':  h.newStatus,
      'Changed By':  h.updatedBy?.name || '',
      'Role':        h.updatedByRole || '',
      'Remarks':     h.remarks || '',
      'Date':        new Date(h.createdAt).toLocaleString('en-IN'),
    }));

    if (format === 'csv') {
      return sendCSV(res, 'status_report', Object.keys(rows[0] || {}), rows);
    }

    sendJSON(res, {
      report:  'Status Report',
      summary: { total, statusCounts: statusCounts.map(s => ({ status: s._id, count: s.count })) },
      rows,
      historyRows,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('statusReport error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @GET /api/reports/growth ──────────────────────────────────────────────────
// Monthly growth report — schools added per month
const growthReport = async (req, res) => {
  try {
    const { format = 'json', months = 12 } = req.query;
    const numMonths = Number(months);

    const from = new Date();
    from.setMonth(from.getMonth() - (numMonths - 1));
    from.setDate(1);
    from.setHours(0, 0, 0, 0);

    const filter = { createdAt: { $gte: from }, isDeleted: false };
    if (req.user.role === 'admin') filter.assignedAdmin = req.user._id;

    const monthly = await School.aggregate([
      { $match: filter },
      {
        $group: {
          _id: {
            year:  { $year:  '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count:     { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$currentStatus', 'Completed'] }, 1, 0] } },
          rejected:  { $sum: { $cond: [{ $eq: ['$currentStatus', 'Rejected'] }, 1, 0] } },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    // Build a lookup for months that have data
    const dataByKey = {};
    monthly.forEach(m => {
      dataByKey[`${m._id.year}-${m._id.month}`] = m;
    });

    // Generate a continuous sequence of months from `from` to now, filling zeros where no data exists
    const rows = [];
    const cursor = new Date(from);
    const now = new Date();
    while (cursor <= now) {
      const year  = cursor.getFullYear();
      const month = cursor.getMonth() + 1;
      const key   = `${year}-${month}`;
      const m     = dataByKey[key];

      rows.push({
        'Year':      year,
        'Month':     MONTHS[month - 1],
        'Added':     m?.count     || 0,
        'Completed': m?.completed || 0,
        'Rejected':  m?.rejected  || 0,
      });

      cursor.setMonth(cursor.getMonth() + 1);
    }

    if (format === 'csv') {
      return sendCSV(res, 'growth_report', Object.keys(rows[0] || {}), rows);
    }

    sendJSON(res, {
      report:      'Growth Report',
      period:      `Last ${months} months`,
      rows,
      totalAdded:  rows.reduce((s, r) => s + r['Added'], 0),
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('growthReport error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @GET /api/reports/admin-performance ──────────────────────────────────────
// Super Admin only — admin performance report
const adminPerformanceReport = async (req, res) => {
  try {
    const { format = 'json' } = req.query;

    const admins = await User.find({ role: 'admin', isDeleted: false });

    const rows = await Promise.all(admins.map(async (admin) => {
      const [total, completed, pending, messages] = await Promise.all([
        School.countDocuments({ assignedAdmin: admin._id }),
        School.countDocuments({ assignedAdmin: admin._id, currentStatus: 'Completed' }),
        School.countDocuments({ assignedAdmin: admin._id, currentStatus: { $in: ['LOI Pending', 'Verification', 'Data Requested', 'Data Received'] } }),
        Message.countDocuments({ sender: admin._id }),
      ]);

      return {
        'Admin Name':       admin.name,
        'Email':            admin.email,
        'Phone':            admin.phone || '',
        'Total Schools':    total,
        'Completed':        completed,
        'Pending':          pending,
        'Messages Sent':    messages,
        'Completion Rate':  total ? `${((completed / total) * 100).toFixed(1)}%` : '0%',
        'Last Login':       admin.lastLogin ? new Date(admin.lastLogin).toLocaleDateString('en-IN') : 'Never',
        'Status':           admin.isActive ? 'Active' : 'Inactive',
        'Joined':           new Date(admin.createdAt).toLocaleDateString('en-IN'),
      };
    }));

    if (format === 'csv') {
      return sendCSV(res, 'admin_performance', Object.keys(rows[0] || {}), rows);
    }

    sendJSON(res, {
      report:      'Admin Performance Report',
      totalAdmins: admins.length,
      rows,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('adminPerformanceReport error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @GET /api/reports/communication ──────────────────────────────────────────
// Communication report — messages per school
const communicationReport = async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    const filter = {};
    if (req.user.role === 'admin') filter.assignedAdmin = req.user._id;

    const schools = await School.find(filter).populate('assignedAdmin', 'name');

    const rows = await Promise.all(schools.map(async (school) => {
      const [total, unread, lastMsg] = await Promise.all([
        Message.countDocuments({ school: school._id }),
        Message.countDocuments({ school: school._id, isRead: false }),
        Message.findOne({ school: school._id }).sort({ createdAt: -1 }),
      ]);

      return {
        'School Name':    school.schoolName,
        'City':           school.address?.city || '',
        'State':          school.address?.state || '',
        'Status':         school.currentStatus,
        'Assigned Admin': school.assignedAdmin?.name || 'Unassigned',
        'Total Messages': total,
        'Unread':         unread,
        'Last Message':   lastMsg ? new Date(lastMsg.createdAt).toLocaleDateString('en-IN') : 'No messages',
      };
    }));

    if (format === 'csv') {
      return sendCSV(res, 'communication_report', Object.keys(rows[0] || {}), rows);
    }

    sendJSON(res, {
      report:         'Communication Report',
      totalMessages:  rows.reduce((s, r) => s + r['Total Messages'], 0),
      rows,
      generatedAt:    new Date().toISOString(),
    });
  } catch (err) {
    console.error('communicationReport error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @GET /api/reports/audit-trail ────────────────────────────────────────────
// Full audit trail — searchable, filterable
const auditTrailReport = async (req, res) => {
  try {
    const { schoolId, eventType, fromDate, toDate, page = 1, limit = 50, format = 'json' } = req.query;

    const filter = {};
    // Admins see events on their assigned schools plus their own actions
    if (req.user.role === 'admin') {
      const assigned = await School.find({ assignedAdmin: req.user._id }).select('_id');
      filter.$or = [
        { school:      { $in: assigned.map(s => s._id) } },
        { performedBy: req.user._id },
      ];
    }
    if (schoolId)  filter.school    = schoolId;
    if (eventType) filter.eventType = eventType;
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = new Date(fromDate);
      if (toDate)   filter.createdAt.$lte = new Date(toDate);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('school',      'schoolName address')
        .populate('performedBy', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      AuditLog.countDocuments(filter),
    ]);

    const rows = logs.map(l => ({
      'Date':         new Date(l.createdAt).toLocaleString('en-IN'),
      'School':       l.school?.schoolName || '',
      'Event':        l.eventType,
      'Performed By': l.performedBy?.name || '',
      'Role':         l.performedByRole || '',
      'Field':        l.field || '',
      'Previous':     l.previousValue ? String(l.previousValue) : '',
      'New Value':    l.newValue ? String(l.newValue) : '',
      'Description':  l.description || '',
      'Remarks':      l.remarks || '',
      'IP Address':   l.ipAddress || '',
    }));

    if (format === 'csv') {
      return sendCSV(res, 'audit_trail', Object.keys(rows[0] || {}), rows);
    }

    sendJSON(res, {
      report:     'Audit Trail',
      total,
      page:       Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      rows,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('auditTrailReport error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @GET /api/reports/activity-logs ──────────────────────────────────────────
const activityLogsReport = async (req, res) => {
  try {
    const { page = 1, limit = 50, action, userId, fromDate, toDate, format = 'json' } = req.query;

    const filter = {};
    // Admins see their own actions plus any activity on their assigned schools
    if (req.user.role === 'admin') {
      const assigned = await School.find({ assignedAdmin: req.user._id }).select('_id');
      filter.$or = [
        { user:          req.user._id },
        { relatedSchool: { $in: assigned.map(s => s._id) } },
      ];
    }
    if (action)   filter.action    = action;
    if (userId && req.user.role !== 'admin') filter.user = userId;
    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = new Date(fromDate);
      if (toDate)   filter.createdAt.$lte = new Date(toDate);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [logs, total] = await Promise.all([
      ActivityLog.find(filter)
        .populate('user',          'name email role')
        .populate('relatedSchool', 'schoolName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      ActivityLog.countDocuments(filter),
    ]);

    const rows = logs.map(l => ({
      'Date':        new Date(l.createdAt).toLocaleString('en-IN'),
      'User':        l.user?.name || '',
      'Role':        l.userRole || '',
      'Action':      l.action,
      'Description': l.description || '',
      'School':      l.relatedSchool?.schoolName || '',
      'IP Address':  l.ipAddress || '',
      'Browser':     l.browser?.substring(0, 50) || '',
    }));

    if (format === 'csv') {
      return sendCSV(res, 'activity_logs', Object.keys(rows[0] || {}), rows);
    }

    sendJSON(res, {
      report:     'Activity Logs',
      total,
      page:       Number(page),
      totalPages: Math.ceil(total / Number(limit)),
      rows,
    });
  } catch (err) {
    console.error('activityLogsReport error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── Helper ────────────────────────────────────────────────────────────────────
const groupBy = (arr, key) => {
  return arr.reduce((acc, item) => {
    const k = typeof key === 'function' ? key(item) : (item[key] || 'Unknown');
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
};

module.exports = {
  schoolsReport,
  statusReport,
  growthReport,
  adminPerformanceReport,
  communicationReport,
  auditTrailReport,
  activityLogsReport,
};
