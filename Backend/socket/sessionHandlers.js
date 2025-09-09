const { ClassSession, Attendance, User } = require('../models');
const logger = require('../utils/logger');

module.exports = (io, socket) => {
  // Join a session room
  socket.on('join_session', async (sessionId, callback) => {
    try {
      const session = await ClassSession.findById(sessionId);
      if (!session) {
        return callback({ error: 'Session not found' });
      }

      // Check if user is enrolled
      const isEnrolled = session.students.some(s => s.student.equals(socket.userId));
      if (!isEnrolled && socket.userRole === 'student') {
        return callback({ error: 'Not enrolled in this session' });
      }

      socket.join(`session-${sessionId}`);

      // Mark attendance join time
      const attendance = await Attendance.findOne({ session: sessionId, student: socket.userId });
      if (attendance) {
        attendance.joinTime = attendance.joinTime || new Date();
        attendance.isPresent = true;
        await attendance.save();
      }

      logger.info(`User ${socket.userId} joined session ${sessionId}`);

      callback({ success: true, message: 'Joined session' });
    } catch (error) {
      logger.error('Join session error:', error);
      callback({ error: 'Failed to join session' });
    }
  });

  // Leave a session room
  socket.on('leave_session', async (sessionId, callback) => {
    try {
      socket.leave(`session-${sessionId}`);

      const attendance = await Attendance.findOne({ session: sessionId, student: socket.userId });
      if (attendance) {
        attendance.leaveTime = new Date();
        attendance.isPresent = false;
        await attendance.save();
      }

      logger.info(`User ${socket.userId} left session ${sessionId}`);

      callback({ success: true, message: 'Left session' });
    } catch (error) {
      logger.error('Leave session error:', error);
      callback({ error: 'Failed to leave session' });
    }
  });

  // Listen for session control events (start, end, pause, resume)
  socket.on('session_control', async ({ sessionId, action }, callback) => {
    try {
      const session = await ClassSession.findById(sessionId);
      if (!session) {
        return callback({ error: 'Session not found' });
      }

      if (socket.userRole !== 'faculty' || !session.faculty.equals(socket.userId)) {
        return callback({ error: 'Access denied' });
      }

      switch (action) {
        case 'start':
          if (session.status === 'live') {
            return callback({ error: 'Session already live' });
          }
          await session.startSession();
          break;
        case 'end':
          if (session.status !== 'live') {
            return callback({ error: 'Session is not live' });
          }
          await session.endSession();
          break;
        case 'pause':
          if (session.status !== 'live') {
            return callback({ error: 'Can only pause live sessions' });
          }
          await session.pauseSession();
          break;
        case 'resume':
          if (session.status !== 'paused') {
            return callback({ error: 'Can only resume paused sessions' });
          }
          await session.resumeSession();
          break;
        default:
          return callback({ error: 'Invalid action' });
      }

      io.to(`session-${sessionId}`).emit(`session_${action}`, { sessionId, status: session.status });

      logger.info(`Session ${action}d by user ${socket.userId} for session ${sessionId}`);

      callback({ success: true, message: `Session ${action}d` });
    } catch (error) {
      logger.error('Session control error:', error);
      callback({ error: 'Session control failed' });
    }
  });
};
