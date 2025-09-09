const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, College } = require('../models');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

const generateAccessToken = (user) => {
  return jwt.sign(
    { userId: user._id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { userId: user._id, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN }
  );
};

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, phoneNumber, collegeName } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'An account with this email already exists',
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

    // Create college only if admin and collegeName provided
    let college = null;
    if (role === 'admin' && collegeName) {
      college = new College({
        name: collegeName,
        contact: { email: email.toLowerCase() },
        admin: null, // Will set after user creation
      });
      await college.save();
    }

    const userData = {
      name: name.trim(),
      email: email.toLowerCase(),
      password: hashedPassword,
      role,
      phoneNumber: phoneNumber ? phoneNumber.trim() : undefined,
      college: college ? college._id : undefined,
    };

    // Add role-specific fields
    if (role === 'student') {
      userData.studentId = `STU${Date.now()}${Math.floor(Math.random() * 1000)}`;
      userData.enrollmentYear = new Date().getFullYear();
    }

    const user = new User(userData);
    await user.save();

    if (college) {
      college.admin = user._id;
      await college.save();
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    logger.info('User registered successfully', {
      userId: user._id,
      email: user.email,
      role: user.role,
      collegeName: college ? college.name : null,
    });

    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        college: college
          ? {
              id: college._id,
              name: college.name,
            }
          : null,
      },
      tokens: { access: accessToken, refresh: refreshToken },
    });
  } catch (error) {
    logger.error('Registration error:', error);
    next(error);
  }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({
      email: email.toLowerCase(),
      isActive: true,
    })
      .select('+password')
      .populate('college', 'name settings');

    if (!user) {
      logger.warn('Login attempt with non-existent email', { email });
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect',
      });
    }

    if (user.isLocked) {
      logger.warn('Login attempt on locked account', {
        userId: user._id,
        email: user.email,
      });
      return res.status(423).json({
        error: 'Account locked',
        message: 'Account is temporarily locked due to multiple failed login attempts',
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      await user.incLoginAttempts();
      logger.warn('Failed login attempt', {
        userId: user._id,
        email: user.email,
        attempts: user.loginAttempts + 1,
      });
      return res.status(401).json({
        error: 'Invalid credentials',
        message: 'Email or password is incorrect',
      });
    }

    if (user.loginAttempts > 0) {
      await user.updateOne({ $unset: { loginAttempts: 1, lockUntil: 1 } });
    }

    user.lastLogin = new Date();
    await user.save();

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    logger.info('User logged in successfully', {
      userId: user._id,
      email: user.email,
      role: user.role,
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
        lastLogin: user.lastLogin,
      },
      tokens: { access: accessToken, refresh: refreshToken },
    });
  } catch (error) {
    logger.error('Login error:', error);
    next(error);
  }
};

exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({
        error: 'Refresh token required',
        message: 'Please provide a valid refresh token',
      });
    }

    const decoded = jwt.verify(refreshToken, JWT_SECRET);
    if (decoded.type !== 'refresh') {
      return res.status(401).json({
        error: 'Invalid token type',
        message: 'Token is not a refresh token',
      });
    }

    const user = await User.findById(decoded.userId).select('-password');
    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'Invalid user',
        message: 'User not found or inactive',
      });
    }

    const newAccessToken = generateAccessToken(user);
    res.json({
      message: 'Token refreshed successfully',
      tokens: { access: newAccessToken },
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Refresh token expired',
        message: 'Please login again',
      });
    }
    logger.error('Token refresh error:', error);
    next(error);
  }
};

exports.logout = async (req, res) => {
  // Token blacklist or session invalidation can be implemented here for production-grade apps
  logger.info('User logged out', { timestamp: new Date().toISOString() });
  res.json({ message: 'Logout successful' });
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase(), isActive: true });

    const successMessage = 'If an account with that email exists, a password reset link has been sent';
    if (!user) {
      logger.warn('Password reset requested for non-existent email', { email });
      return res.json({ message: successMessage });
    }

    const resetToken = jwt.sign(
      { userId: user._id, type: 'password_reset' },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    // Send resetToken by email in production
    logger.info('Password reset token generated', {
      userId: user._id,
      email: user.email,
      resetToken, // Do not log this in production
    });

    res.json({ message: successMessage });
  } catch (error) {
    logger.error('Forgot password error:', error);
    next(error);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { resetToken, password } = req.body;

    const decoded = jwt.verify(resetToken, JWT_SECRET);
    if (decoded.type !== 'password_reset') {
      return res.status(401).json({
        error: 'Invalid token type',
        message: 'Token is not a password reset token',
      });
    }

    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'Invalid user', message: 'User not found or inactive' });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    user.password = hashedPassword;
    await user.save();

    logger.info('Password reset successfully', { userId: user._id, email: user.email });

    res.json({
      message: 'Password reset successful',
      message2: 'You can now login with your new password',
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Reset token expired',
        message: 'Please request a new password reset',
      });
    }
    logger.error('Password reset error:', error);
    next(error);
  }
};
