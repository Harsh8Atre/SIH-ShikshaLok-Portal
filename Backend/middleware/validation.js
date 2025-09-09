const { body, param, query, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const sanitizeHtml = require('sanitize-html');

// Handle validation errors middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map((error) => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value,
    }));

    logger.warn('Validation failed:', {
      url: req.originalUrl,
      method: req.method,
      errors: errorMessages,
    });

    return res.status(400).json({
      error: 'Validation failed',
      details: errorMessages,
    });
  }
  next();
};

// Sanitization middleware to clean input strings
const sanitizeInput = (req, res, next) => {
  const sanitizeObject = (obj) => {
    if (obj && typeof obj === 'object') {
      for (let key in obj) {
        if (typeof obj[key] === 'string') {
          obj[key] = sanitizeHtml(obj[key], { allowedTags: [], allowedAttributes: {} });
        } else if (typeof obj[key] === 'object') {
          sanitizeObject(obj[key]);
        }
      }
    }
  };

  sanitizeObject(req.body);
  sanitizeObject(req.query);
  sanitizeObject(req.params);

  next();
};

// Validation rules for various requests
const validationRules = {
  // User registration validations
  userRegistration: [
    body('name')
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Name must be between 2 and 50 characters')
      .matches(/^[a-zA-Z\s.'-]+$/)
      .withMessage('Name can only contain letters, spaces, dots, apostrophes, and hyphens'),
    body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email address'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
    body('role').isIn(['admin', 'faculty', 'student']).withMessage('Role must be admin, faculty, or student'),
    body('phoneNumber').optional().isMobilePhone().withMessage('Please provide a valid phone number'),
    body('collegeName').optional().trim().isLength({ min: 3, max: 100 }).withMessage('College name must be between 3 and 100 characters'),
  ],

  // User login validations
  userLogin: [
    body('email').isEmail().normalizeEmail().withMessage('Please provide a valid email address'),
    body('password').notEmpty().withMessage('Password is required'),
  ],

  // Session creation validations
  sessionCreate: [
    body('title').trim().isLength({ min: 3, max: 200 }).withMessage('Title must be between 3 and 200 characters'),
    body('subject').trim().isLength({ min: 2, max: 100 }).withMessage('Subject must be between 2 and 100 characters'),
    body('scheduledStartTime')
      .isISO8601()
      .toDate()
      .withMessage('Please provide a valid start time')
      .custom((value) => {
        if (new Date(value) <= new Date()) {
          throw new Error('Start time must be in the future');
        }
        return true;
      }),
    body('scheduledEndTime')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Please provide a valid end time')
      .custom((value, { req }) => {
        if (value && new Date(value) <= new Date(req.body.scheduledStartTime)) {
          throw new Error('End time must be after start time');
        }
        return true;
      }),
    body('duration').optional().isInt({ min: 5, max: 480 }).withMessage('Duration must be between 5 and 480 minutes'),
    body('description').optional().trim().isLength({ max: 1000 }).withMessage('Description cannot exceed 1000 characters'),
  ],

  // Poll creation validations
  pollCreate: [
    body('sessionId').isMongoId().withMessage('Invalid session ID'),
    body('question').trim().isLength({ min: 5, max: 500 }).withMessage('Question must be between 5 and 500 characters'),
    body('type')
      .isIn(['multiple_choice', 'single_choice', 'text_response', 'rating', 'yes_no'])
      .withMessage('Invalid poll type'),
    body('options')
      .isArray({ min: 2 })
      .withMessage('Poll must have at least 2 options')
      .custom((options) => {
        if (options.length > 10) throw new Error('Poll cannot have more than 10 options');
        options.forEach((option, index) => {
          if (!option || typeof option !== 'string' || option.trim().length === 0)
            throw new Error(`Option ${index + 1} cannot be empty`);
          if (option.length > 200) throw new Error(`Option ${index + 1} cannot exceed 200 characters`);
        });
        return true;
      }),
    body('expiresIn').optional().isInt({ min: 1, max: 1440 }).withMessage('Expiry time must be between 1 and 1440 minutes'),
  ],

  // Poll voting validations
  pollVote: [
    body('optionIndex').isInt({ min: 0 }).withMessage('Invalid option index'),
    body('responseTime').optional().isInt({ min: 0 }).withMessage('Response time must be a positive number'),
  ],

  // Chat message validations
  chatMessage: [
    body('sessionId').isMongoId().withMessage('Invalid session ID'),
    body('message').trim().isLength({ min: 1, max: 2000 }).withMessage('Message must be between 1 and 2000 characters'),
    body('type').optional().isIn(['text', 'image', 'file']).withMessage('Invalid message type'),
    body('isPrivate').optional().isBoolean().withMessage('isPrivate must be a boolean'),
    body('targetUser').optional().isMongoId().withMessage('Invalid target user ID'),
  ],

  // Location update validations
  locationUpdate: [
    body('sessionId').isMongoId().withMessage('Invalid session ID'),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180'),
    body('address').optional().trim().isLength({ max: 500 }).withMessage('Address cannot exceed 500 characters'),
    body('accuracy').optional().isFloat({ min: 0 }).withMessage('Accuracy must be a positive number'),
  ],

  // URL parameter validations
  mongoId: [param('id').isMongoId().withMessage('Invalid ID format')],
  sessionId: [param('sessionId').isMongoId().withMessage('Invalid session ID format')],
  userId: [param('userId').isMongoId().withMessage('Invalid user ID format')],
  pollId: [param('pollId').isMongoId().withMessage('Invalid poll ID format')],

  // Query validations
  pagination: [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('sort')
      .optional()
      .isIn(['asc', 'desc', 'newest', 'oldest'])
      .withMessage('Sort must be asc, desc, newest, or oldest'),
  ],

  dateRange: [
    query('startDate').optional().isISO8601().toDate().withMessage('Start date must be a valid date'),
    query('endDate')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('End date must be a valid date')
      .custom((value, { req }) => {
        if (value && req.query.startDate && new Date(value) <= new Date(req.query.startDate)) {
          throw new Error('End date must be after start date');
        }
        return true;
      }),
  ],
};

// Export validation middleware and sanitization
module.exports = {
  handleValidationErrors,
  validationRules,
  sanitizeInput,
};
