// routes/index.js - Main router that combines all route modules
const express = require('express');
const router = express.Router();

// Import route modules
const authRoutes = require('./auth');
const userRoutes = require('./users');
const sessionRoutes = require('./sessions');
const monitoringRoutes = require('./monitoring');
const pollRoutes = require('./polls');
const chatRoutes = require('./chat');
const analyticsRoutes = require('./analytics');
const uploadRoutes = require('./upload');

// Mount routes with their base paths
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/sessions', sessionRoutes);
router.use('/monitoring', monitoringRoutes);
router.use('/polls', pollRoutes);
router.use('/chat', chatRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/upload', uploadRoutes);

// API information endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'ShikshaLok API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      users: '/api/users',
      sessions: '/api/sessions',
      monitoring: '/api/monitoring',
      polls: '/api/polls',
      chat: '/api/chat',
      analytics: '/api/analytics',
      upload: '/api/upload'
    },
    documentation: '/api/docs'
  });
});

module.exports = router;