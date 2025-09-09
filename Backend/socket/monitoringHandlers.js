const { Attendance } = require('../models');
const logger = require('../utils/logger');

module.exports = (io, socket) => {
  // Receive student activity updates
  socket.on('student_activity', async (data) => {
    try {
      const { sessionId, activityType, details } = data;

      // Broadcast activity to faculty/admin clients in the session room
      io.to(`session-${sessionId}`).emit('student_activity_update', {
        studentId: socket.userId,
        activityType,
        details,
        timestamp: new Date(),
      });

      logger.info('Student activity received', { studentId: socket.userId, sessionId, activityType });
    } catch (error) {
      logger.error('Error in student_activity handler:', error);
    }
  });

  // Receive location updates
  socket.on('location_update', async (data, callback) => {
    try {
      const { sessionId, latitude, longitude, address, accuracy } = data;

      // Update attendance with location data
      const attendance = await Attendance.findOne({ student: socket.userId, session: sessionId });
      if (!attendance) {
        callback({ error: 'Attendance not found for this session' });
        return;
      }

      await attendance.updateLocation(latitude, longitude, address, accuracy);

      // Notify faculty/admin
      io.to(`session-${sessionId}`).emit('student_location_update', {
        studentId: socket.userId,
        latitude,
        longitude,
        address,
        accuracy,
      });

      callback({ success: true, message: 'Location updated' });

      logger.info('Location update received', { studentId: socket.userId, sessionId });
    } catch (error) {
      logger.error('Error in location_update handler:', error);
      callback({ error: 'Error updating location' });
    }
  });

  // Other monitoring related events can be handled here, e.g. focus changes etc.
};
