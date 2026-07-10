const jwt        = require('jsonwebtoken');
const crypto     = require('crypto');
const RefreshToken = require('../models/RefreshToken');

// ── Access Token (short-lived, sent in response body)
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      id:   user._id,
      role: user.role,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
};

// ── Refresh Token (long-lived, stored in DB + httpOnly cookie)
const generateRefreshToken = async (user, ipAddress, userAgent) => {
  // Opaque random token — not a JWT
  const token = crypto.randomBytes(64).toString('hex');

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

  // Revoke any existing refresh tokens for this user+device
  await RefreshToken.updateMany(
    { user: user._id, isRevoked: false },
    { isRevoked: true, revokedAt: new Date() }
  );

  // Store new token in DB
  await RefreshToken.create({
    user:      user._id,
    token,
    ipAddress,
    userAgent,
    expiresAt,
  });

  return token;
};

// ── Send both tokens
// Access token → response JSON
// Refresh token → httpOnly cookie (not accessible by JS)
const sendTokens = async (user, statusCode, res, req) => {
  const accessToken  = generateAccessToken(user);
  const refreshToken = await generateRefreshToken(
    user,
    req.ip,
    req.headers['user-agent']
  );

  // httpOnly cookie — 7 days
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   7 * 24 * 60 * 60 * 1000, // 7 days in ms
  });

  res.status(statusCode).json({
    success: true,
    accessToken,
    user: {
      _id:   user._id,
      name:  user.name,
      email: user.email,
      role:  user.role,
      photo: user.photo,
      isProfileComplete: user.isProfileComplete,
    },
  });
};

module.exports = { generateAccessToken, generateRefreshToken, sendTokens };
