const express = require('express');
const router  = express.Router();
const {
  getAdmins,
  getAdminById,
  getAdminActivity,
  getMyActivity,
  createAdmin,
  updateAdmin,
  toggleAdminActive,
  resetAdminPassword,
} = require('../controllers/adminController');

const { protect }               = require('../middleware/authMiddleware');
const { isSuperAdmin, isAdmin } = require('../middleware/roleMiddleware');

router.use(protect);

// Admin self-service — must come before the blanket isSuperAdmin gate below.
router.get('/me/activity', isAdmin, getMyActivity);

// Everything else on this router is SuperAdmin only
router.use(isSuperAdmin);

router.get('/',                     getAdmins);
router.get('/:id',                  getAdminById);
router.get('/:id/activity',         getAdminActivity);
router.post('/',                    createAdmin);
router.put('/:id',                  updateAdmin);
router.put('/:id/toggle-active',    toggleAdminActive);
router.put('/:id/reset-password',   resetAdminPassword);

module.exports = router;
