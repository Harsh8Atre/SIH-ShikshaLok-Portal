// routes/polls.js - Poll management routes
const express = require('express');
const router = express.Router();
const { Poll, ClassSession, Attendance } = require('../models');
const { authenticateToken, requireRole, requireSessionAccess } = require('../middleware/auth');
const { validationRules, handleValidationErrors } = require('../middleware/validation');
const { pollLimiter, apiLimiter } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

// Get polls for a session
router.get('/session/:sessionId',
  authenticateToken,
  requireSessionAccess,
  validationRules.sessionId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { sessionId } = req.params;
      const { active, page = 1, limit = 10 } = req.query;

      const query = { session: sessionId };
      
      // Filter by active status if specified
      if (active !== undefined) {
        query.isActive = active === 'true';
      }

      const polls = await Poll.find(query)
        .populate('createdBy', 'name role')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);

      // Transform polls to hide voter information based on settings and user role
      const transformedPolls = polls.map(poll => {
        const pollObj = poll.toObject();
        
        // Students shouldn't see voter details unless poll allows it
        if (req.user.role === 'student') {
          pollObj.options = poll.options.map(option => ({
            text: option.text,
            votes: option.votes,
            hasVoted: option.voters.some(voter => voter.user.equals(req.user.userId))
          }));
          
          // Remove text responses from other students if anonymous
          if (poll.isAnonymous) {
            pollObj.textResponses = poll.textResponses.filter(
              response => response.user.equals(req.user.userId)
            );
          }
        } else {
          // Faculty and admin can see all details
          pollObj.options = poll.options.map(option => ({
            text: option.text,
            votes: option.votes,
            voters: option.voters.map(voter => ({
              user: voter.user,
              votedAt: voter.votedAt,
              responseTime: voter.responseTime
            }))
          }));
        }

        return pollObj;
      });

      const totalPolls = await Poll.countDocuments(query);

      res.json({
        polls: transformedPolls,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalPolls / limit),
          totalPolls,
          hasNext: page * limit < totalPolls,
          hasPrev: page > 1
        }
      });

    } catch (error) {
      logger.error('Polls fetch error:', error);
      next(error);
    }
  }
);

// Create new poll (Faculty/Admin only)
router.post('/',
  authenticateToken,
  requireRole(['faculty', 'admin']),
  pollLimiter,
  validationRules.pollCreate,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const {
        sessionId,
        question,
        type = 'single_choice',
        options = [],
        expiresIn,
        settings = {},
        isAnonymous = false
      } = req.body;

      // Verify session exists and user has access
      const session = await ClassSession.findById(sessionId);
      if (!session) {
        return res.status(404).json({
          error: 'Session not found'
        });
      }

      // Check permissions
      if (req.user.role === 'faculty' && !session.faculty.equals(req.user.userId)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only create polls for your own sessions'
        });
      }

      // Validate poll type and options
      if (['multiple_choice', 'single_choice'].includes(type) && options.length < 2) {
        return res.status(400).json({
          error: 'Invalid options',
          message: 'Choice polls must have at least 2 options'
        });
      }

      if (type === 'yes_no' && options.length === 0) {
        // Auto-generate yes/no options
        options.push('Yes', 'No');
      }

      // Create poll
      const pollData = {
        session: sessionId,
        question: question.trim(),
        type,
        options: options.map(optionText => ({
          text: optionText.trim(),
          votes: 0,
          voters: []
        })),
        settings: {
          allowMultipleAnswers: settings.allowMultipleAnswers || false,
          showResults: settings.showResults || 'after_vote',
          allowChangeVote: settings.allowChangeVote || false,
          requireLogin: settings.requireLogin !== false,
          randomizeOptions: settings.randomizeOptions || false,
          timeLimit: settings.timeLimit,
          maxResponses: settings.maxResponses
        },
        isActive: true,
        isAnonymous,
        createdBy: req.user.userId,
        expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 60000) : null
      };

      const poll = new Poll(pollData);
      await poll.save();

      // Populate created poll
      await poll.populate('createdBy', 'name role');

      // Update session analytics
      await ClassSession.findByIdAndUpdate(sessionId, {
        $inc: { 'analytics.totalPolls': 1 }
      });

      logger.info('Poll created', {
        pollId: poll._id,
        sessionId,
        createdBy: req.user.userId,
        question: poll.question,
        type: poll.type
      });

      // Emit poll to all session participants via Socket.io
      req.app.get('io')?.to(`session-${sessionId}`).emit('new_poll', {
        poll: {
          id: poll._id,
          question: poll.question,
          type: poll.type,
          options: poll.options.map(opt => ({ text: opt.text, votes: 0 })),
          settings: poll.settings,
          isAnonymous: poll.isAnonymous,
          createdBy: poll.createdBy,
          createdAt: poll.createdAt,
          expiresAt: poll.expiresAt
        }
      });

      res.status(201).json({
        message: 'Poll created successfully',
        poll: {
          id: poll._id,
          question: poll.question,
          type: poll.type,
          options: poll.options.map(opt => ({ text: opt.text, votes: 0 })),
          settings: poll.settings,
          isActive: poll.isActive,
          createdAt: poll.createdAt
        }
      });

    } catch (error) {
      logger.error('Poll creation error:', error);
      next(error);
    }
  }
);

