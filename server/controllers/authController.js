const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { User, RefreshToken, ActivityLog, School, SchoolStatusHistory } = require('../models');
const { sendTokens, generateAccessToken, REFRESH_COOKIE_OPTIONS } = require('../utils/generateTokens');
const { verifyGoogleToken } = require('../utils/googleAuth');
const { notifyPasswordChanged } = require('../utils/notificationService');
const { sendEmail } = require('../utils/emailService');

const RESET_CODE_TTL_MINUTES = 10;
const RESET_MAX_ATTEMPTS = 5;

// ── Helper: log activity ──────────────────────────────────────────────────────
const logActivity = async ({ user, action, description, req }) => {
  try {
    await ActivityLog.create({
      user:      user._id,
      userRole:  user.role,
      action,
      description,
      ipAddress: req.ip,
      device:    req.headers['user-agent']?.split(' ')[0] || 'Unknown',
      browser:   req.headers['user-agent'] || 'Unknown',
    });
  } catch (err) {
    console.error('Activity log error:', err.message);
  }
};

// ── @POST /api/auth/login ─────────────────────────────────────────────────────
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact support.',
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    // Update last login + login history
    user.lastLogin = new Date();
    user.loginHistory.unshift({
      ip:      req.ip,
      device:  req.headers['user-agent']?.split(' ')[0] || 'Unknown',
      browser: req.headers['user-agent'] || 'Unknown',
      loginAt: new Date(),
    });
    if (user.loginHistory.length > 10) user.loginHistory = user.loginHistory.slice(0, 10);
    await user.save();

    await logActivity({
      user,
      action:      user.role === 'school_user' ? 'School Login' : 'Admin Login',
      description: `${user.name} logged in`,
      req,
    });

    await sendTokens(user, 200, res, req);
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
};

// ── @POST /api/auth/refresh ───────────────────────────────────────────────────
const refreshToken = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;

    if (!token) {
      return res.status(401).json({ success: false, message: 'No refresh token provided.' });
    }

    const storedToken = await RefreshToken.findOne({ token });

    if (!storedToken) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token.' });
    }

    if (storedToken.isRevoked) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token has been revoked. Please log in again.',
      });
    }

    if (storedToken.expiresAt < new Date()) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token has expired. Please log in again.',
      });
    }

    const user = await User.findById(storedToken.user);

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'User not found or deactivated.' });
    }

    const accessToken = generateAccessToken(user);

    res.status(200).json({ success: true, accessToken });
  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(500).json({ success: false, message: 'Server error during token refresh.' });
  }
};

// ── @POST /api/auth/logout ────────────────────────────────────────────────────
const logout = async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;

    if (token) {
      await RefreshToken.findOneAndUpdate(
        { token },
        { isRevoked: true, revokedAt: new Date() }
      );
    }

    if (req.user) {
      await logActivity({
        user:        req.user,
        action:      'Logout',
        description: `${req.user.name} logged out`,
        req,
      });
    }

    res.clearCookie('refreshToken', REFRESH_COOKIE_OPTIONS);

    res.status(200).json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ success: false, message: 'Server error during logout.' });
  }
};

