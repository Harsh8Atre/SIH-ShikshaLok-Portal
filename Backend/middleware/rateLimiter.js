const rateLimit = require('express-rate-limit');

// General rate limiter for most requests
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests',
    message: 'You have exceeded the request limit. Please try again later.',
  },
});

// Stricter limiter for sensitive endpoints (e.g. auth)
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    error: 'Too many requests',
    message: 'Too many attempts. Please wait before retrying.',
  },
});

// Auth related routes limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: {
    error: 'Too many login attempts',
    message: 'Please try again after some time.',
  },
});

// Slow down repeated requests to avoid brute force
const speedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  delayMs: 500, // delay response by 500ms after each request
  max: 100,
  message: {
    error: 'Too many requests',
    message: 'Slowing down requests due to high frequency',
  },
});

// File upload rate limiter
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    error: 'Too many uploads',
    message: 'Please wait before uploading more files.',
  },
});

// Socket.IO related API limiter (if applicable)
const socketLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: 'Socket API rate limit exceeded',
});

// API generic limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    error: 'Rate limit exceeded',
    message: 'Max 100 requests per 15 minutes allowed',
  },
});

// Chat related APIs limiter
const chatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: {
    error: 'Chat rate limit exceeded',
    message: 'Please slow down chat messages',
  },
});

// Poll related APIs limiter
const pollLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    error: 'Poll rate limit exceeded',
    message: 'Too many poll votes or creations',
  },
});

// Role-based rate limiter
const roleBasedLimiter = (req, res, next) => {
  const userRole = req.user ? req.user.role : 'guest';
  let maxRequests;

  switch (userRole) {
    case 'admin':
      maxRequests = 200;
      break;
    case 'faculty':
      maxRequests = 150;
      break;
    case 'student':
      maxRequests = 100;
      break;
    default:
      maxRequests = 50;
  }

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: maxRequests,
    keyGenerator: (req) => `${req.ip}-${req.user ? req.user.userId : 'anonymous'}`,
    message: {
      error: 'Rate limit exceeded',
      message: `${maxRequests} requests per 15 minutes allowed for ${userRole} users`,
    },
  });

  limiter(req, res, next);
};

// Custom limiter factory to create flexible limiters
const createCustomLimiter = (options) => {
  return rateLimit(options);
};

module.exports = {
  generalLimiter,
  strictLimiter,
  authLimiter,
  speedLimiter,
  uploadLimiter,
  socketLimiter,
  apiLimiter,
  chatLimiter,
  pollLimiter,
  roleBasedLimiter,
  createCustomLimiter,
};
