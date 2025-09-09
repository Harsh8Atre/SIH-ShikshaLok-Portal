const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  // Log the error including stack trace
  logger.error('Unhandled error:', {
    message: err.message,
    stack: err.stack,
    url: req.originalUrl,
    method: req.method,
    user: req.user ? req.user.userId : 'anonymous',
  });

  // Custom handling for certain errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message,
      details: err.errors,
    });
  }

  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    return res.status(400).json({
      error: 'Invalid ID',
      message: `Provided ID '${err.value}' is invalid.`,
    });
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      error: 'Duplicate Key Error',
      message: `Duplicate value for field '${field}': '${err.keyValue[field]}'`,
    });
  }

  // Default to 500 server error
  res.status(err.statusCode || 500).json({
    error: err.name || 'Internal Server Error',
    message: err.message || 'An unexpected error occurred',
  });
}

module.exports = errorHandler;