// Vote on a poll
router.post('/:pollId/vote',
  authenticateToken,
  validationRules.pollVote,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { pollId } = req.params;
      const { optionIndex, responseTime, textResponse } = req.body;

      const poll = await Poll.findById(pollId).populate('session', 'students');
      
      if (!poll) {
        return res.status(404).json({
          error: 'Poll not found'
        });
      }

      if (!poll.isActive) {
        return res.status(400).json({
          error: 'Poll is not active'
        });
      }

      // Check if poll has expired
      if (poll.expiresAt && new Date() > poll.expiresAt) {
        return res.status(400).json({
          error: 'Poll has expired'
        });
      }

      // Verify user is enrolled in the session
      const session = poll.session;
      const isEnrolled = session.students.some(
        s => s.student.equals(req.user.userId)
      );

      if (!isEnrolled && req.user.role === 'student') {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You are not enrolled in this session'
        });
      }

      // Handle text response polls
      if (poll.type === 'text_response') {
        if (!textResponse || textResponse.trim().length === 0) {
          return res.status(400).json({
            error: 'Text response required'
          });
        }

        // Check if user already responded
        const existingResponse = poll.textResponses.find(
          response => response.user.equals(req.user.userId)
        );

        if (existingResponse && !poll.settings.allowChangeVote) {
          return res.status(400).json({
            error: 'You have already responded to this poll'
          });
        }

        if (existingResponse && poll.settings.allowChangeVote) {
          existingResponse.response = textResponse.trim();
          existingResponse.submittedAt = new Date();
        } else {
          poll.textResponses.push({
            user: req.user.userId,
            response: textResponse.trim(),
            submittedAt: new Date()
          });
        }

        await poll.save();

      } else {
        // Handle choice-based polls
        if (optionIndex === undefined || optionIndex < 0 || optionIndex >= poll.options.length) {
          return res.status(400).json({
            error: 'Invalid option index'
          });
        }

        // Check if user already voted
        const hasVoted = poll.options.some(option =>
          option.voters.some(voter => voter.user.equals(req.user.userId))
        );

        if (hasVoted && !poll.settings.allowChangeVote) {
          return res.status(400).json({
            error: 'You have already voted on this poll'
          });
        }

        // Remove previous vote if changing vote
        if (hasVoted && poll.settings.allowChangeVote) {
          poll.options.forEach(option => {
            option.voters = option.voters.filter(
              voter => !voter.user.equals(req.user.userId)
            );
            option.votes = option.voters.length;
          });
        }

        // Add new vote
        poll.options[optionIndex].voters.push({
          user: req.user.userId,
          votedAt: new Date(),
          responseTime: responseTime || null
        });
        poll.options[optionIndex].votes = poll.options[optionIndex].voters.length;

        await poll.save();
      }

      // Update student engagement
      const attendance = await Attendance.findOne({
        student: req.user.userId,
        session: poll.session._id
      });

      if (attendance) {
        await attendance.updateEngagement('poll', 1);
      }

      logger.info('Poll vote recorded', {
        pollId,
        userId: req.user.userId,
        optionIndex,
        hasTextResponse: !!textResponse
      });

      // Emit updated poll results to session participants
      const updatedPollResults = {
        pollId: poll._id,
        options: poll.options.map(opt => ({
          text: opt.text,
          votes: opt.votes
        })),
        totalVotes: poll.options.reduce((sum, opt) => sum + opt.votes, 0),
        totalTextResponses: poll.textResponses.length
      };

      req.app.get('io')?.to(`session-${poll.session._id}`).emit('poll_updated', updatedPollResults);

      res.json({
        message: 'Vote recorded successfully',
        pollResults: poll.settings.showResults === 'after_vote' || 
                    poll.settings.showResults === 'real_time' ? 
                    updatedPollResults : null
      });

    } catch (error) {
      logger.error('Poll voting error:', error);
      next(error);
    }
  }
);

