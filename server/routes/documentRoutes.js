const express = require('express');
const router  = express.Router();
const upload  = require('../config/multer');
const {
  uploadDocument,
  validateDocument,
  getSchoolDocuments,
  getDocument,
  downloadDocument,
  reviewDocument,
  getDocumentTypes,
  downloadTemplate,
} = require('../controllers/documentController');

const { protect }                              = require('../middleware/authMiddleware');
const { isAdmin, canAccessSchool, isSchoolUser } = require('../middleware/roleMiddleware');

// All routes require authentication
router.use(protect);

// ── Document types (public to all logged in) ──────────────────────────────────
router.get('/types', getDocumentTypes);

// ── Blank template for a document type ────────────────────────────────────────
router.get('/template/:documentType', downloadTemplate);

// ── Validate only (dry run, no save) ─────────────────────────────────────────
router.post('/validate', upload.single('file'), validateDocument);

// ── Upload document for a school ──────────────────────────────────────────────
router.post(
  '/upload/:schoolId',
  canAccessSchool,
  upload.single('file'),
  uploadDocument
);

// ── List documents for a school ───────────────────────────────────────────────
router.get('/school/:schoolId', canAccessSchool, getSchoolDocuments);

// ── Single document ───────────────────────────────────────────────────────────
router.get('/:id',           getDocument);
router.get('/:id/download',  downloadDocument);

// ── Admin review ──────────────────────────────────────────────────────────────
router.put('/:id/review', isAdmin, reviewDocument);

module.exports = router;
