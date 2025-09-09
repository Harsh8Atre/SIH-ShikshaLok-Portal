// routes/auth.js - Authentication routes
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, College } = require('../models');
const { validationRules, handleValidationErrors } = require('../middleware/validation');
const { authLimiter, strictLimiter } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

// Register new user
router.post('/register', 
  authLimiter,
  validationRules.userRegistration,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { name, email, password, role, phoneNumber, collegeName } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(409).json({
          error: 'User already exists',
          message: 'An account with this email address already exists'
        });
      }

      // Hash password
      const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create college for admin users
      let college = null;
      if (role === 'admin' && collegeName) {
        college = new College({
          name: collegeName,
          contact: { email: email.toLowerCase() },
          admin: null // Will be set after user creation
        });
        await college.save();
      }

      // Create user
      const userData = {
        name: name.trim(),
        email: email.toLowerCase(),
        password: hashedPassword,
        role,
        phoneNumber: phoneNumber ? phoneNumber.trim() : undefined,
        college: college ? college._id : undefined
      };

      // Add role-specific fields
      if (role === 'student') {
        userData.studentId = `STU${Date.now()}${Math.floor(Math.random() * 1000)}`;
        userData.enrollmentYear = new Date().getFullYear();
      }

      const user = new User(userData);
      await user.save();

      // Update college admin reference
      if (college) {
        college.admin = user._id;
        await college.save();
      }

      // Generate tokens
      const accessToken = jwt.sign(
        { userId: user._id, role: user.role, email: user.email },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      const refreshToken = jwt.sign(
        { userId: user._id, type: 'refresh' },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '7d' }
      );

      // Log successful registration
      logger.info('User registered successfully', {
        userId: user._id,
        email: user.email,
        role: user.role,
        collegeName: college ? college.name : null
      });

      res.status(201).json({
        message: 'Registration successful',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          college: college ? {
            id: college._id,
            name: college.name
          } : null
        },
        tokens: {
          access: accessToken,
          refresh: refreshToken
        }
      });

    } catch (error) {
      logger.error('Registration error:', error);
      next(error);
    }
  }
);

// Login user
router.post('/login',
  authLimiter,
  validationRules.userLogin,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      // Find user with password field
      const user = await User.findOne({ 
        email: email.toLowerCase(), 
        isActive: true 
      }).select('+password').populate('college', 'name settings');

      if (!user) {
        logger.warn('Login attempt with non-existent email', { email });
        return res.status(401).json({
          error: 'Invalid credentials',
          message: 'Email or password is incorrect'
        });
      }

      // Check if account is locked
      if (user.isLocked) {
        logger.warn('Login attempt on locked account', { 
          userId: user._id, 
          email: user.email 
        });
        return res.status(423).json({
          error: 'Account locked',
          message: 'Account is temporarily locked due to multiple failed login attempts'
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);

      if (!isValidPassword) {
        // Increment login attempts
        await user.incLoginAttempts();
        
        logger.warn('Failed login attempt', { 
          userId: user._id, 
          email: user.email,
          attempts: user.loginAttempts + 1
        });

        return res.status(401).json({
          error: 'Invalid credentials',
          message: 'Email or password is incorrect'
        });
      }

      // Reset login attempts on successful login
      if (user.loginAttempts > 0) {
        await user.updateOne({
          $unset: { loginAttempts: 1, lockUntil: 1 }
        });
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      // Generate tokens
      const accessToken = jwt.sign(
        { userId: user._id, role: user.role, email: user.email },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      const refreshToken = jwt.sign(
        { userId: user._id, type: 'refresh' },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '7d' }
      );

      // Log successful login
      logger.info('User logged in successfully', {
        userId: user._id,
        email: user.email,
        role: user.role
      });

      res.json({
        message: 'Login successful',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          college: user.college,
          settings: user.settings,
          lastLogin: user.lastLogin
        },
        tokens: {
          access: accessToken,
          refresh: refreshToken
        }
      });

    } catch (error) {
      logger.error('Login error:', error);
      next(error);
    }
  }
);

// Refresh token
router.post('/refresh',
  strictLimiter,
  async (req, res, next) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(401).json({
          error: 'Refresh token required',
          message: 'Please provide a valid refresh token'
        });
      }

      // Verify refresh token
      const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'fallback-secret');

      if (decoded.type !== 'refresh') {
        return res.status(401).json({
          error: 'Invalid token type',
          message: 'Token is not a refresh token'
        });
      }

      // Find user
      const user = await User.findById(decoded.userId).select('-password');

      if (!user || !user.isActive) {
        return res.status(401).json({
          error: 'Invalid user',
          message: 'User not found or inactive'
        });
      }

      // Generate new access token
      const newAccessToken = jwt.sign(
        { userId: user._id, role: user.role, email: user.email },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      res.json({
        message: 'Token refreshed successfully',
        tokens: {
          access: newAccessToken
        }
      });

    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Refresh token expired',
          message: 'Please login again'
        });
      }

      logger.error('Token refresh error:', error);
      next(error);
    }
  }
);

// Logout (invalidate token - in a real app you'd use a token blacklist)
router.post('/logout', async (req, res) => {
  // In a production app, you would:
  // 1. Add the token to a blacklist stored in Redis
  // 2. Or use shorter-lived tokens with a refresh token rotation strategy
  
  logger.info('User logged out', {
    timestamp: new Date().toISOString()
  });

  res.json({
    message: 'Logout successful'
  });
});

// Forgot password
router.post('/forgot-password',
  strictLimiter,
  [
    validationRules.userLogin[0] // Just email validation
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { email } = req.body;

      const user = await User.findOne({ 
        email: email.toLowerCase(), 
        isActive: true 
      });

      // Always return success to prevent email enumeration
      const successMessage = 'If an account with that email exists, a password reset link has been sent';

      if (!user) {
        logger.warn('Password reset requested for non-existent email', { email });
        return res.json({ message: successMessage });
      }

      // Generate reset token
      const resetToken = jwt.sign(
        { userId: user._id, type: 'password_reset' },
        process.env.JWT_SECRET || 'fallback-secret',
        { expiresIn: '1h' }
      );

      // In a real app, you would send an email here
      // For demo purposes, we'll just log it
      logger.info('Password reset token generated', {
        userId: user._id,
        email: user.email,
        resetToken: resetToken // Don't log this in production!
      });

      res.json({ message: successMessage });

    } catch (error) {
      logger.error('Forgot password error:', error);
      next(error);
    }
  }
);

// Reset password
router.post('/reset-password',
  strictLimiter,
  [
    validationRules.userRegistration[2], // Password validation
    body('resetToken').notEmpty().withMessage('Reset token is required')
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { resetToken, password } = req.body;

      // Verify reset token
      const decoded = jwt.verify(resetToken, process.env.JWT_SECRET || 'fallback-secret');

      if (decoded.type !== 'password_reset') {
        return res.status(401).json({
          error: 'Invalid token type',
          message: 'Token is not a password reset token'
        });
      }

      // Find user
      const user = await User.findById(decoded.userId);

      if (!user || !user.isActive) {
        return res.status(401).json({
          error: 'Invalid user',
          message: 'User not found or inactive'
        });
      }

      // Hash new password
      const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Update password
      user.password = hashedPassword;
      await user.save();

      logger.info('Password reset successfully', {
        userId: user._id,
        email: user.email
      });

      res.json({
        message: 'Password reset successful',
        message2: 'You can now login with your new password'
      });

    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          error: 'Reset token expired',
          message: 'Please request a new password reset'
        });
      }

      logger.error('Password reset error:', error);
      next(error);
    }
  }
);

module.exports = router;