// ── @GET /api/auth/me ─────────────────────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.status(200).json({ success: true, user });
  } catch (err) {
    console.error('getMe error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @PUT /api/auth/change-password ───────────────────────────────────────────
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required.',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters.',
      });
    }

    const user = await User.findById(req.user._id).select('+password');

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    user.password = newPassword;
    await user.save();

    // Revoke all refresh tokens — force re-login on other devices
    await RefreshToken.updateMany(
      { user: user._id, isRevoked: false },
      { isRevoked: true, revokedAt: new Date() }
    );

    await logActivity({
      user,
      action:      'Password Changed',
      description: `${user.name} changed their password`,
      req,
    });

    // Real-time + email notification confirming the password change
    await notifyPasswordChanged({ user, io: req.app.get('io') });

    res.status(200).json({
      success: true,
      message: 'Password changed successfully. Please log in again.',
    });
  } catch (err) {
    console.error('changePassword error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @POST /api/auth/forgot-password ──────────────────────────────────────────
// Any role — request a 6-digit reset code emailed to the account's registered address.
// Always responds with the same generic message so this can't be used to enumerate
// which emails have accounts.
const forgotPassword = async (req, res) => {
  const genericResponse = {
    success: true,
    message: 'If an account exists for this email, a reset code has been sent to it.',
  };
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim(), isActive: true });
    if (!user) {
      return res.status(200).json(genericResponse); // don't reveal whether the account exists
    }

    const code = crypto.randomInt(100000, 1000000).toString(); // 6 digits
    const salt = await bcrypt.genSalt(10);
    user.resetPasswordToken    = await bcrypt.hash(code, salt);
    user.resetPasswordExpires  = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000);
    user.resetPasswordAttempts = 0;
    await user.save();

    await sendEmail({
      to:          user.email,
      triggerType: 'Password Reset Code',
      data:        { code, expiresInMinutes: RESET_CODE_TTL_MINUTES },
    });

    await logActivity({
      user,
      action:      'Password Reset Requested',
      description: `${user.name} requested a password reset code`,
      req,
    });

    res.status(200).json(genericResponse);
  } catch (err) {
    console.error('forgotPassword error:', err);
    // Still return the generic response — don't leak server errors as an existence signal.
    res.status(200).json(genericResponse);
  }
};

// ── @POST /api/auth/reset-password ───────────────────────────────────────────
// Any role — complete a reset using the emailed 6-digit code.
const resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ success: false, message: 'Email, code and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() })
      .select('+resetPasswordToken +resetPasswordExpires +resetPasswordAttempts +password');

    const invalidMsg = { success: false, message: 'Invalid or expired reset code. Please request a new one.' };

    if (!user || !user.resetPasswordToken || !user.resetPasswordExpires) {
      return res.status(400).json(invalidMsg);
    }
    if (user.resetPasswordExpires < new Date()) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      user.resetPasswordAttempts = 0;
      await user.save();
      return res.status(400).json(invalidMsg);
    }
    if (user.resetPasswordAttempts >= RESET_MAX_ATTEMPTS) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      user.resetPasswordAttempts = 0;
      await user.save();
      return res.status(400).json({ success: false, message: 'Too many incorrect attempts. Please request a new code.' });
    }

    const codeMatches = await bcrypt.compare(code, user.resetPasswordToken);
    if (!codeMatches) {
      user.resetPasswordAttempts += 1;
      await user.save();
      return res.status(400).json(invalidMsg);
    }

    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.resetPasswordAttempts = 0;
    await user.save();

    // Revoke all refresh tokens — force re-login everywhere with the new password
    await RefreshToken.updateMany(
      { user: user._id, isRevoked: false },
      { isRevoked: true, revokedAt: new Date() }
    );

    await logActivity({
      user,
      action:      'Password Changed',
      description: `${user.name} reset their password via forgot-password code`,
      req,
    });

    await notifyPasswordChanged({ user, io: req.app.get('io') });

    res.status(200).json({ success: true, message: 'Password reset successfully. Please log in with your new password.' });
  } catch (err) {
    console.error('resetPassword error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ── @POST /api/auth/register/school ──────────────────────────────────────────
// Email/password self-registration for School Users.
// Creates a new School (status "New") + linked school_user account, then logs
// them in straight away — same flow as first-time Google Sign-In.
const registerSchool = async (req, res) => {
  try {
    const { name, schoolName, udiseCode, email, phone, password, confirmPassword } = req.body;

    if (!name || !schoolName || !udiseCode || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, school name, UDISE code, email, phone and password are required.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters.',
      });
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists. Please sign in instead.',
      });
    }

    const newUser = await User.create({
      name:     name.trim(),
      email:    normalizedEmail,
      password,
      role:     'school_user',
      phone:    phone.trim(),
      isActive: true,
    });

    try {
      const school = await School.create({
        schoolName:    schoolName.trim(),
        udiseCode:     udiseCode.trim(),
        email:         normalizedEmail,
        phone:         phone.trim(),
        address:       { city: 'Not set', state: 'Not set' },
        currentStatus: 'New',
        schoolUser:    newUser._id,
      });

      await SchoolStatusHistory.create({
        school:        school._id,
        oldStatus:     null,
        newStatus:     'New',
        updatedBy:     newUser._id,
        updatedByRole: 'school_user',
        remarks:       'Self-registered with email and password',
      });

      await logActivity({
        user: newUser,
        action: 'School Created',
        description: `${newUser.name} self-registered ${school.schoolName}`,
        req,
      });
    } catch (err) {
      // Roll back the user account if the linked School couldn't be created —
      // otherwise they end up with a login but "No school linked" forever.
      await User.findByIdAndDelete(newUser._id);
      throw err;
    }

    await sendTokens(newUser, 201, res, req);
  } catch (err) {
    console.error('registerSchool error:', err);
    res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
};

