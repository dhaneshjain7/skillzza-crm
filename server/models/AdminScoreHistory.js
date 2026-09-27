const mongoose = require('mongoose');

// ── Append-only — one row per admin per calendar day ───────────────────────────
// The admin (Account Manager) Performance Score is otherwise computed LIVE from
// current data on every request (see healthScore.js's computeAdminScorecard) —
// nothing about it was ever persisted, so "why did Admin X's score change from
// A to B" had no history to answer from. This model captures a daily snapshot
// of each admin's score + component breakdown so that comparison becomes
// possible — but only from the day this started being written; there is no way
// to backfill scores from before this model existed.

const adminScoreHistorySchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    adminEmail: { type: String, required: true, trim: true, lowercase: true },

    // 'YYYY-MM-DD' (server-local) — one snapshot per admin per day; the FIRST
    // snapshot taken that day is kept (see analyticsSnapshot.js's upsert, which
    // uses $setOnInsert), so a score doesn't drift mid-day as data changes.
    dateKey: { type: String, required: true },

    score:       { type: Number, default: null },
    status:      { type: String, default: null }, // Green / Amber / Red / null
    schoolCount: { type: Number, default: 0 },
    components:  { type: mongoose.Schema.Types.Mixed, default: {} }, // same shape as computeAdminScorecard().components
  },
  {
    timestamps: true,
    strict: true,
  }
);

// One snapshot per admin per day; fast "most recent N days" lookups per admin.
adminScoreHistorySchema.index({ adminEmail: 1, dateKey: 1 }, { unique: true });
adminScoreHistorySchema.index({ adminEmail: 1, createdAt: -1 });

module.exports = mongoose.model('AdminScoreHistory', adminScoreHistorySchema);
