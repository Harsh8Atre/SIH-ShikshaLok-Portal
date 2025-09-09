// models/Attendance.js - Student attendance and monitoring model
const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Student reference is required']
  },
  
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClassSession',
    required: [true, 'Session reference is required']
  },
  
  // Location tracking
  location: {
    latitude: {
      type: Number,
      validate: {
        validator: function(lat) {
          return lat >= -90 && lat <= 90;
        },
        message: 'Latitude must be between -90 and 90'
      }
    },
    longitude: {
      type: Number,
      validate: {
        validator: function(lng) {
          return lng >= -180 && lng <= 180;
        },
        message: 'Longitude must be between -180 and 180'
      }
    },
    address: String,
    accuracy: Number, // GPS accuracy in meters
    timestamp: {
      type: Date,
      default: Date.now
    },
    isVerified: {
      type: Boolean,
      default: false
    }
  },
  
  // Time tracking
  joinTime: Date,
  leaveTime: Date,
  totalDuration: {
    type: Number, // in minutes
    default: 0
  },
  
  isPresent: {
    type: Boolean,
    default: false
  },
  
  // Behavior monitoring
  activityMonitoring: {
    tabSwitches: { type: Number, default: 0 },
    appSwitches: { type: Number, default: 0 },
    windowFocusLoss: { type: Number, default: 0 },
    inactiveTime: { type: Number, default: 0 }, // in seconds
    keystrokeCount: { type: Number, default: 0 },
    mouseMovements: { type: Number, default: 0 },
    screenshotAttempts: { type: Number, default: 0 },
    recordingAttempts: { type: Number, default: 0 }
  },
  
  // Engagement metrics
  engagement: {
    messagesCount: { type: Number, default: 0 },
    pollsParticipated: { type: Number, default: 0 },
    questionsAsked: { type: Number, default: 0 },
    reactionsGiven: { type: Number, default: 0 },
    averageResponseTime: { type: Number, default: 0 }, // in seconds
    attentionScore: { type: Number, default: 0, min: 0, max: 100 },
    participationScore: { type: Number, default: 0, min: 0, max: 100 }
  },
  
  // Activity alerts and violations
  alerts: [{
    type: {
      type: String,
      enum: [
        'tab_switch', 
        'location_change', 
        'app_switch', 
        'window_focus_loss',
        'inactive_period', 
        'screenshot_attempt', 
        'recording_attempt',
        'suspicious_activity',
        'network_disconnect',
        'unauthorized_device'
      ],
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    details: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'medium'
    },
    isResolved: {
      type: Boolean,
      default: false
    },
    resolvedAt: Date,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    additionalData: mongoose.Schema.Types.Mixed
  }],
  
  // Device and browser information
  deviceInfo: {
    userAgent: String,
    platform: String,
    browser: String,
    browserVersion: String,
    screenResolution: String,
    ipAddress: String,
    deviceFingerprint: String,
    isMobile: { type: Boolean, default: false },
    operatingSystem: String
  },
  
  // Network monitoring
  networkInfo: {
    connectionType: String, // wifi, cellular, ethernet
    downloadSpeed: Number, // Mbps
    uploadSpeed: Number, // Mbps
    latency: Number, // ms
    disconnections: { type: Number, default: 0 },
    reconnections: { type: Number, default: 0 },
    qualityScore: { type: Number, default: 100, min: 0, max: 100 }
  },
  
  // Authentication and security
  security: {
    loginMethod: String,
    multipleLoginAttempts: { type: Number, default: 0 },
    sessionTokens: [String],
    lastTokenRefresh: Date,
    securityFlags: [{
      flag: String,
      timestamp: { type: Date, default: Date.now },
      details: String
    }]
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['joined', 'active', 'inactive', 'suspicious', 'disconnected', 'left'],
    default: 'joined'
  },
  
  lastActivity: {
    type: Date,
    default: Date.now
  },
  
  // Auto-calculated fields
  calculated: {
    attendancePercentage: { type: Number, default: 0, min: 0, max: 100 },
    engagementLevel: {
      type: String,
      enum: ['very_low', 'low', 'medium', 'high', 'very_high'],
      default: 'medium'
    },
    behaviorScore: { type: Number, default: 100, min: 0, max: 100 },
    riskLevel: {
      type: String,
      enum: ['low', 'medium', 'high', 'critical'],
      default: 'low'
    }
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound indexes for efficient queries
attendanceSchema.index({ student: 1, session: 1 }, { unique: true });
attendanceSchema.index({ session: 1, isPresent: 1 });
attendanceSchema.index({ student: 1, createdAt: -1 });
attendanceSchema.index({ 'alerts.type': 1, 'alerts.severity': 1 });
attendanceSchema.index({ status: 1, lastActivity: -1 });

// Virtual for session duration calculation
attendanceSchema.virtual('sessionDuration').get(function() {
  if (this.joinTime && this.leaveTime) {
    return Math.floor((this.leaveTime - this.joinTime) / (1000 * 60)); // minutes
  }
  if (this.joinTime && !this.leaveTime && this.isPresent) {
    return Math.floor((Date.now() - this.joinTime) / (1000 * 60)); // minutes
  }
  return 0;
});

// Virtual for alert summary
attendanceSchema.virtual('alertSummary').get(function() {
  const alerts = this.alerts || [];
  return {
    total: alerts.length,
    high: alerts.filter(a => a.severity === 'high').length,
    critical: alerts.filter(a => a.severity === 'critical').length,
    unresolved: alerts.filter(a => !a.isResolved).length
  };
});

// Virtual for engagement level calculation
attendanceSchema.virtual('calculatedEngagementLevel').get(function() {
  const score = this.engagement.participationScore;
  if (score >= 80) return 'very_high';
  if (score >= 60) return 'high';
  if (score >= 40) return 'medium';
  if (score >= 20) return 'low';
  return 'very_low';
});

// Pre-save middleware for calculations
attendanceSchema.pre('save', function(next) {
  // Calculate total duration
  if (this.joinTime && this.leaveTime) {
    this.totalDuration = Math.floor((this.leaveTime - this.joinTime) / (1000 * 60));
  }
  
  // Calculate behavior score based on violations
  let behaviorScore = 100;
  const monitoring = this.activityMonitoring;
  
  behaviorScore -= monitoring.tabSwitches * 2;
  behaviorScore -= monitoring.appSwitches * 5;
  behaviorScore -= monitoring.windowFocusLoss * 1;
  behaviorScore -= monitoring.screenshotAttempts * 20;
  behaviorScore -= monitoring.recordingAttempts * 30;
  
  this.calculated.behaviorScore = Math.max(0, behaviorScore);
  
  // Calculate engagement level
  this.calculated.engagementLevel = this.calculatedEngagementLevel;
  
  // Calculate risk level based on alerts
  const criticalAlerts = this.alerts.filter(a => a.severity === 'critical').length;
  const highAlerts = this.alerts.filter(a => a.severity === 'high').length;
  
  if (criticalAlerts > 0 || this.calculated.behaviorScore < 30) {
    this.calculated.riskLevel = 'critical';
  } else if (highAlerts > 2 || this.calculated.behaviorScore < 50) {
    this.calculated.riskLevel = 'high';
  } else if (highAlerts > 0 || this.calculated.behaviorScore < 70) {
    this.calculated.riskLevel = 'medium';
  } else {
    this.calculated.riskLevel = 'low';
  }
  
  next();
});

// Instance method to add alert
attendanceSchema.methods.addAlert = function(type, details, severity = 'medium', additionalData = null) {
  this.alerts.push({
    type,
    details,
    severity,
    additionalData
  });
  
  // Update activity monitoring counters
  if (type === 'tab_switch') {
    this.activityMonitoring.tabSwitches += 1;
  } else if (type === 'app_switch') {
    this.activityMonitoring.appSwitches += 1;
  } else if (type === 'window_focus_loss') {
    this.activityMonitoring.windowFocusLoss += 1;
  } else if (type === 'screenshot_attempt') {
    this.activityMonitoring.screenshotAttempts += 1;
  } else if (type === 'recording_attempt') {
    this.activityMonitoring.recordingAttempts += 1;
  }
  
  this.lastActivity = new Date();
  return this.save();
};

// Instance method to update location
attendanceSchema.methods.updateLocation = function(latitude, longitude, address, accuracy = null) {
  const previousLocation = this.location;
  
  this.location = {
    latitude,
    longitude,
    address,
    accuracy,
    timestamp: new Date(),
    isVerified: true
  };
  
  // Check for significant location change
  if (previousLocation.latitude && previousLocation.longitude) {
    const distance = this.calculateDistance(
      previousLocation.latitude, 
      previousLocation.longitude,
      latitude, 
      longitude
    );
    
    // Alert if moved more than 100 meters
    if (distance > 0.1) {
      this.addAlert(
        'location_change',
        `Location changed by ${distance.toFixed(2)} km`,
        distance > 1 ? 'high' : 'medium',
        { previousLocation, newLocation: this.location, distance }
      );
    }
  }
  
  return this.save();
};

// Instance method to calculate distance between coordinates
attendanceSchema.methods.calculateDistance = function(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// Instance method to update engagement
attendanceSchema.methods.updateEngagement = function(type, value = 1) {
  switch(type) {
    case 'message':
      this.engagement.messagesCount += value;
      break;
    case 'poll':
      this.engagement.pollsParticipated += value;
      break;
    case 'question':
      this.engagement.questionsAsked += value;
      break;
    case 'reaction':
      this.engagement.reactionsGiven += value;
      break;
  }
  
  // Recalculate participation score
  const baseScore = 50;
  const messageScore = Math.min(this.engagement.messagesCount * 2, 20);
  const pollScore = Math.min(this.engagement.pollsParticipated * 5, 15);
  const questionScore = Math.min(this.engagement.questionsAsked * 3, 10);
  const reactionScore = Math.min(this.engagement.reactionsGiven * 1, 5);
  
  this.engagement.participationScore = Math.min(100, 
    baseScore + messageScore + pollScore + questionScore + reactionScore
  );
  
  this.lastActivity = new Date();
  return this.save();
};

// Static method to get session attendance summary
attendanceSchema.statics.getSessionSummary = function(sessionId) {
  return this.aggregate([
    { $match: { session: mongoose.Types.ObjectId(sessionId) } },
    {
      $group: {
        _id: '$session',
        totalStudents: { $sum: 1 },
        presentStudents: { $sum: { $cond: ['$isPresent', 1, 0] } },
        averageDuration: { $avg: '$totalDuration' },
        totalAlerts: { $sum: { $size: '$alerts' } },
        averageBehaviorScore: { $avg: '$calculated.behaviorScore' },
        averageEngagement: { $avg: '$engagement.participationScore' }
      }
    },
    {
      $addFields: {
        attendanceRate: {
          $round: [{ $multiply: [{ $divide: ['$presentStudents', '$totalStudents'] }, 100] }, 2]
        }
      }
    }
  ]);
};

// Static method to get student attendance history
attendanceSchema.statics.getStudentHistory = function(studentId, limit = 10) {
  return this.find({ student: studentId })
    .populate('session', 'title subject scheduledStartTime faculty')
    .populate('session.faculty', 'name')
    .sort({ createdAt: -1 })
    .limit(limit);
};

module.exports = mongoose.model('Attendance', attendanceSchema);