// ── @POST /api/auth/google/school ────────────────────────────────────────────
// Google Sign-In for School Users.
// - If a school_user account with this Google email already exists → log them in.
// - If not → self-register: create a new School (status "New") + linked school_user
//   account, then log them in straight to their (mostly empty) dashboard.
const googleAuthSchool = async (req, res) => {
  try {
    const { credential } = req.body; // Google ID token from the frontend widget

    if (!credential) {
      return res.status(400).json({ success: false, message: 'Google credential is required.' });
    }

    let payload;
    try {
      payload = await verifyGoogleToken(credential);
    } catch (err) {
      console.error('Google token verification failed:', err.message);
      return res.status(401).json({ success: false, message: 'Invalid Google sign-in. Please try again.' });
    }

    if (!payload.emailVerified) {
      return res.status(400).json({ success: false, message: 'Your Google email is not verified.' });
    }

    const email = payload.email.toLowerCase().trim();

    // ── Case 1: user already exists ──────────────────────────────────────────
    let user = await User.findOne({ email }).select('+password');

    if (user) {
      if (user.role !== 'school_user') {
        return res.status(403).json({
          success: false,
          message: 'This Google account is registered under a different role. Please use the correct login page.',
        });
      }
      if (!user.isActive) {
        return res.status(403).json({ success: false, message: 'Your account has been deactivated. Contact support.' });
      }

      user.lastLogin = new Date();
      user.loginHistory.unshift({
        ip: req.ip, device: req.headers['user-agent']?.split(' ')[0] || 'Unknown',
        browser: req.headers['user-agent'] || 'Unknown', loginAt: new Date(),
      });
      if (user.loginHistory.length > 10) user.loginHistory = user.loginHistory.slice(0, 10);
      await user.save();

      await logActivity({ user, action: 'School Login', description: `${user.name} logged in via Google`, req });

      await sendTokens(user, 200, res, req);
      return;
    }

    // ── Case 2: brand-new school user — self-register ────────────────────────
    // Create a placeholder School + linked school_user account.
    const newUser = await User.create({
      name:     payload.name || email.split('@')[0],
      email,
      password: require('crypto').randomBytes(20).toString('hex'), // random unusable password — Google-only login
      role:     'school_user',
      photo:    payload.picture || null,
      isActive: true,
    });

    try {
      const school = await School.create({
        schoolName:    payload.name ? `${payload.name}'s School` : 'New School (Pending Setup)',
        udiseCode:     'Not set', // placeholder — school must fill this in via Edit Profile
        email,
        phone:         '0000000000', // placeholder — school must fill this in via Edit Profile
        address:       { city: 'Not set', state: 'Not set' },
        currentStatus: 'New',
        schoolUser:    newUser._id,
      });

      await SchoolStatusHistory.create({
        school:        school._id,
        oldStatus:     null,
        newStatus:     'New',
        updatedBy:     newUser._id,
        updatedByRole: 'school_user',
        remarks:       'Self-registered via Google Sign-In',
      });

      await logActivity({
        user: newUser,
        action: 'School Created',
        description: `${newUser.name} self-registered via Google Sign-In`,
        req,
      });
    } catch (err) {
      // Roll back the user account if the linked School couldn't be created —
      // otherwise they end up with a login but "No school linked" forever.
      await User.findByIdAndDelete(newUser._id);
      throw err;
    }

    await sendTokens(newUser, 201, res, req);
  } catch (err) {
    console.error('googleAuthSchool error:', err);
    res.status(500).json({ success: false, message: 'Server error during Google sign-in.' });
  }
};

module.exports = { login, refreshToken, logout, getMe, changePassword, forgotPassword, resetPassword, registerSchool, googleAuthSchool };
