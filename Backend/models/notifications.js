// models/Notification.js - Notification system model
const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Recipient is required']
  },
  
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  type: {
    type: String,
    enum: [
      'session_start',
      'session_end', 
      'session_reminder',
      'poll_created',
      'poll_closed',
      'message_received',
      'mention',
      'alert_generated',
      'assignment_due',
      'announcement',
      'system_update',
      'attendance_warning',
      'engagement_low',
      'technical_issue'
    ],
    required: [true, 'Notification type is required']
  },
  
  title: {
    type: String,
    required: [true, 'Title is required'],
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  
  message: {
    type: String,
    required: [true, 'Message is required'],
    maxlength: [1000, 'Message cannot exceed 1000 characters']
  },
  
  // Rich content
  data: {
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ClassSession'
    },
    pollId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Poll'
    },
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChatMessage'
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    actionUrl: String,
    metadata: mongoose.Schema.Types.Mixed
  },
  
  // Notification status
  isRead: {
    type: Boolean,
    default: false
  },
  
  readAt: Date,
  
  // Delivery preferences
  channels: {
    inApp: { type: Boolean, default: true },
    email: { type: Boolean, default: false },
    sms: { type: Boolean, default: false },
    push: { type: Boolean, default: true }
  },
  
  // Delivery status
  deliveryStatus: {
    inApp: {
      delivered: { type: Boolean, default: false },
      deliveredAt: Date
    },
    email: {
      delivered: { type: Boolean, default: false },
      deliveredAt: Date,
      opened: { type: Boolean, default: false },
      openedAt: Date
    },
    sms: {
      delivered: { type: Boolean, default: false },
      deliveredAt: Date
    },
    push: {
      delivered: { type: Boolean, default: false },
      deliveredAt: Date,
      clicked: { type: Boolean, default: false },
      clickedAt: Date
    }
  },
  
  // Priority and scheduling
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  },
  
  scheduledFor: Date,
  sentAt: Date,
  
  // Grouping and batching
  groupKey: String,
  batchId: String,
  
  // Auto-expire
  expiresAt: Date,
  
  // User actions
  isArchived: { type: Boolean, default: false },
  archivedAt: Date,
  
  isDismissed: { type: Boolean, default: false },
  dismissedAt: Date
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

