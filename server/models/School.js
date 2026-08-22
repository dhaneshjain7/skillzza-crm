const mongoose = require('mongoose');
const softDelete = require('./plugins/softDelete');

// ── Status values from scope doc ──────────────────────────────────────────────
const SCHOOL_STATUSES = [
  'New',
  'Contacted',
  'LOI Pending',
  'LOI Received',
  'Verification',
  'Data Requested',
  'Data Received',
  'Rejected',
  'Completed',
  'Archived',
];

const schoolSchema = new mongoose.Schema(
  {
    // ── Basic Details ──────────────────────────────────────────────────────────
    schoolName:        { type: String, required: true, trim: true },
    udiseCode:         { type: String, required: true, trim: true },   // 11-digit UDISE code — searchable
    schoolType:        { type: String, enum: ['Primary', 'Secondary', 'Higher Secondary', 'College', 'Other'] },
    board:             { type: String, trim: true },   // CBSE, ICSE, State, etc.
    website:           { type: String, trim: true },
    logo:              { type: String, default: null },
    spoc:              { type: String, trim: true },   // School SPOC (single point of contact)
    spocPhone:         { type: String, trim: true },
    spocEmail:         { type: String, trim: true },

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

    // ── CPD Training Level — set by Admin/SuperAdmin only, view-only for school ──
    cpdTrainingLevel: { type: String, enum: ['CPD1', 'CPD2', 'CPD3', 'CPD4'] },

    // ── Activity Tracking — set by Admin/SuperAdmin only, view-only for school ──
    loiReceived:          { type: String, enum: ['Yes', 'No'], default: 'No' },
    dcaisConfirmation:    { type: String, enum: ['Yes', 'No'], default: 'No' },
    studentDataReceived:  { type: String, enum: ['Yes', 'No'], default: 'No' },
    teachersDataReceived: { type: String, enum: ['Yes', 'No'], default: 'No' },
    hackathonRegistered:  { type: String, enum: ['Yes', 'No'], default: 'No' },

    // ── Teachers Activity — per-teacher CPD/DCAIS tracking, Admin/SuperAdmin only ──
    teachersActivity: [
      {
        name: { type: String, trim: true },
        fiscalYear: { type: String, trim: true },
        cpdQuarterly: {
          q1: { type: Boolean, default: false },
          q2: { type: Boolean, default: false },
          q3: { type: Boolean, default: false },
          q4: { type: Boolean, default: false },
        },
        dcaisMonthly: {
          jan: { type: Boolean, default: false },
          feb: { type: Boolean, default: false },
          mar: { type: Boolean, default: false },
          apr: { type: Boolean, default: false },
          may: { type: Boolean, default: false },
          jun: { type: Boolean, default: false },
          jul: { type: Boolean, default: false },
          aug: { type: Boolean, default: false },
          sep: { type: Boolean, default: false },
          oct: { type: Boolean, default: false },
          nov: { type: Boolean, default: false },
          dec: { type: Boolean, default: false },
        },
        certificateReceived: { type: Boolean, default: false },
        certificateLink:     { type: String, trim: true },
      },
    ],

    // ── Students Activity — per-student MAU/DCAIS tracking, Admin/SuperAdmin only ──
    studentsActivity: [
      {
        name:    { type: String, trim: true },
        class:   { type: String, trim: true },
        section: { type: String, trim: true },
        fiscalYear: { type: String, trim: true },
        mauQuarterly: {
          q1: { type: Boolean, default: false },
          q2: { type: Boolean, default: false },
          q3: { type: Boolean, default: false },
          q4: { type: Boolean, default: false },
        },
        dcaisMonthly: {
          jan: { type: Boolean, default: false },
          feb: { type: Boolean, default: false },
          mar: { type: Boolean, default: false },
          apr: { type: Boolean, default: false },
          may: { type: Boolean, default: false },
          jun: { type: Boolean, default: false },
          jul: { type: Boolean, default: false },
          aug: { type: Boolean, default: false },
          sep: { type: Boolean, default: false },
          oct: { type: Boolean, default: false },
          nov: { type: Boolean, default: false },
          dec: { type: Boolean, default: false },
        },
        hackathonParticipated: { type: Boolean, default: false },
        certificateReceived: { type: Boolean, default: false },
        certificateLink:     { type: String, trim: true },
      },
    ],
  },
  { timestamps: true }
);

// Indexes for search module
schoolSchema.index({ schoolName: 'text', email: 'text' });
schoolSchema.index({ currentStatus: 1 });
schoolSchema.index({ udiseCode: 1 });
schoolSchema.index({ assignedAdmin: 1 });
schoolSchema.index({ 'address.city': 1, 'address.state': 1, 'address.district': 1 });

schoolSchema.plugin(softDelete);

module.exports = mongoose.model('School', schoolSchema);
module.exports.SCHOOL_STATUSES = SCHOOL_STATUSES;
