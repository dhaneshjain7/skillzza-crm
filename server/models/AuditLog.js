const mongoose = require('mongoose');

// ── Immutable — audit trail is permanently preserved ──────────────────────────
// Covers all 7 audit event types from scope doc section 16.

const auditLogSchema = new mongoose.Schema(
  {
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'School',
      required: true,
      index: true,
    },

    eventType: {
      type: String,
      enum: [
        'School Created',
        'Status Changed',
        'Document Uploaded',
        'Approved / Rejected',
        'Admin Changed',
        'Message Sent',
        'Archived',
        'Students Activity Imported',
        'Teachers Activity Imported',
      ],
      required: true,
    },

    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    performedByRole: {
      type: String,
      enum: ['superadmin', 'admin', 'school_user'],
      required: true,
    },

    // ── Change data ───────────────────────────────────────────────────────────
    field:         { type: String },       // which field changed
    previousValue: { type: mongoose.Schema.Types.Mixed },
    newValue:      { type: mongoose.Schema.Types.Mixed },

    // ── Narrative description ─────────────────────────────────────────────────
    description: { type: String, trim: true },
    remarks:     { type: String, trim: true },

    // ── Related entities ──────────────────────────────────────────────────────
    relatedDocument: { type: mongoose.Schema.Types.ObjectId, ref: 'Document', default: null },
    relatedMessage:  { type: mongoose.Schema.Types.ObjectId, ref: 'Message',  default: null },

    // ── Request metadata ──────────────────────────────────────────────────────
    ipAddress: { type: String },
    device:    { type: String },
    browser:   { type: String },
  },
  {
    timestamps: true,
    strict: true,
  }
);

// Fast lookup by school + time for audit trail page
auditLogSchema.index({ school: 1, createdAt: -1 });
auditLogSchema.index({ school: 1, eventType: 1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
