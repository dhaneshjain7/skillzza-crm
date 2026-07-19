const express = require('express');
const router  = express.Router();

const {
  login,
  refreshToken,
  logout,
  getMe,
  changePassword,
  registerSchool,
  googleAuthSchool,
} = require('../controllers/authController');

const { protect } = require('../middleware/authMiddleware');

// ── Public routes ─────────────────────────────────────────────────────────────
router.post('/login',          login);            // POST /api/auth/login
router.post('/refresh',        refreshToken);      // POST /api/auth/refresh
router.post('/register/school', registerSchool);   // POST /api/auth/register/school
router.post('/google/school',  googleAuthSchool);  // POST /api/auth/google/school

// ── Protected routes ──────────────────────────────────────────────────────────
router.post('/logout',          protect, logout);          // POST /api/auth/logout
router.get('/me',               protect, getMe);           // GET  /api/auth/me
router.put('/change-password',  protect, changePassword);  // PUT  /api/auth/change-password

module.exports = router;
