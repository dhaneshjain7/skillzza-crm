const express = require('express');
const router  = express.Router();
const { querySchools, queryAnalytics } = require('../controllers/aiController');

const { protect } = require('../middleware/authMiddleware');
const { isAdmin } = require('../middleware/roleMiddleware');

router.use(protect);

// ── Natural-language schools query (Admin/SuperAdmin) ──────────────────────────
router.post('/query-schools', isAdmin, querySchools); // POST /api/ai/query-schools

// ── Analytics Q&A + BI dashboards, read-only (Admin/SuperAdmin) ────────────────
// SuperAdmin sees the full platform; Admin is automatically scoped to only
// their own assigned schools inside queryAnalytics — never the whole platform.
router.post('/analytics-query', isAdmin, queryAnalytics); // POST /api/ai/analytics-query

module.exports = router;
