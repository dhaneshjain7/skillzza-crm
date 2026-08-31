const express = require('express');
const router  = express.Router();
const { querySchools } = require('../controllers/aiController');

const { protect } = require('../middleware/authMiddleware');
const { isAdmin }  = require('../middleware/roleMiddleware');

router.use(protect);

// ── Natural-language schools query (Admin/SuperAdmin) ──────────────────────────
router.post('/query-schools', isAdmin, querySchools); // POST /api/ai/query-schools

module.exports = router;
