const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

// Ensure uploads directory exists
const UPLOAD_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_DIR, 'documents');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = crypto.randomBytes(12).toString('hex');
    const ext    = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}_${unique}${ext}`);
  },
});

// Superset across all /documents upload types: spreadsheet types (Student/Teacher/Adobe
// data) plus the LOI, which is a signed PDF/DOC/DOCX/image, not a spreadsheet. The exact
// extensions allowed per documentType are enforced in documentController.js instead of
// here — multer's fileFilter runs before `documentType` is readable on req.body, since
// the client appends the file field before the documentType field.
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed = ['.csv', '.xls', '.xlsx', '.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png'];
  if (!allowed.includes(ext)) {
    return cb(new Error(`File type not allowed. Got: ${ext}`), false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

module.exports = upload;
