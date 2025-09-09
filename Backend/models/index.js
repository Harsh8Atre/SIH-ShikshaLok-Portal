notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
notificationSchema.index({ scheduledFor: 1 });

// Virtual for delivery status summary
notificationSchema.virtual('isDelivered').get(function() {
  return this.deliveryStatus.inApp.delivered || 
         this.deliveryStatus.email.delivered || 
         this.deliveryStatus.sms.delivered || 
         this.deliveryStatus.push.delivered;
});

// Instance method to mark as read
notificationSchema.methods.markAsRead = function() {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

// Instance method to mark as delivered
notificationSchema.methods.markAsDelivered = function(channel) {
  if (this.deliveryStatus[channel]) {
    this.deliveryStatus[channel].delivered = true;
    this.deliveryStatus[channel].deliveredAt = new Date();
  }
  return this.save();
};

// Static method to create notification
notificationSchema.statics.createNotification = function(data) {
  const notification = new this(data);
  
  // Set scheduled time if not provided
  if (!notification.scheduledFor) {
    notification.scheduledFor = new Date();
  }
  
  // Set expiry if not provided
  if (!notification.expiresAt) {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 30); // 30 days default
    notification.expiresAt = expiry;
  }
  
  return notification.save();
};

// Static method to get user notifications
notificationSchema.statics.getUserNotifications = function(userId, options = {}) {
  const {
    limit = 50,
    skip = 0,
    unreadOnly = false,
    types = null
  } = options;
  
  const query = { recipient: userId };
  
  if (unreadOnly) {
    query.isRead = false;
  }
  
  if (types && types.length > 0) {
    query.type = { $in: types };
  }
  
  return this.find(query)
    .populate('sender', 'name role')
    .populate('data.sessionId', 'title subject')
    .populate('data.userId', 'name')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

const Notification = mongoose.model('Notification', notificationSchema);

//============================================================================

// models/index.js - Export all models
const User = require('./User');
const College = require('./college');
const ClassSession = require('./ClassSession');
const Attendance = require('./attendance');
const { Poll, ChatMessage } = require('./Poll'); // Import both from the combined file
const Notification = require('./Notification');

module.exports = {
  User,
  College,
  ClassSession,
  Attendance,
  Poll,
  ChatMessage,
  Notification
};