// models/College.js - College/Institution model
const mongoose = require('mongoose');

const collegeSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'College name is required'],
    trim: true,
    minlength: [3, 'College name must be at least 3 characters'],
    maxlength: [100, 'College name cannot exceed 100 characters']
  },
  
  address: {
    street: String,
    city: String,
    state: String,
    country: { type: String, default: 'India' },
    postalCode: String,
    full: String // Complete address string
  },
  
  contact: {
    email: {
      type: String,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    phone: {
      type: String,
      match: [/^\+?[\d\s-()]+$/, 'Please enter a valid phone number']
    },
    website: {
      type: String,
      match: [/^https?:\/\/.*/, 'Please enter a valid website URL']
    }
  },
  
  establishedYear: {
    type: Number,
    min: [1800, 'Establishment year cannot be before 1800'],
    max: [new Date().getFullYear(), 'Establishment year cannot be in the future']
  },
  
  // Administrative details
  admin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'College admin is required']
  },
  
  // Relationships
  students: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  faculty: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // College settings
  settings: {
    allowSelfEnrollment: {
      type: Boolean,
      default: false
    },
    requireLocationVerification: {
      type: Boolean,
      default: true
    },
    maxStudentsPerSession: {
      type: Number,
      default: 100,
      min: [1, 'Must allow at least 1 student per session'],
      max: [1000, 'Cannot exceed 1000 students per session']
    },
    sessionRecordingEnabled: {
      type: Boolean,
      default: true
    },
    allowGuestAccess: {
      type: Boolean,
      default: false
    },
    timezone: {
      type: String,
      default: 'Asia/Kolkata'
    },
    academicYear: {
      start: Date,
      end: Date
    }
  },
  
  // Subscription and limits
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'basic', 'premium', 'enterprise'],
      default: 'free'
    },
    maxStudents: {
      type: Number,
      default: 50
    },
    maxFaculty: {
      type: Number,
      default: 5
    },
    maxConcurrentSessions: {
      type: Number,
      default: 2
    },
    features: {
      recording: { type: Boolean, default: false },
      analytics: { type: Boolean, default: false },
      api_access: { type: Boolean, default: false },
      custom_branding: { type: Boolean, default: false }
    },
    expiresAt: Date
  },
  
  // Status and verification
  isActive: {
    type: Boolean,
    default: true
  },
  
  isVerified: {
    type: Boolean,
    default: false
  },
  
  verificationDocument: {
    type: String, // URL to verification document
    uploadedAt: Date
  },
  
  // Statistics (computed fields)
  stats: {
    totalStudents: { type: Number, default: 0 },
    totalFaculty: { type: Number, default: 0 },
    totalSessions: { type: Number, default: 0 },
    activeSessionsCount: { type: Number, default: 0 },
    lastSessionAt: Date
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
collegeSchema.index({ 'contact.email': 1 });
collegeSchema.index({ admin: 1 });
collegeSchema.index({ isActive: 1, isVerified: 1 });
collegeSchema.index({ 'subscription.plan': 1 });

// Virtual for full address
collegeSchema.virtual('fullAddress').get(function() {
  if (this.address.full) return this.address.full;
  
  const parts = [
    this.address.street,
    this.address.city,
    this.address.state,
    this.address.country,
    this.address.postalCode
  ].filter(part => part && part.trim());
  
  return parts.join(', ');
});

// Virtual for student count
collegeSchema.virtual('studentCount').get(function() {
  return this.students ? this.students.length : 0;
});

// Virtual for faculty count
collegeSchema.virtual('facultyCount').get(function() {
  return this.faculty ? this.faculty.length : 0;
});

// Virtual for subscription status
collegeSchema.virtual('subscriptionStatus').get(function() {
  if (!this.subscription.expiresAt) return 'active';
  return new Date() > this.subscription.expiresAt ? 'expired' : 'active';
});

// Pre-save middleware to update stats
collegeSchema.pre('save', function(next) {
  if (this.students) {
    this.stats.totalStudents = this.students.length;
  }
  if (this.faculty) {
    this.stats.totalFaculty = this.faculty.length;
  }
  next();
});

// Instance method to add student
collegeSchema.methods.addStudent = function(studentId) {
  if (!this.students.includes(studentId)) {
    this.students.push(studentId);
    this.stats.totalStudents = this.students.length;
  }
  return this.save();
};

// Instance method to remove student
collegeSchema.methods.removeStudent = function(studentId) {
  this.students = this.students.filter(id => !id.equals(studentId));
  this.stats.totalStudents = this.students.length;
  return this.save();
};

// Instance method to add faculty
collegeSchema.methods.addFaculty = function(facultyId) {
  if (!this.faculty.includes(facultyId)) {
    this.faculty.push(facultyId);
    this.stats.totalFaculty = this.faculty.length;
  }
  return this.save();
};

// Instance method to remove faculty
collegeSchema.methods.removeFaculty = function(facultyId) {
  this.faculty = this.faculty.filter(id => !id.equals(facultyId));
  this.stats.totalFaculty = this.faculty.length;
  return this.save();
};

// Instance method to check subscription limits
collegeSchema.methods.canAddStudent = function() {
  return this.students.length < this.subscription.maxStudents;
};

collegeSchema.methods.canAddFaculty = function() {
  return this.faculty.length < this.subscription.maxFaculty;
};

collegeSchema.methods.canCreateSession = function(currentActiveSessions = 0) {
  return currentActiveSessions < this.subscription.maxConcurrentSessions;
};

// Static method to find by admin
collegeSchema.statics.findByAdmin = function(adminId) {
  return this.findOne({ admin: adminId, isActive: true });
};

// Static method to get colleges with statistics
collegeSchema.statics.findWithStats = function(query = {}) {
  return this.aggregate([
    { $match: { isActive: true, ...query } },
    {
      $lookup: {
        from: 'users',
        localField: 'students',
        foreignField: '_id',
        as: 'studentDetails'
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'faculty',
        foreignField: '_id',
        as: 'facultyDetails'
      }
    },
    {
      $lookup: {
        from: 'classsessions',
        localField: '_id',
        foreignField: 'college',
        as: 'sessions'
      }
    },
    {
      $addFields: {
        totalStudents: { $size: '$students' },
        totalFaculty: { $size: '$faculty' },
        totalSessions: { $size: '$sessions' },
        activeSessionsCount: {
          $size: {
            $filter: {
              input: '$sessions',
              cond: { $eq: ['$$this.isActive', true] }
            }
          }
        }
      }
    }
  ]);
};

module.exports = mongoose.model('College', collegeSchema);