// Get poll details and results
router.get('/:pollId',
  authenticateToken,
  validationRules.pollId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { pollId } = req.params;

      const poll = await Poll.findById(pollId)
        .populate('createdBy', 'name role')
        .populate('session', 'title faculty students');

      if (!poll) {
        return res.status(404).json({
          error: 'Poll not found'
        });
      }

      // Check if user has access to this poll
      const session = poll.session;
      const hasAccess = req.user.role === 'admin' ||
                       (req.user.role === 'faculty' && session.faculty.equals(req.user.userId)) ||
                       (req.user.role === 'student' && session.students.some(s => s.student.equals(req.user.userId)));

      if (!hasAccess) {
        return res.status(403).json({
          error: 'Access denied'
        });
      }

      // Transform response based on user role and poll settings
      const pollResponse = {
        id: poll._id,
        question: poll.question,
        type: poll.type,
        isActive: poll.isActive,
        isAnonymous: poll.isAnonymous,
        settings: poll.settings,
        createdBy: poll.createdBy,
        createdAt: poll.createdAt,
        expiresAt: poll.expiresAt,
        closedAt: poll.closedAt,
        results: poll.results
      };

      // Show results based on settings and user role
      const canSeeResults = req.user.role !== 'student' ||
                           poll.settings.showResults === 'real_time' ||
                           (poll.settings.showResults === 'after_vote' && poll.options.some(opt => 
                             opt.voters.some(voter => voter.user.equals(req.user.userId)))) ||
                           (poll.settings.showResults === 'after_close' && !poll.isActive);

      if (canSeeResults) {
        pollResponse.options = poll.options.map(option => {
          const optionData = {
            text: option.text,
            votes: option.votes
          };

          // Only show voter details to faculty/admin
          if (req.user.role !== 'student' && !poll.isAnonymous) {
            optionData.voters = option.voters.map(voter => ({
              user: voter.user,
              votedAt: voter.votedAt,
              responseTime: voter.responseTime
            }));
          }

          return optionData;
        });

        // Handle text responses
        if (poll.type === 'text_response') {
          if (req.user.role === 'student') {
            // Students can only see their own responses if anonymous
            pollResponse.textResponses = poll.isAnonymous ?
              poll.textResponses.filter(response => response.user.equals(req.user.userId)) :
              poll.textResponses;
          } else {
            pollResponse.textResponses = poll.textResponses;
          }
        }
      } else {
        pollResponse.options = poll.options.map(option => ({
          text: option.text,
          votes: poll.settings.showResults === 'never' ? 0 : option.votes
        }));
      }

      res.json({ poll: pollResponse });

    } catch (error) {
      logger.error('Poll details fetch error:', error);
      next(error);
    }
  }
);

// Close/End poll (Faculty/Admin only)
router.patch('/:pollId/close',
  authenticateToken,
  requireRole(['faculty', 'admin']),
  validationRules.pollId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { pollId } = req.params;

      const poll = await Poll.findById(pollId).populate('session', 'faculty');

      if (!poll) {
        return res.status(404).json({
          error: 'Poll not found'
        });
      }

      // Check permissions
      if (req.user.role === 'faculty' && !poll.session.faculty.equals(req.user.userId)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You can only close your own polls'
        });
      }

      if (!poll.isActive) {
        return res.status(400).json({
          error: 'Poll is already closed'
        });
      }

      // Close the poll
      await poll.close();

      logger.info('Poll closed', {
        pollId,
        closedBy: req.user.userId
      });

      // Notify session participants
      req.app.get('io')?.to(`session-${poll.session._id}`).emit('poll_closed', {
        pollId: poll._id,
        closedAt: poll.closedAt,
        results: poll.results
      });

      res.json({
        message: 'Poll closed successfully',
        poll: {
          id: poll._id,
          isActive: poll.isActive,
          closedAt: poll.closedAt,
          results: poll.results
        }
      });

    } catch (error) {
      logger.error('Poll close error:', error);
      next(error);
    }
  }
);

// Delete poll (Faculty/Admin only)
router.delete('/:pollId',
  authenticateToken,
  requireRole(['faculty', 'admin']),
  validationRules.pollId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { pollId } = req.params;

      const poll = await Poll.findById(pollId).populate('session', 'faculty');

      if (!poll) {
        return res.status(404).json({
          error: 'Poll not found'
        });
      }

      // Check permissions
      if (req.user.role === 'faculty' && !poll.session.faculty.equals(req.user.userId)) {
        return res.status(403).json({
          error: 'Access denied'
        });
      }

      await Poll.findByIdAndDelete(pollId);

      logger.info('Poll deleted', {
        pollId,
        deletedBy: req.user.userId
      });

      res.json({
        message: 'Poll deleted successfully'
      });

    } catch (error) {
      logger.error('Poll deletion error:', error);
      next(error);
    }
  }
);

module.exports = router;