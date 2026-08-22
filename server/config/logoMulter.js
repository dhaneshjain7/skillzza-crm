const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '../uploads/logos');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const unique = crypto.randomBytes(12).toString('hex');
    const ext    = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}_${unique}${ext}`);
  },
});

const ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.svg'];

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXT.includes(ext)) {
    return cb(new Error(`File type not allowed. Only images (JPG, PNG, WEBP, SVG) accepted. Got: ${ext}`), false);
  }
  cb(null, true);
};

const logoUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
});

module.exports = logoUpload;
