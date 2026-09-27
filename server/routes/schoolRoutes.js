const express = require('express');
const router  = express.Router();

const logoUpload = require('../config/logoMulter');
const upload      = require('../config/multer');

const {
  createSchool,
  downloadSchoolsBulkTemplate,
  importSchoolsBulk,
  getSchools,
  getSchoolById,
  updateSchool,
  deleteSchool,
  uploadLogo,
  updateSchoolStatus,
  assignAdmin,
  archiveSchool,
  getStatusHistory,
  getAuditTrail,
  addNote,
  getStats,
  resetSchoolPassword,
  createSchoolLogin,
  downloadStudentsActivityTemplate,
  importStudentsActivity,
  downloadTeachersActivityTemplate,
  importTeachersActivity,
} = require('../controllers/schoolController');

const { protect }                                        = require('../middleware/authMiddleware');
const { isSuperAdmin, isAdmin, isSchoolUser, canAccessSchool } = require('../middleware/roleMiddleware');

// All routes require authentication
router.use(protect);

// ── Stats ─────────────────────────────────────────────────────────────────────
router.get('/stats', isAdmin, getStats);

// ── Students Activity bulk-import template (Admin/SuperAdmin) ─────────────────
router.get('/students-activity/template', isAdmin, downloadStudentsActivityTemplate);

// ── Teachers Activity bulk-import template (Admin/SuperAdmin) ─────────────────
router.get('/teachers-activity/template', isAdmin, downloadTeachersActivityTemplate);

// ── Bulk school creation (Admin/SuperAdmin) ────────────────────────────────────
router.get('/bulk-template',  isAdmin, downloadSchoolsBulkTemplate);
router.post('/bulk-import',   isAdmin, upload.single('file'), importSchoolsBulk);

// ── Collection routes ─────────────────────────────────────────────────────────
router.get('/',  getSchools);
router.post('/', isAdmin, createSchool);

// ── Single school routes ──────────────────────────────────────────────────────
router.get('/:id', canAccessSchool, getSchoolById);

// PUT /:id — Admin/SuperAdmin can update anything
//            School user can update their own school profile only
router.put('/:id', canAccessSchool, updateSchool);

// POST /:id/logo — Admin/SuperAdmin or the school's own user can upload a logo
router.post('/:id/logo', canAccessSchool, logoUpload.single('logo'), uploadLogo);

// ── Status (Admin only — school user cannot change their own status) ──────────
router.put('/:id/status', isAdmin, canAccessSchool, updateSchoolStatus);

// ── Admin assignment (SuperAdmin only) ───────────────────────────────────────
router.put('/:id/assign-admin', isSuperAdmin, assignAdmin);

// ── Archive (SuperAdmin only) ─────────────────────────────────────────────────
router.put('/:id/archive', isSuperAdmin, archiveSchool);

// ── Delete (SuperAdmin only) — soft-delete, hidden from every normal query ────
router.delete('/:id', isSuperAdmin, deleteSchool);

// ── History & audit ───────────────────────────────────────────────────────────
router.get('/:id/status-history', canAccessSchool, getStatusHistory);
router.get('/:id/audit-trail',    isAdmin, getAuditTrail);

// ── Notes (Admin only) ────────────────────────────────────────────────────────
router.post('/:id/notes', isAdmin, canAccessSchool, addNote);

// ── Students Activity bulk import (Admin/SuperAdmin) ───────────────────────────
router.post('/:id/students-activity/import', isAdmin, canAccessSchool, upload.single('file'), importStudentsActivity);

// ── Teachers Activity bulk import (Admin/SuperAdmin) ───────────────────────────
router.post('/:id/teachers-activity/import', isAdmin, canAccessSchool, upload.single('file'), importTeachersActivity);

// ── School Portal Login Management (Admin/SuperAdmin) ─────────────────────────
router.post('/:id/create-login',          isAdmin, createSchoolLogin);       // POST /api/schools/:id/create-login
router.put('/:id/reset-login-password',   isAdmin, resetSchoolPassword);     // PUT  /api/schools/:id/reset-login-password

module.exports = router;
