const jwt = require('jsonwebtoken');
const { User } = require('../models');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';

// Middleware to authenticate JWT token
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer token

    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await User.findById(decoded.userId).select('-password');

    if (!user || !user.isActive) {
      return res.status(403).json({ error: 'Access denied. Invalid user.' });
    }

    req.user = {
      userId: user._id,
      role: user.role,
      email: user.email,
      name: user.name,
      college: user.college,
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token has expired. Please login again.' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({ error: 'Invalid token.' });
    }
    logger.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Middleware to require specific roles
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      logger.warn(`Unauthorized access by ${req.user.email} to ${req.originalUrl}`);
      return res.status(403).json({ error: 'Access denied.', required: allowedRoles, current: userRole });
    }

    next();
  };
};

// Middleware to ensure user is from same college (unless admin)
const requireSameCollege = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.user.role === 'admin') {
      return next(); // Admin can access any college
    }

    const collegeId = req.params.collegeId || req.body.collegeId;
    if (collegeId && req.user.college.toString() !== collegeId) {
      return res.status(403).json({ error: 'Access denied. College mismatch.' });
    }

    next();
  } catch (error) {
    logger.error('College auth middleware error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Middleware to check session ownership and access
const requireSessionAccess = async (req, res, next) => {
  try {
    const { ClassSession } = require('../models');
    const sessionId = req.params.sessionId || req.body.sessionId;

    if (!sessionId) return res.status(400).json({ error: 'Session ID required.' });

    const session = await ClassSession.findById(sessionId);

    if (!session) return res.status(404).json({ error: 'Session not found.' });

    const userRole = req.user.role;
    const userId = req.user.userId.toString();

    // Faculty can only access own sessions
    if (userRole === 'faculty' && session.faculty.toString() !== userId) {
      return res.status(403).json({ error: 'Access denied. Not your session.' });
    }

    // Students can access only if enrolled
    if (
      userRole === 'student' &&
      !session.students.some((s) => s.student.toString() === userId)
    ) {
      return res.status(403).json({ error: 'Access denied. Not enrolled in this session.' });
    }

    // Admin can access only if in same college
    if (userRole === 'admin' && session.college.toString() !== req.user.college.toString()) {
      return res.status(403).json({ error: 'Access denied. Session not in your college.' });
    }

    req.session = session;
    next();
  } catch (error) {
    logger.error('Session access middleware error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
};

// Optional auth middleware for public endpoints with optional user info
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return next();

    const token = authHeader.split(' ')[1];
    if (!token) return next();

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password');

    if (user && user.isActive) {
      req.user = {
        userId: user._id,
        role: user.role,
        email: user.email,
        name: user.name,
        college: user.college,
      };
    }
    next();
  } catch {
    next(); // Ignore errors for optional auth
  }
};

module.exports = {
  authenticateToken,
  requireRole,
  requireSameCollege,
  requireSessionAccess,
  optionalAuth,
};
