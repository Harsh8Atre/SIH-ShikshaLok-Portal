const { ClassSession, Attendance } = require('../models');

// Get comprehensive dashboard metrics for the college
async function getCollegeDashboardAnalytics(collegeId) {
    const totalSessions = await ClassSession.countDocuments({ college: collegeId });
    const liveSessions = await ClassSession.countDocuments({ college: collegeId, status: 'live' });
    const endedSessions = await ClassSession.countDocuments({ college: collegeId, status: 'ended' });

    // Aggregate engagement and attendance stats
    const allSessionIds = await ClassSession.find({ college: collegeId }).distinct('_id');
    const attendanceAgg = await Attendance.aggregate([
        { $match: { session: { $in: allSessionIds } } },
        {
            $group: {
                _id: null,
                averageAttendanceRate: { $avg: '$calculated.attendancePercentage' },
                averageEngagement: { $avg: '$engagement.participationScore' },
                averageBehavior: { $avg: '$calculated.behaviorScore' }
            }
        }
    ]);
    const attendanceStats = attendanceAgg[0] || {
        averageAttendanceRate: 0,
        averageEngagement: 0,
        averageBehavior: 0
    };

    return {
        totalSessions,
        liveSessions,
        endedSessions,
        averageAttendanceRate: attendanceStats.averageAttendanceRate,
        averageEngagement: attendanceStats.averageEngagement,
        averageBehaviorScore: attendanceStats.averageBehavior,
    };
}

// Get historical attendance/engagement trends per session
async function getSessionTrends(sessionId) {
    const records = await Attendance.find({ session: sessionId }).select(
        'student joinTime leaveTime totalDuration engagement participationScore calculated.behaviorScore'
    );

    // Prepare time series or participation metrics as needed
    return records;
}

module.exports = {
    getCollegeDashboardAnalytics,
    getSessionTrends,
};