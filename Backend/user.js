// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Name is required'], 
    trim: true,
    minlength: [2, 'Name must be at least 2 characters'],
    maxlength: [50, 'Name cannot exceed 50 characters']
  },
  
  email: { 
    type: String, 
    required: [true, 'Email is required'], 
    unique: true, 
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  
  password: { 
    type: String, 
    required: [true, 'Password is required'], 
    minlength: [6, 'Password must be at least 6 characters']
  },
  
  role: { 
    type: String, 
    enum: {
      values: ['admin', 'faculty', 'student'],
      message: 'Role must be admin, faculty, or student'
    }, 
    required: [true, 'Role is required'] 
  },
  
  phoneNumber: { 
    type: String, 
    trim: true,
    match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
  },
  
  college: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'College',
    required: function() {
      return this.role !== 'admin' || (this.role === 'admin' && !this.isNew);
    }
  },
  
  isActive: { 
    type: Boolean, 
    default: true 
  },
  
  profilePicture: {
    type: String,
    default: null
  },
  
  lastLogin: {
    type: Date,
    default: null
  },
  
  settings: {
    notifications: { type: Boolean, default: true },
    emailUpdates: { type: Boolean, default: true },
    theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    language: { type: String, default: 'en' }
  },
  
  // Faculty specific fields
  specialization: {
    type: String,
    required: function() { return this.role === 'faculty'; }
  },
  
  experience: {
    type: Number, // years of experience
    min: 0,
    required: function() { return this.role === 'faculty'; }
  },
  
  // Student specific fields
  studentId: {
    type: String,
    unique: true,
    sparse: true, // allows null values to not be unique
    required: function() { return this.role === 'student'; }
  },
  
  enrollmentYear: {
    type: Number,
    required: function() { return this.role === 'student'; }
  },
  
  // Security fields
  passwordResetToken: String,
  passwordResetExpires: Date,
  emailVerificationToken: String,
  emailVerified: { type: Boolean, default: false },
  
  // Tracking
  loginAttempts: { type: Number, default: 0 },
  lockUntil: Date

}, {
  timestamps: true,
  toJSON: { 
    transform: function(doc, ret) {
      delete ret.password;
      delete ret.passwordResetToken;
      delete ret.emailVerificationToken;
      return ret;
    }
  }
});

// Indexes for better performance
userSchema.index({ email: 1 });
userSchema.index({ college: 1, role: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ studentId: 1 }, { sparse: true });

// Virtual for account lock status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

// Instance method to increment login attempts
userSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 }};
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Static method to get user by email with password
userSchema.statics.findByCredentials = async function(email, password) {
  const user = await this.findOne({ 
    email: email.toLowerCase(), 
    isActive: true 
  }).select('+password');
  
  if (!user) {
    throw new Error('Invalid credentials');
  }
  
  if (user.isLocked) {
    throw new Error('Account is temporarily locked. Please try again later.');
  }
  
  const isMatch = await user.comparePassword(password);
  
  if (!isMatch) {
    await user.incLoginAttempts();
    throw new Error('Invalid credentials');
  }
  
  // Reset login attempts on successful login
  if (user.loginAttempts > 0) {
    await user.updateOne({
      $unset: { loginAttempts: 1, lockUntil: 1 }
    });
  }
  
  // Update last login
  user.lastLogin = new Date();
  await user.save();
  
  return user;
};

// Static method to find users by role
userSchema.statics.findByRole = function(role, collegeId = null) {
  const query = { role, isActive: true };
  if (collegeId) query.college = collegeId;
  return this.find(query).populate('college', 'name');
};

module.exports = mongoose.model('User', userSchema);