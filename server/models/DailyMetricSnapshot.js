const mongoose = require('mongoose');

// ── Append-only — one row per CALENDAR DAY (nationwide, not per-admin/school) ──
// Nothing in this system previously recorded how MAU/CPD completion changed
// day over day — every percentage was computed live from current data with no
// persisted point-in-time value. This captures one nationwide snapshot per day
// so a genuine "daily run rate" becomes possible for the Peak MAU War Room
// dashboard — but, like AdminScoreHistory, only from whenever this first runs
// onward; there is no way to backfill days before it existed.

const dailyMetricSnapshotSchema = new mongoose.Schema(
  {
    // 'YYYY-MM-DD' (server-local) — one snapshot per day; the FIRST snapshot
    // taken that day is kept (see analyticsSnapshot.js's $setOnInsert upsert).
    dateKey: { type: String, required: true, unique: true },

    mauDoneCount:      { type: Number, default: 0 }, // tracked students with current-quarter MAU marked done
    mauRegisteredCount:{ type: Number, default: 0 }, // total tracked students
    cpdDoneCount:       { type: Number, default: 0 }, // tracked teachers with current-quarter CPD marked done
    cpdRegisteredCount: { type: Number, default: 0 }, // total tracked teachers
  },
  { timestamps: true, strict: true }
);

dailyMetricSnapshotSchema.index({ dateKey: -1 });

module.exports = mongoose.model('DailyMetricSnapshot', dailyMetricSnapshotSchema);
