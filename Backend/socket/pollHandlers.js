const { Poll, Attendance, ClassSession } = require('../models');
const logger = require('../utils/logger');

module.exports = (io, socket) => {
  // Receive vote on a poll
  socket.on('poll_vote', async (data, callback) => {
    const { pollId, optionIndex, responseTime, textResponse } = data;
    try {
      const poll = await Poll.findById(pollId).populate('session');
      if (!poll) return callback({ error: 'Poll not found' });

      if (!poll.isActive || (poll.expiresAt && poll.expiresAt < new Date())) {
        return callback({ error: 'Poll is not active or expired' });
      }

      const session = poll.session;

      // Check if user allowed to vote
      const isEnrolled = session.students.some(s => s.student.equals(socket.userId));
      if (!isEnrolled && socket.userRole === 'student') {
        return callback({ error: 'User not enrolled in session' });
      }

      // Handle vote logic depending on poll type
      if (poll.type === 'text_response') {
        if (!textResponse || textResponse.trim().length === 0) {
          return callback({ error: 'Text response required' });
        }
        const existingResponse = poll.textResponses.find(r => r.user.equals(socket.userId));
        if (existingResponse && !poll.settings.allowChangeVote) {
          return callback({ error: 'User already responded' });
        }
        if (existingResponse) {
          existingResponse.response = textResponse.trim();
          existingResponse.submittedAt = new Date();
        } else {
          poll.textResponses.push({ user: socket.userId, response: textResponse.trim(), submittedAt: new Date() });
        }
      } else {
        if (optionIndex == null || optionIndex < 0 || optionIndex >= poll.options.length) {
          return callback({ error: 'Invalid option index' });
        }
        const hasVoted = poll.options.some(opt => opt.voters.some(v => v.user.equals(socket.userId)));
        if (hasVoted && !poll.settings.allowChangeVote) {
          return callback({ error: 'User already voted' });
        }
        if (hasVoted) {
          // Remove previous votes
          poll.options.forEach(opt => {
            opt.voters = opt.voters.filter(v => !v.user.equals(socket.userId));
            opt.votes = opt.voters.length;
          });
        }
        poll.options[optionIndex].voters.push({ user: socket.userId, votedAt: new Date(), responseTime });
        poll.options[optionIndex].votes = poll.options[optionIndex].voters.length;
      }

      await poll.save();

      // Update attendance engagement
      const attendance = await Attendance.findOne({ student: socket.userId, session: session._id });
      if (attendance) await attendance.updateEngagement('poll', 1);

      // Prepare poll update for clients
      const updatedPollData = {
        pollId: poll._id,
        options: poll.options.map(opt => ({ text: opt.text, votes: opt.votes })),
        totalVotes: poll.options.reduce((sum, o) => sum + o.votes, 0),
        totalResponses: poll.textResponses.length,
      };

      // Emit updated poll results to session participants
      io.to(`session-${session._id}`).emit('poll_updated', updatedPollData);

      logger.info('Poll vote recorded', { pollId, userId: socket.userId, optionIndex, textResponse: !!textResponse });

      callback({ success: true, message: 'Vote recorded', pollResults: updatedPollData });
    } catch (error) {
      logger.error('Poll vote error:', error);
      callback({ error: 'Failed to record vote' });
    }
  });

  // Handle other poll-related events here (e.g., creation, close, delete) similarly
  // For brevity, those are omitted but can be implemented with appropriate permission checks
};
