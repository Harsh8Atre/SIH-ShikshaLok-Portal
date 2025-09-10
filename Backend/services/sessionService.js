const { ClassSession, User, Attendance } = require('../models');
const logger = require('../utils/logger');

// Create a new class session
async function createSession(data, user) {
    const {
        title,
        subject,
        description,
        scheduledStartTime,
        scheduledEndTime,
        duration,
        settings = {},
        isRecurring = false,
        recurringPattern = {},
        facultyId
    } = data;

    const faculty = facultyId ? await User.findById(facultyId) : user;
    if (!faculty || faculty.role !== 'faculty' || !faculty.college.equals(user.college)) {
        throw new Error('Invalid faculty');
    }

    const sessionData = {
        title: title.trim(),
        subject: subject.trim(),
        description: description ? description.trim() : undefined,
        faculty: faculty._id,
        college: user.college,
        scheduledStartTime: new Date(scheduledStartTime),
        scheduledEndTime: scheduledEndTime ? new Date(scheduledEndTime) : undefined,
        duration: duration || 60,
        settings: {
            allowLateJoin: settings.allowLateJoin !== false,
            lateJoinCutoffMinutes: settings.lateJoinCutoffMinutes || 15,
            requireLocationVerification: settings.requireLocationVerification !== false,
            enableChat: settings.enableChat !== false,
            enablePolls: settings.enablePolls !== false,
            enableScreenShare: settings.enableScreenShare !== false,
            enableRecording: settings.enableRecording || false,
            maxConcurrentStudents: settings.maxConcurrentStudents || 100,
            ...settings,
        },
        isRecurring,
        recurringPattern: isRecurring ? recurringPattern : undefined,
    };

    const session = new ClassSession(sessionData);
    await session.save();

    await session.populate('faculty', 'name email specialization');
    await session.populate('college', 'name');

    logger.info('Session created', { sessionId: session._id, facultyId: session.faculty, title: session.title });

    return session;
}

// Update session fields (used for PATCH)
async function updateSession(sessionId, updateData, user) {
    const session = await ClassSession.findById(sessionId);
    if (!session) {
        throw new Error('Session not found');
    }
    if (user.role === 'faculty' && !session.faculty.equals(user._id)) {
        throw new Error('Only faculty owner can edit this session');
    }
    if (session.status === 'live') {
        throw new Error('Cannot modify a live session');
    }
    Object.assign(session, updateData);
    await session.save();
    logger.info('Session updated', { sessionId, updatedFields: Object.keys(updateData) });
    return session;
}

// Get analytics summary for all sessions of the current user's college
async function getCollegeSessionAnalytics(collegeId) {
    const totalSessions = await ClassSession.countDocuments({ college: collegeId });
    const liveSessions = await ClassSession.countDocuments({ college: collegeId, status: 'live' });

    // Aggregate attendance rates
    const attendanceStats = await Attendance.aggregate([
        { $match: { session: { $in: await ClassSession.find({ college: collegeId }).distinct('_id') } } },
        {
            $group: {
                _id: null,
                avgAttendanceRate: { $avg: '$calculated.attendancePercentage' },
                avgEngagement: { $avg: '$engagement.participationScore' },
            },
        },
    ]);

    const stats = attendanceStats[0] || { avgAttendanceRate: 0, avgEngagement: 0 };

    return {
        totalSessions,
        liveSessions,
        avgAttendanceRate: stats.avgAttendanceRate,
        avgEngagement: stats.avgEngagement
    };
}

module.exports = {
    createSession,
    updateSession,
    getCollegeSessionAnalytics
};