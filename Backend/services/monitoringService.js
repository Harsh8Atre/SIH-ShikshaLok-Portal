const { Attendance, ClassSession, User } = require('../models');
const logger = require('../utils/logger');

// Record a student's activity for a session and update engagement
async function recordStudentActivity({ sessionId, studentId, activityType, details, deviceInfo, networkInfo }) {
    const attendance = await Attendance.findOne({ session: sessionId, student: studentId });
    if (!attendance) throw new Error('Attendance not found');

    if (deviceInfo) {
        attendance.deviceInfo = {...attendance.deviceInfo.toObject(), ...deviceInfo };
    }

    if (networkInfo) {
        attendance.networkInfo = {...attendance.networkInfo.toObject(), ...networkInfo };
    }

    switch (activityType) {
        case 'heartbeat':
            attendance.lastActivity = new Date();
            attendance.status = 'active';
            break;

        case 'tab_switch':
            await attendance.addAlert('tab_switch', details || 'Student switched tabs', 'medium');
            break;

        case 'app_switch':
            await attendance.addAlert('app_switch', details || 'Student switched applications', 'high');
            break;

        case 'window_focus_loss':
            await attendance.addAlert('window_focus_loss', details || 'Window lost focus', 'low');
            break;

        case 'inactive_period':
            attendance.activityMonitoring.inactiveTime += parseInt(details ? .duration) || 0;
            attendance.status = 'inactive';
            break;

        case 'network_change':
            if (details ? .connectionLost) {
                attendance.networkInfo.disconnections += 1;
                await attendance.addAlert('network_disconnect', 'Connection lost', 'medium');
            } else if (details ? .connectionRestored) {
                attendance.networkInfo.reconnections += 1;
            }
            break;

        case 'suspicious_activity':
            await attendance.addAlert('suspicious_activity', details || 'Suspicious activity detected', 'high');
            break;

        default:
            logger.warn('Unknown activity type', { activityType, studentId });
    }

    await attendance.save();
    logger.info('Student activity recorded', { sessionId, studentId, activityType });
    return attendance;
}


// Get monitoring dashboard data for a session
async function getMonitoringDashboard(sessionId, facultyId) {
    const session = await ClassSession.findById(sessionId);
    if (!session) throw new Error('Session not found');
    if (facultyId && !session.faculty.equals(facultyId)) throw new Error('Access denied');

    // Get all attendance records for the session
    const attendanceRecords = await Attendance.find({ session: sessionId })
        .populate('student', 'name email studentId profilePicture')
        .sort({ joinTime: -1 });

    const dashboard = attendanceRecords.map(attendance => ({
        id: attendance.student._id,
        name: attendance.student.name,
        email: attendance.student.email,
        studentId: attendance.student.studentId,
        profilePicture: attendance.student.profilePicture,
        status: attendance.status,
        isPresent: attendance.isPresent,
        joinTime: attendance.joinTime,
        leaveTime: attendance.leaveTime,
        totalDuration: attendance.totalDuration,
        lastActivity: attendance.lastActivity,
        location: attendance.location,
        activityMonitoring: attendance.activityMonitoring,
        engagement: attendance.engagement,
        alertsSummary: attendance.alertSummary,
        calculated: attendance.calculated,
        deviceInfo: attendance.deviceInfo,
        networkQuality: attendance.networkInfo.qualityScore
    }));

    return dashboard;
}

module.exports = {
    recordStudentActivity,
    getMonitoringDashboard
};