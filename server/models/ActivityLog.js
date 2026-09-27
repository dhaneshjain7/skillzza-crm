const mongoose = require('mongoose');

// ── Immutable — activity logs are never deleted or archived ───────────────────
// No softDelete plugin on this model.

const activityLogSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userRole: {
      type: String,
      enum: ['superadmin', 'admin', 'school_user'],
      required: true,
    },

    // ── What happened ─────────────────────────────────────────────────────────
    action: {
      type: String,
      enum: [
        'Admin Login',
        'School Login',
        'Logout',
        'Status Changed',
        'Document Uploaded',
        'Message Sent',
        'School Created',
        'School Updated',
        'School Archived',
        'School Deleted',
        'Profile Updated',
        'Password Changed',
        'Password Reset Requested',
        'Admin Created',
        'Admin Deactivated',
        'Admin Assigned',
        'Document Approved',
        'Document Rejected',
        'Report Generated',
        'Note Added',
      ],
      required: true,
    },

    description: { type: String, trim: true },

    // ── Related entities ──────────────────────────────────────────────────────
    relatedSchool:  { type: mongoose.Schema.Types.ObjectId, ref: 'School',  default: null },
    relatedUser:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    default: null },
    relatedDocument:{ type: mongoose.Schema.Types.ObjectId, ref: 'Document',default: null },

    // ── Diff data (previous → new value) ─────────────────────────────────────
    previousValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue:      { type: mongoose.Schema.Types.Mixed, default: null },

    // ── Request metadata ──────────────────────────────────────────────────────
    ipAddress: { type: String },
    device:    { type: String },
    browser:   { type: String },
  },
  {
    timestamps: true,
    // Append-only — disable updates
    strict: true,
  }
);

activityLogSchema.index({ user: 1,          createdAt: -1 });
activityLogSchema.index({ relatedSchool: 1, createdAt: -1 });
activityLogSchema.index({ action: 1,        createdAt: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);
