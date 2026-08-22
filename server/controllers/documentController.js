const path        = require('path');
const fs          = require('fs');
const { Document, School, AuditLog, ActivityLog } = require('../models');
const { parseFile, validateFile, SCHEMAS }         = require('../utils/fileParser');
const { notifyDocumentUploaded, notifyDocumentSent } = require('../utils/notificationService');

// ── Helper: log ───────────────────────────────────────────────────────────────
const log = async ({ user, action, description, schoolId, req }) => {
  try {
    await ActivityLog.create({
      user:          user._id,
      userRole:      user.role,
      action,
      description,
      relatedSchool: schoolId || null,
      ipAddress:     req.ip,
      browser:       req.headers['user-agent'] || '',
    });
  } catch (e) { console.error('log error:', e.message); }
};

// ── @POST /api/documents/upload/:schoolId ─────────────────────────────────────
// Upload + validate a CSV/XLS file for a school
const uploadDocument = async (req, res) => {
  try {
    const { schoolId }     = req.params;
    const { documentType, description } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    if (!documentType || !SCHEMAS[documentType]) {
      return res.status(400).json({
        success: false,
        message: `Invalid document type. Valid types: ${Object.keys(SCHEMAS).join(', ')}`,
      });
    }

    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ success: false, message: 'School not found.' });
    }

    // Parse file
    let parsed;
    try {
      parsed = await parseFile(req.file.path);
    } catch (parseErr) {
      fs.unlinkSync(req.file.path); // delete bad file
      return res.status(400).json({ success: false, message: `File parse error: ${parseErr.message}` });
    }

    // Validate columns + rows
    const validation = validateFile(parsed, documentType);

    // Mark previous version of same type as not latest
    await Document.updateMany(
      { school: schoolId, documentType, isLatestVersion: true },
      { isLatestVersion: false }
    );

    // Count existing versions
    const versionCount = await Document.countDocuments({ school: schoolId, documentType });

    // Files sent by admin/superadmin (e.g. Adobe accounts) don't need review —
    // auto-approve them. School uploads stay Pending for admin review.
    const isStaffUpload = req.user.role !== 'school_user';

    // Save document record
    const doc = await Document.create({
      school:          schoolId,
      uploadedBy:      req.user._id,
      uploadedByRole:  req.user.role,
      fileName:        req.file.originalname,
      storedName:      req.file.filename,
      filePath:        req.file.path,
      fileType:        req.file.mimetype,
      fileSize:        req.file.size,
      fileExtension:   path.extname(req.file.originalname).toLowerCase().replace('.', ''),
      documentType,
      description:     description || '',
      status:          isStaffUpload ? 'Approved' : 'Pending',
      reviewedBy:      isStaffUpload ? req.user._id : null,
      reviewedAt:      isStaffUpload ? new Date() : null,
      version:         versionCount + 1,
      isLatestVersion: true,
      // Store parsed data
      parsedData: {
        valid:      validation.valid,
        totalRows:  validation.totalRows,
        validRows:  validation.validRows,
        errors:     validation.errors,
        warnings:   validation.warnings,
        rows:       validation.rows, // store validated rows
      },
    });

    // Audit log
    await AuditLog.create({
      school:          schoolId,
      eventType:       'Document Uploaded',
      performedBy:     req.user._id,
      performedByRole: req.user.role,
      description:     `Uploaded ${SCHEMAS[documentType].label} (${req.file.originalname})`,
      relatedDocument: doc._id,
      ipAddress:       req.ip,
    });

    await log({ user: req.user, action: 'Document Uploaded', description: `Uploaded ${documentType}: ${req.file.originalname}`, schoolId, req });

    // Notify the other side: school upload → assigned admin; staff upload → school user
    const io = req.app.get('io');
    if (isStaffUpload) {
      await notifyDocumentSent({ school, document: doc, sentBy: req.user, io });
    } else {
      await notifyDocumentUploaded({ school, document: doc, uploadedBy: req.user, io });
    }

    res.status(201).json({
      success:    true,
      document:   doc,
      validation: {
        valid:     validation.valid,
        totalRows: validation.totalRows,
        validRows: validation.validRows,
        errors:    validation.errors.slice(0, 20), // cap errors at 20
        warnings:  validation.warnings,
        preview:   validation.rows.slice(0, 5),    // first 5 rows as preview
        headers:   validation.headers,
        schema:    validation.schema,
      },
    });
  } catch (err) {
    console.error('uploadDocument error:', err);
    if (req.file?.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: 'Server error during upload.' });
  }
};

