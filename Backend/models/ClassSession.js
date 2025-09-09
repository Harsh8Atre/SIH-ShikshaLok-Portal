// models/ClassSession.js - Class session model for live sessions
const mongoose = require('mongoose');

const classSessionSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Session title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  
  subject: {
    type: String,
    required: [true, 'Subject is required'],
    trim: true,
    maxlength: [100, 'Subject cannot exceed 100 characters']
  },
  
  description: {
    type: String,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  
  // Session ownership
  faculty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Faculty member is required']
  },
  
  college: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'College',
    required: [true, 'College is required']
  },
  
  // Scheduling
  scheduledStartTime: {
    type: Date,
    required: [true, 'Start time is required']
  },
  
  scheduledEndTime: {
    type: Date,
    validate: {
      validator: function(endTime) {
        return !endTime || endTime > this.scheduledStartTime;
      },
      message: 'End time must be after start time'
    }
  },
  
  actualStartTime: Date,
  actualEndTime: Date,
  
  duration: {
    type: Number, // in minutes
    default: 60,
    min: [5, 'Session must be at least 5 minutes'],
    max: [480, 'Session cannot exceed 8 hours']
  },
  
  // Session status
  status: {
    type: String,
    enum: ['scheduled', 'live', 'paused', 'ended', 'cancelled'],
    default: 'scheduled'
  },
  
  isActive: {
    type: Boolean,
    default: false
  },
  
  // Recurring sessions
  isRecurring: {
    type: Boolean,
    default: false
  },
  
  recurringPattern: {
    type: {
      type: String,
      enum: ['daily', 'weekly', 'monthly']
    },
    interval: Number, // every N days/weeks/months
    daysOfWeek: [Number], // 0-6, Sunday = 0
    endDate: Date
  },
  
  // Students in session
  students: [{
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    enrolledAt: {
      type: Date,
      default: Date.now
    },
    joinedAt: Date,
    leftAt: Date,
    isPresent: {
      type: Boolean,
      default: false
    },
    lastActivity: Date,
    participationScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    }
  }],
  
  // Session settings
  settings: {
    allowLateJoin: {
      type: Boolean,
      default: true
    },
    lateJoinCutoffMinutes: {
      type: Number,
      default: 15
    },
    requireLocationVerification: {
      type: Boolean,
      default: true
    },
    enableChat: {
      type: Boolean,
      default: true
    },
    enablePolls: {
      type: Boolean,
      default: true
    },
    enableScreenShare: {
      type: Boolean,
      default: true
    },
    enableRecording: {
      type: Boolean,
      default: false
    },
    autoEndAfterMinutes: {
      type: Number,
      default: null // null means no auto-end
    },
    maxConcurrentStudents: {
      type: Number,
      default: 100
    }
  },
  
  // Recording details
  recording: {
    isRecording: {
      type: Boolean,
      default: false
    },
    recordingId: String,
    recordingUrl: String,
    startTime: Date,
    endTime: Date,
    fileSize: Number,
    duration: Number, // in seconds
    isProcessed: {
      type: Boolean,
      default: false
    },
    thumbnailUrl: String
  },
  
  // Session materials and resources
  materials: [{
    name: String,
    originalName: String,
    url: String,
    type: {
      type: String,
      enum: ['pdf', 'ppt', 'doc', 'video', 'image', 'audio', 'other']
    },
    size: Number,
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Session analytics
  analytics: {
    totalStudentsEnrolled: { type: Number, default: 0 },
    totalStudentsJoined: { type: Number, default: 0 },
    maxConcurrentStudents: { type: Number, default: 0 },
    averageAttendanceTime: { type: Number, default: 0 }, // in minutes
    totalMessages: { type: Number, default: 0 },
    totalPolls: { type: Number, default: 0 },
    totalAlerts: { type: Number, default: 0 },
    engagementScore: { type: Number, default: 0, min: 0, max: 100 },
    attendanceRate: { type: Number, default: 0, min: 0, max: 100 }
  },
  
  // Technical details
  technical: {
    streamingUrl: String,
    streamingKey: String,
    chatRoomId: String,
    maxBitrate: { type: Number, default: 1000 },
    resolution: { type: String, default: '720p' }
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
classSessionSchema.index({ faculty: 1, scheduledStartTime: -1 });
classSessionSchema.index({ college: 1, status: 1 });
classSessionSchema.index({ status: 1, isActive: 1 });
classSessionSchema.index({ scheduledStartTime: 1, scheduledEndTime: 1 });
classSessionSchema.index({ 'students.student': 1 });

// Virtual for session duration in real-time
classSessionSchema.virtual('actualDuration').get(function() {
  if (this.actualStartTime && this.actualEndTime) {
    return Math.floor((this.actualEndTime - this.actualStartTime) / (1000 * 60)); // in minutes
  }
  if (this.actualStartTime && this.status === 'live') {
    return Math.floor((Date.now() - this.actualStartTime) / (1000 * 60)); // in minutes
  }
  return 0;
});

// Virtual for attendance rate calculation
classSessionSchema.virtual('calculatedAttendanceRate').get(function() {
  if (this.students.length === 0) return 0;
  const presentCount = this.students.filter(s => s.isPresent).length;
  return Math.round((presentCount / this.students.length) * 100);
});

// Virtual to check if session is ongoing
classSessionSchema.virtual('isOngoing').get(function() {
  return this.status === 'live' && this.isActive;
});

// Virtual to check if late join is allowed
classSessionSchema.virtual('canJoinLate').get(function() {
  if (!this.settings.allowLateJoin || this.status !== 'live') return false;
  
  const cutoffTime = new Date(this.actualStartTime);
  cutoffTime.setMinutes(cutoffTime.getMinutes() + this.settings.lateJoinCutoffMinutes);
  
  return Date.now() <= cutoffTime.getTime();
});

// Pre-save middleware
classSessionSchema.pre('save', function(next) {
  // Update analytics
  this.analytics.totalStudentsEnrolled = this.students.length;
  this.analytics.totalStudentsJoined = this.students.filter(s => s.joinedAt).length;
  this.analytics.attendanceRate = this.calculatedAttendanceRate;
  
  next();
});

// Instance method to start session
classSessionSchema.methods.startSession = function() {
  this.status = 'live';
  this.isActive = true;
  this.actualStartTime = new Date();
  return this.save();
};

// Instance method to end session
classSessionSchema.methods.endSession = function() {
  this.status = 'ended';
  this.isActive = false;
  this.actualEndTime = new Date();
  
  // Mark all currently present students as left
  this.students.forEach(student => {
    if (student.isPresent && !student.leftAt) {
      student.leftAt = new Date();
      student.isPresent = false;
    }
  });
  
  return this.save();
};

// Instance method to pause session
classSessionSchema.methods.pauseSession = function() {
  this.status = 'paused';
  return this.save();
};

// Instance method to resume session
classSessionSchema.methods.resumeSession = function() {
  this.status = 'live';
  return this.save();
};

// Instance method to add student
classSessionSchema.methods.addStudent = function(studentId) {
  const existingStudent = this.students.find(s => s.student.equals(studentId));
  
  if (!existingStudent) {
    this.students.push({
      student: studentId,
      enrolledAt: new Date()
    });
  }
  
  return this.save();
};

// Instance method to mark student as joined
classSessionSchema.methods.markStudentJoined = function(studentId) {
  const student = this.students.find(s => s.student.equals(studentId));
  
  if (student) {
    student.joinedAt = new Date();
    student.isPresent = true;
    student.lastActivity = new Date();
    
    // Update max concurrent students
    const currentPresent = this.students.filter(s => s.isPresent).length;
    if (currentPresent > this.analytics.maxConcurrentStudents) {
      this.analytics.maxConcurrentStudents = currentPresent;
    }
  }
  
  return this.save();
};

// Instance method to mark student as left
classSessionSchema.methods.markStudentLeft = function(studentId) {
  const student = this.students.find(s => s.student.equals(studentId));
  
  if (student) {
    student.leftAt = new Date();
    student.isPresent = false;
  }
  
  return this.save();
};

// Static method to find active sessions
classSessionSchema.statics.findActiveSessions = function(collegeId = null) {
  const query = { status: 'live', isActive: true };
  if (collegeId) query.college = collegeId;
  
  return this.find(query)
    .populate('faculty', 'name email')
    .populate('college', 'name')
    .populate('students.student', 'name email');
};

// Static method to find sessions by faculty
classSessionSchema.statics.findByFaculty = function(facultyId, status = null) {
  const query = { faculty: facultyId };
  if (status) query.status = status;
  
  return this.find(query)
    .populate('college', 'name')
    .sort({ scheduledStartTime: -1 });
};

// Static method to find upcoming sessions
classSessionSchema.statics.findUpcoming = function(collegeId = null, hours = 24) {
  const now = new Date();
  const futureTime = new Date(now.getTime() + hours * 60 * 60 * 1000);
  
  const query = {
    status: 'scheduled',
    scheduledStartTime: {
      $gte: now,
      $lte: futureTime
    }
  };
  
  if (collegeId) query.college = collegeId;
  
  return this.find(query)
    .populate('faculty', 'name email')
    .populate('college', 'name')
    .sort({ scheduledStartTime: 1 });
};

module.exports = mongoose.model('ClassSession', classSessionSchema);