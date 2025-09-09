const { ClassSession, Attendance } = require('../models');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Get analytics dashboard data for a college or user
exports.getDashboardAnalytics = async (req, res, next) => {
  try {
    const user = req.user;
    let collegeId;

    if (user.role === 'admin' || user.role === 'faculty') {
      collegeId = user.college;
    } else {
      // Students get limited analytics or their own data
      return res.status(403).json({ error: 'Access denied', message: 'Analytics not available for students' });
    }

    const totalSessions = await ClassSession.countDocuments({ college: collegeId });
    const activeSessions = await ClassSession.countDocuments({ college: collegeId, status: 'live' });

    // Aggregate attendance for sessions
    const attendanceAgg = await Attendance.aggregate([
      { $match: { session: { $in: await ClassSession.find({ college: collegeId }).distinct('_id') } } },
      {
        $group: {
          _id: null,
          averageAttendanceRate: { $avg: '$calculated.attendancePercentage' },
          averageEngagementScore: { $avg: '$engagement.participationScore' },
          averageBehaviorScore: { $avg: '$calculated.behaviorScore' },
        },
      },
    ]);

    const attendanceStats = attendanceAgg[0] || {
      averageAttendanceRate: 0,
      averageEngagementScore: 0,
      averageBehaviorScore: 0,
    };

    res.json({
      totalSessions,
      activeSessions,
      averageAttendanceRate: attendanceStats.averageAttendanceRate,
      averageEngagementScore: attendanceStats.averageEngagementScore,
      averageBehaviorScore: attendanceStats.averageBehaviorScore,
    });
  } catch (error) {
    logger.error('Analytics fetch error:', error);
    next(error);
  }
};

// Get session-wise analytics detailed report
exports.getSessionAnalytics = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const session = await ClassSession.findById(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (req.user.role === 'faculty' && !session.faculty.equals(req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Aggregate attendance data
    const attendanceSummary = await Attendance.getSessionSummary(sessionId);

    res.json({
      session: {
        id: session._id,
        title: session.title,
        subject: session.subject,
        status: session.status,
        analytics: session.analytics,
      },
      attendanceSummary: attendanceSummary[0] || null,
    });
  } catch (error) {
    logger.error('Session analytics fetch error:', error);
    next(error);
  }
};
    