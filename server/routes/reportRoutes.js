const express = require('express');
const router  = express.Router();
const {
  schoolsReport,
  statusReport,
  growthReport,
  monthlyReport,
  adminPerformanceReport,
  communicationReport,
  auditTrailReport,
  activityLogsReport,
} = require('../controllers/reportController');

const { protect }       = require('../middleware/authMiddleware');
const { isAdmin, isSuperAdmin } = require('../middleware/roleMiddleware');

router.use(protect);

// ── Available to Admin + SuperAdmin ───────────────────────────────────────────
router.get('/schools',       isAdmin,       schoolsReport);         // GET /api/reports/schools
router.get('/status',        isAdmin,       statusReport);          // GET /api/reports/status
router.get('/growth',        isAdmin,       growthReport);          // GET /api/reports/growth
router.get('/monthly',       isAdmin,       monthlyReport);         // GET /api/reports/monthly
router.get('/communication', isAdmin,       communicationReport);   // GET /api/reports/communication
router.get('/audit-trail',   isAdmin,       auditTrailReport);      // GET /api/reports/audit-trail
router.get('/activity-logs', isAdmin,       activityLogsReport);    // GET /api/reports/activity-logs

// ── SuperAdmin only ───────────────────────────────────────────────────────────
router.get('/admin-performance', isSuperAdmin, adminPerformanceReport); // GET /api/reports/admin-performance

module.exports = router;
