const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const softDelete = require('./plugins/softDelete');

const userSchema = new mongoose.Schema(
  {
    name:  { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6, select: false },

    role: {
      type: String,
      enum: ['superadmin', 'admin', 'school_user'],
      required: true,
    },

    phone:   { type: String, trim: true },
    photo:   { type: String, default: null },   // file path or URL
    address: { type: String, trim: true },

    // Profile completion
    isProfileComplete: { type: Boolean, default: false },

    // Account status
    isActive:    { type: Boolean, default: true },
    isVerified:  { type: Boolean, default: false },
    lastLogin:   { type: Date,    default: null },

    // Notification preferences
    notificationPrefs: {
      email:  { type: Boolean, default: true },
      system: { type: Boolean, default: true },
    },

    // Password reset — resetPasswordToken stores a bcrypt hash of the 6-digit
    // code emailed to the user, never the code itself.
    resetPasswordToken:    { type: String, select: false },
    resetPasswordExpires:  { type: Date,   select: false },
    resetPasswordAttempts: { type: Number, default: 0, select: false },

    // Login history (last 10 entries)
    loginHistory: [
      {
        ip:        String,
        device:    String,
        browser:   String,
        loginAt:   { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Apply soft-delete plugin
userSchema.plugin(softDelete);

// Hash password before save
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password
userSchema.methods.matchPassword = async function (enteredPassword) {
  return bcrypt.compare(enteredPassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