// ── @POST /api/documents/validate ────────────────────────────────────────────
// Validate a file WITHOUT saving it (dry run for preview)
const validateDocument = async (req, res) => {
  try {
    const { documentType } = req.body;

    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded.' });
    if (!documentType || !SCHEMAS[documentType]) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: 'Invalid document type.' });
    }

    let parsed;
    try {
      parsed = await parseFile(req.file.path);
    } catch (e) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ success: false, message: `Parse error: ${e.message}` });
    }

    const validation = validateFile(parsed, documentType);

    // Delete temp file after validation
    fs.unlinkSync(req.file.path);

    res.status(200).json({
      success: true,
      validation: {
        valid:     validation.valid,
        totalRows: validation.totalRows,
        validRows: validation.validRows,
        errors:    validation.errors.slice(0, 20),
        warnings:  validation.warnings,
        preview:   validation.rows.slice(0, 10),
        headers:   validation.headers,
        schema:    validation.schema,
      },
    });
  } catch (err) {
    console.error('validateDocument error:', err);
    if (req.file?.path) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @GET /api/documents/school/:schoolId ─────────────────────────────────────
// List all documents for a school
const getSchoolDocuments = async (req, res) => {
  try {
    const { schoolId } = req.params;
    const { documentType, latestOnly } = req.query;

    const filter = { school: schoolId };
    if (documentType)         filter.documentType = documentType;
    if (latestOnly === 'true') filter.isLatestVersion = true;

    const documents = await Document.find(filter)
      .populate('uploadedBy', 'name email role')
      .populate('reviewedBy', 'name')
      .sort({ createdAt: -1 });

    // Group by type
    const grouped = {};
    documents.forEach(doc => {
      if (!grouped[doc.documentType]) grouped[doc.documentType] = [];
      grouped[doc.documentType].push(doc);
    });

    res.status(200).json({
      success: true,
      count:   documents.length,
      grouped,
      documents,
    });
  } catch (err) {
    console.error('getSchoolDocuments error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @GET /api/documents/:id ───────────────────────────────────────────────────
const getDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id)
      .populate('uploadedBy', 'name email role')
      .populate('reviewedBy', 'name');

    if (!doc) return res.status(404).json({ success: false, message: 'Document not found.' });
    res.status(200).json({ success: true, document: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @GET /api/documents/:id/download ─────────────────────────────────────────
const downloadDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found.' });

    if (!fs.existsSync(doc.filePath)) {
      return res.status(404).json({ success: false, message: 'File not found on server.' });
    }

    res.download(doc.filePath, doc.fileName);
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @PUT /api/documents/:id/review ───────────────────────────────────────────
// Admin reviews a document (Approve / Reject / Request Re-upload)
const reviewDocument = async (req, res) => {
  try {
    const { status, rejectReason } = req.body;
    const allowed = ['Approved', 'Rejected', 'Re-upload Requested'];

    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Status must be one of: ${allowed.join(', ')}` });
    }

    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found.' });

    doc.status       = status;
    doc.reviewedBy   = req.user._id;
    doc.reviewedAt   = new Date();
    doc.rejectReason = rejectReason || '';
    await doc.save();

    await log({ user: req.user, action: status === 'Approved' ? 'Document Approved' : 'Document Rejected', description: `${status} document: ${doc.fileName}`, schoolId: doc.school, req });

    res.status(200).json({ success: true, document: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @GET /api/documents/types ─────────────────────────────────────────────────
// List all document types with their required columns
const getDocumentTypes = (req, res) => {
  const types = Object.entries(SCHEMAS).map(([key, schema]) => ({
    key,
    label:    schema.label,
    columns:  schema.required,
  }));
  res.status(200).json({ success: true, types });
};

// ── @GET /api/documents/template/:documentType ────────────────────────────────
// Blank .xlsx with just the required column headers, ready for a school to fill in
const downloadTemplate = (req, res) => {
  try {
    const { documentType } = req.params;
    const schema = SCHEMAS[documentType];
    if (!schema) {
      return res.status(400).json({
        success: false,
        message: `Invalid document type. Valid types: ${Object.keys(SCHEMAS).join(', ')}`,
      });
    }

    const XLSX = require('xlsx');
    const ws = XLSX.utils.aoa_to_sheet([schema.required]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const fileName = `${schema.label.replace(/[^a-z0-9]+/gi, '_')}_Template.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  } catch (err) {
    console.error('downloadTemplate error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

module.exports = {
  uploadDocument,
  validateDocument,
  getSchoolDocuments,
  getDocument,
  downloadDocument,
  reviewDocument,
  getDocumentTypes,
  downloadTemplate,
};
