// models/Poll.js - Polling system model
const mongoose = require('mongoose');

const pollSchema = new mongoose.Schema({
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClassSession',
    required: [true, 'Session reference is required']
  },
  
  question: {
    type: String,
    required: [true, 'Poll question is required'],
    trim: true,
    maxlength: [500, 'Question cannot exceed 500 characters']
  },
  
  type: {
    type: String,
    enum: ['multiple_choice', 'single_choice', 'text_response', 'rating', 'yes_no'],
    default: 'single_choice'
  },
  
  options: [{
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, 'Option text cannot exceed 200 characters']
    },
    votes: {
      type: Number,
      default: 0,
      min: 0
    },
    voters: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      votedAt: {
        type: Date,
        default: Date.now
      },
      responseTime: Number // in seconds
    }]
  }],
  
  // Text responses for open-ended polls
  textResponses: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    response: {
      type: String,
      maxlength: [1000, 'Response cannot exceed 1000 characters']
    },
    submittedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Poll configuration
  settings: {
    allowMultipleAnswers: {
      type: Boolean,
      default: false
    },
    showResults: {
      type: String,
      enum: ['never', 'after_vote', 'after_close', 'real_time'],
      default: 'after_vote'
    },
    allowChangeVote: {
      type: Boolean,
      default: false
    },
    requireLogin: {
      type: Boolean,
      default: true
    },
    randomizeOptions: {
      type: Boolean,
      default: false
    },
    timeLimit: Number, // in seconds
    maxResponses: Number
  },
  
  isActive: {
    type: Boolean,
    default: true
  },
  
  isAnonymous: {
    type: Boolean,
    default: false
  },
  
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator is required']
  },
  
  expiresAt: Date,
  closedAt: Date,
  
  // Results and analytics
  results: {
    totalVotes: { type: Number, default: 0 },
    totalTextResponses: { type: Number, default: 0 },
    participationRate: { type: Number, default: 0 },
    averageResponseTime: { type: Number, default: 0 },
    completionRate: { type: Number, default: 0 }
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
pollSchema.index({ session: 1, createdAt: -1 });
pollSchema.index({ isActive: 1, expiresAt: 1 });
pollSchema.index({ createdBy: 1, createdAt: -1 });

// Virtual for total participants
pollSchema.virtual('totalParticipants').get(function() {
  const voters = new Set();
  this.options.forEach(option => {
    option.voters.forEach(voter => voters.add(voter.user.toString()));
  });
  return voters.size + this.textResponses.length;
});

// Pre-save middleware
pollSchema.pre('save', function(next) {
  // Update results
  this.results.totalVotes = this.options.reduce((sum, option) => sum + option.votes, 0);
  this.results.totalTextResponses = this.textResponses.length;
  
  // Calculate average response time
  let totalResponseTime = 0;
  let responseCount = 0;
  
  this.options.forEach(option => {
    option.voters.forEach(voter => {
      if (voter.responseTime) {
        totalResponseTime += voter.responseTime;
        responseCount++;
      }
    });
  });
  
  this.results.averageResponseTime = responseCount > 0 ? totalResponseTime / responseCount : 0;
  
  next();
});

// Instance method to add vote
pollSchema.methods.addVote = function(userId, optionIndex, responseTime = null) {
  if (!this.isActive || (this.expiresAt && new Date() > this.expiresAt)) {
    throw new Error('Poll is not active');
  }
  
  const option = this.options[optionIndex];
  if (!option) {
    throw new Error('Invalid option');
  }
  
  // Check if user already voted
  const hasVoted = this.options.some(opt => 
    opt.voters.some(voter => voter.user.equals(userId))
  );
  
  if (hasVoted && !this.settings.allowChangeVote) {
    throw new Error('User has already voted');
  }
  
  // Remove previous vote if changing
  if (hasVoted && this.settings.allowChangeVote) {
    this.options.forEach(opt => {
      opt.voters = opt.voters.filter(voter => !voter.user.equals(userId));
      opt.votes = opt.voters.length;
    });
  }
  
  // Add new vote
  option.voters.push({
    user: userId,
    votedAt: new Date(),
    responseTime
  });
  option.votes = option.voters.length;
  
  return this.save();
};

// Instance method to close poll
pollSchema.methods.close = function() {
  this.isActive = false;
  this.closedAt = new Date();
  return this.save();
};

const Poll = mongoose.model('Poll', pollSchema);

//============================================================================

// models/ChatMessage.js - Chat messaging model
const chatMessageSchema = new mongoose.Schema({
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ClassSession',
    required: [true, 'Session reference is required']
  },
  
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender is required']
  },
  
  // Message content
  message: {
    type: String,
    required: [true, 'Message content is required'],
    trim: true,
    maxlength: [2000, 'Message cannot exceed 2000 characters']
  },
  
  type: {
    type: String,
    enum: ['text', 'image', 'file', 'system', 'poll_notification', 'announcement'],
    default: 'text'
  },
  
  // File attachments
  attachments: [{
    fileName: String,
    originalName: String,
    fileSize: Number,
    mimeType: String,
    url: String,
    thumbnailUrl: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  
  // Message metadata
  isEdited: { type: Boolean, default: false },
  editedAt: Date,
  originalMessage: String,
  
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Targeting and privacy
  isPrivate: { type: Boolean, default: false },
  targetUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }, // for private messages
  
  // Message status
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent'
  },
  
  // Engagement
  reactions: [{
    emoji: {
      type: String,
      required: true
    },
    users: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    count: { type: Number, default: 0 }
  }],
  
  // Replies (threading)
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatMessage'
  },
  
  replies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatMessage'
  }],
  
  // Read receipts
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Moderation
  isFlagged: { type: Boolean, default: false },
  flaggedBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    flaggedAt: { type: Date, default: Date.now }
  }],
  
  isApproved: { type: Boolean, default: true },
  moderatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Message priority and importance
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  
  isPinned: { type: Boolean, default: false },
  pinnedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  pinnedAt: Date,
  
  timestamp: {
    type: Date,
    default: Date.now
  }
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
chatMessageSchema.index({ session: 1, timestamp: -1 });
chatMessageSchema.index({ sender: 1, timestamp: -1 });
chatMessageSchema.index({ session: 1, isDeleted: 1, timestamp: -1 });
chatMessageSchema.index({ replyTo: 1 });

