const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, College } = require('../models');
const logger = require('../utils/logger');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

function generateAccessToken(user) {
  return jwt.sign(
    { userId: user._id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { userId: user._id, type: 'refresh' },
    JWT_SECRET,
    { expiresIn: JWT_REFRESH_EXPIRES_IN }
  );
}

async function registerUser(data) {
  const { name, email, password, role, phoneNumber, collegeName } = data;

  const existingUser = await User.findOne({ email: email.toLowerCase() });
  if (existingUser) {
    throw new Error('User with email already exists');
  }

  let college = null;
  if (role === 'admin' && collegeName) {
    college = new College({
      name: collegeName,
      contact: { email: email.toLowerCase() },
      admin: null,
    });
    await college.save();
  }

  const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const userData = {
    name: name.trim(),
    email: email.toLowerCase(),
    password: hashedPassword,
    role,
    phoneNumber: phoneNumber ? phoneNumber.trim() : undefined,
    college: college ? college._id : undefined,
  };

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

  logger.info('User registered', { userId: user._id, email: user.email, role: user.role, collegeId: user.college });

  return { user, tokens: { accessToken, refreshToken } };
}

async function authenticateUser(email, password) {
  const user = await User.findOne({ email: email.toLowerCase(), isActive: true }).select('+password');

  if (!user) {
    throw new Error('Invalid credentials');
  }

  const passwordMatch = await bcrypt.compare(password, user.password);
  if (!passwordMatch) {
    await user.incLoginAttempts();
    throw new Error('Invalid credentials');
  }

  if (user.isLocked) {
    throw new Error('Account locked');
  }

  if (user.loginAttempts > 0) {
    await user.updateOne({ $unset: { loginAttempts: 1, lockUntil: 1 } });
  }

  user.lastLogin = new Date();
  await user.save();

  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  logger.info('User authenticated', { userId: user._id, email: user.email });

  return { user, tokens: { accessToken, refreshToken } };
}

module.exports = {
  registerUser,
  authenticateUser,
  generateAccessToken,
  generateRefreshToken,
};
