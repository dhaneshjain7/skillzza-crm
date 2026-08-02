const mongoose = require('mongoose');
const softDelete = require('./plugins/softDelete');

// ── Status values from scope doc ──────────────────────────────────────────────
const SCHOOL_STATUSES = [
  'New',
  'Contacted',
  'Documents Pending',
  'Documents Received',
  'Verification',
  'Approved',
  'Rejected',
  'Completed',
  'Archived',
];

const schoolSchema = new mongoose.Schema(
  {
    // ── Basic Details ──────────────────────────────────────────────────────────
    schoolName:        { type: String, required: true, trim: true },
    registrationNumber:{ type: String, trim: true },
    udiseCode:         { type: String, required: true, trim: true },   // 11-digit UDISE code — searchable
    schoolType:        { type: String, enum: ['Primary', 'Secondary', 'Higher Secondary', 'College', 'Other'] },
    board:             { type: String, trim: true },   // CBSE, ICSE, State, etc.
    establishedYear:   { type: Number },
    website:           { type: String, trim: true },
    logo:              { type: String, default: null },

    // ── Contact Details ────────────────────────────────────────────────────────
    email:   { type: String, required: true, lowercase: true, trim: true },
    phone:   { type: String, required: true, trim: true },
    altPhone:{ type: String, trim: true },

    // ── Address ───────────────────────────────────────────────────────────────
    address: {
      street:   { type: String, trim: true },
      city:     { type: String, trim: true, required: true },
      district: { type: String, trim: true },
      state:    { type: String, trim: true, required: true },
      pincode:  { type: String, trim: true },
      country:  { type: String, trim: true, default: 'India' },
    },

    // ── Principal & Management ────────────────────────────────────────────────
    principal: {
      name:  { type: String, trim: true },
      email: { type: String, trim: true },
      phone: { type: String, trim: true },
    },
    management: {
      name:        { type: String, trim: true },
      designation: { type: String, trim: true },
      phone:       { type: String, trim: true },
    },

    // ── Status ────────────────────────────────────────────────────────────────
    currentStatus: {
      type: String,
      enum: SCHOOL_STATUSES,
      default: 'New',
    },

    // ── Relationships ─────────────────────────────────────────────────────────
    assignedAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    schoolUser:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // linked school_user account

    // ── Profile completeness ──────────────────────────────────────────────────
    profileCompletion: { type: Number, default: 0, min: 0, max: 100 },

    // ── Internal notes (admin-only, not visible to school) ─────────────────────
    internalNotes: [
      {
        note:      { type: String, required: true },
        addedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        addedAt:   { type: Date, default: Date.now },
      },
    ],

    // ── Additional metadata ───────────────────────────────────────────────────
    studentCount:  { type: Number },
    staffCount:    { type: Number },
    tags:          [{ type: String, trim: true }],
    poeSubmitted:  { type: String, enum: ['Yes', 'No'], default: 'No' },

    // ── CPT Training Level — set by Admin/SuperAdmin only, view-only for school ──
    cptTrainingLevel: { type: String, enum: ['CPT1', 'CPT2', 'CPT3', 'CPT4', 'CPT5'] },
  },
  { timestamps: true }
);

// Indexes for search module
schoolSchema.index({ schoolName: 'text', email: 'text', registrationNumber: 'text' });
schoolSchema.index({ currentStatus: 1 });
schoolSchema.index({ udiseCode: 1 });
schoolSchema.index({ assignedAdmin: 1 });
schoolSchema.index({ 'address.city': 1, 'address.state': 1, 'address.district': 1 });

schoolSchema.plugin(softDelete);

module.exports = mongoose.model('School', schoolSchema);
module.exports.SCHOOL_STATUSES = SCHOOL_STATUSES;