// Virtual for reaction summary
chatMessageSchema.virtual('reactionSummary').get(function() {
  const summary = {};
  this.reactions.forEach(reaction => {
    summary[reaction.emoji] = reaction.count;
  });
  return summary;
});

// Instance method to add reaction
chatMessageSchema.methods.addReaction = function(userId, emoji) {
  let reaction = this.reactions.find(r => r.emoji === emoji);
  
  if (!reaction) {
    reaction = { emoji, users: [], count: 0 };
    this.reactions.push(reaction);
  }
  
  if (!reaction.users.includes(userId)) {
    reaction.users.push(userId);
    reaction.count = reaction.users.length;
  }
  
  return this.save();
};

// Instance method to remove reaction
chatMessageSchema.methods.removeReaction = function(userId, emoji) {
  const reaction = this.reactions.find(r => r.emoji === emoji);
  
  if (reaction) {
    reaction.users = reaction.users.filter(id => !id.equals(userId));
    reaction.count = reaction.users.length;
    
    if (reaction.count === 0) {
      this.reactions = this.reactions.filter(r => r.emoji !== emoji);
    }
  }
  
  return this.save();
};

// Instance method to mark as read
chatMessageSchema.methods.markAsRead = function(userId) {
  const existingRead = this.readBy.find(read => read.user.equals(userId));
  
  if (!existingRead) {
    this.readBy.push({ user: userId, readAt: new Date() });
  }
  
  return this.save();
};

// Instance method to edit message
chatMessageSchema.methods.editMessage = function(newMessage) {
  this.originalMessage = this.message;
  this.message = newMessage;
  this.isEdited = true;
  this.editedAt = new Date();
  return this.save();
};

// Static method to get session chat history
chatMessageSchema.statics.getSessionHistory = function(sessionId, limit = 50, before = null) {
  const query = { session: sessionId, isDeleted: false };
  
  if (before) {
    query.timestamp = { $lt: before };
  }
  
  return this.find(query)
    .populate('sender', 'name role')
    .populate('targetUser', 'name')
    .populate('replyTo', 'message sender')
    .sort({ timestamp: -1 })
    .limit(limit);
};

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

module.exports = { Poll, ChatMessage };