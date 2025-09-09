const { Attendance, ClassSession, User } = require('../models');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Get attendance monitoring data for a session (Faculty/Admin)
exports.getStudentsMonitoring = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    const session = await ClassSession.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (req.user.role === 'faculty' && !session.faculty.equals(req.user.userId)) {
      return res.status(403).json({ error: 'Access denied', message: 'You can only monitor your own sessions' });
    }

    const attendanceRecords = await Attendance.find({ session: sessionId })
      .populate('student', 'name email studentId profilePicture')
      .sort({ joinTime: -1 });

    const studentsData = attendanceRecords.map((attendance) => ({
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
      deviceInfo: {
        platform: attendance.deviceInfo.platform,
        browser: attendance.deviceInfo.browser,
        isMobile: attendance.deviceInfo.isMobile,
      },
      networkQuality: attendance.networkInfo.qualityScore,
    }));

    const sessionStats = await Attendance.aggregate([
      { $match: { session: mongoose.Types.ObjectId(sessionId) } },
      {
        $group: {
          _id: null,
          totalStudents: { $sum: 1 },
          presentStudents: { $sum: { $cond: ['$isPresent', 1, 0] } },
          totalAlerts: { $sum: { $size: '$alerts' } },
          highRiskStudents: { $sum: { $cond: [{ $in: ['$calculated.riskLevel', ['high', 'critical']] }, 1, 0] } },
          averageEngagement: { $avg: '$engagement.participationScore' },
          averageBehaviorScore: { $avg: '$calculated.behaviorScore' },
        },
      },
    ]);

    const stats = sessionStats[0] || {
      totalStudents: 0,
      presentStudents: 0,
      totalAlerts: 0,
      highRiskStudents: 0,
      averageEngagement: 0,
      averageBehaviorScore: 100,
    };

    stats.attendanceRate = stats.totalStudents > 0 ? Math.round((stats.presentStudents / stats.totalStudents) * 100) : 0;

    res.json({
      students: studentsData,
      statistics: stats,
      sessionInfo: {
        id: session._id,
        title: session.title,
        subject: session.subject,
        status: session.status,
        startTime: session.actualStartTime,
        duration: session.actualDuration,
      },
    });
  } catch (error) {
    logger.error('Students monitoring fetch error:', error);
    next(error);
  }
};

// Get alerts for a session (Faculty/Admin)
exports.getAlerts = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { severity, type, resolved, page = 1, limit = 50 } = req.query;

    const session = await ClassSession.findById(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (req.user.role === 'faculty' && !session.faculty.equals(req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const matchStage = { session: mongoose.Types.ObjectId(sessionId) };
    const alertsMatch = {};
    if (severity) alertsMatch['alerts.severity'] = severity;
    if (type) alertsMatch['alerts.type'] = type;
    if (resolved !== undefined) alertsMatch['alerts.isResolved'] = resolved === 'true';

    const alerts = await Attendance.aggregate([
      { $match: matchStage },
      { $unwind: '$alerts' },
      { $match: alertsMatch },
      {
        $lookup: {
          from: 'users',
          localField: 'student',
          foreignField: '_id',
          as: 'studentData',
        },
      },
      { $unwind: '$studentData' },
      {
        $project: {
          studentName: '$studentData.name',
          studentId: '$studentData.studentId',
          studentEmail: '$studentData.email',
          alertId: '$alerts._id',
          type: '$alerts.type',
          details: '$alerts.details',
          severity: '$alerts.severity',
          timestamp: '$alerts.timestamp',
          isResolved: '$alerts.isResolved',
          resolvedAt: '$alerts.resolvedAt',
          resolvedBy: '$alerts.resolvedBy',
          additionalData: '$alerts.additionalData',
        },
      },
      { $sort: { timestamp: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: parseInt(limit) },
    ]);

    const alertStats = await Attendance.aggregate([
      { $match: { session: mongoose.Types.ObjectId(sessionId) } },
      { $unwind: '$alerts' },
      {
        $group: {
          _id: '$alerts.severity',
          count: { $sum: 1 },
          unresolved: { $sum: { $cond: ['$alerts.isResolved', 0, 1] } },
        },
      },
    ]);

    const statistics = {
      total: alerts.length,
      bySeverity: alertStats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, { low: 0, medium: 0, high: 0, critical: 0 }),
      unresolved: alertStats.reduce((sum, stat) => sum + stat.unresolved, 0),
    };

    res.json({
      alerts,
      statistics,
      pagination: {
        currentPage: parseInt(page),
        limit: parseInt(limit),
        hasNext: alerts.length === parseInt(limit),
      },
    });
  } catch (error) {
    logger.error('Alerts fetch error:', error);
    next(error);
  }
};

// Resolve an alert (Faculty/Admin)
exports.resolveAlert = async (req, res, next) => {
  try {
    const { sessionId, alertId } = req.params;
    const { resolution } = req.body;

    const attendance = await Attendance.findOne({ session: sessionId, 'alerts._id': alertId });
    if (!attendance) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    const alert = attendance.alerts.id(alertId);
    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    alert.isResolved = true;
    alert.resolvedAt = new Date();
    alert.resolvedBy = req.user.userId;

    if (resolution) {
      alert.additionalData = { ...alert.additionalData, resolution };
    }

    await attendance.save();

    logger.info('Alert resolved', { alertId, sessionId, resolvedBy: req.user.userId, alertType: alert.type });

    res.json({
      message: 'Alert resolved successfully',
      alert: {
        id: alert._id,
        isResolved: alert.isResolved,
        resolvedAt: alert.resolvedAt,
      },
    });
  } catch (error) {
    logger.error('Alert resolution error:', error);
    next(error);
  }
};

// Update student location (Student only)
exports.updateLocation = async (req, res, next) => {
  try {
    const { sessionId, latitude, longitude, address, accuracy } = req.body;

    let attendance = await Attendance.findOne({ student: req.user.userId, session: sessionId });

    if (!attendance) {
      const session = await ClassSession.findById(sessionId);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const isEnrolled = session.students.some((s) => s.student.equals(req.user.userId));
      if (!isEnrolled) return res.status(403).json({ error: 'Not enrolled in this session' });

      attendance = new Attendance({ student: req.user.userId, session: sessionId, joinTime: new Date(), isPresent: true });
    }

    await attendance.updateLocation(latitude, longitude, address, accuracy);

    logger.info('Student location updated', {
      studentId: req.user.userId,
      sessionId,
      location: { latitude, longitude, address },
    });

    res.json({ message: 'Location updated successfully', isPresent: attendance.isPresent, location: attendance.location });
  } catch (error) {
    logger.error('Location update error:', error);
    next(error);
  }
};

// Report student activity (Student only)
exports.reportActivity = async (req, res, next) => {
  try {
    const { sessionId, activityType, details, deviceInfo, networkInfo } = req.body;

    if (!sessionId || !activityType) {
      return res.status(400).json({ error: 'Session ID and activity type are required' });
    }

    const attendance = await Attendance.findOne({ student: req.user.userId, session: sessionId });
    if (!attendance) return res.status(404).json({ error: 'Attendance record not found' });

    if (deviceInfo) attendance.deviceInfo = { ...attendance.deviceInfo.toObject(), ...deviceInfo };
    if (networkInfo) attendance.networkInfo = { ...attendance.networkInfo.toObject(), ...networkInfo };

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
        attendance.activityMonitoring.inactiveTime += parseInt(details?.duration) || 0;
        attendance.status = 'inactive';
        break;
      case 'network_change':
        if (details?.connectionLost) {
          attendance.networkInfo.disconnections += 1;
          await attendance.addAlert('network_disconnect', 'Connection lost', 'medium');
        } else if (details?.connectionRestored) {
          attendance.networkInfo.reconnections += 1;
        }
        break;
      case 'suspicious_activity':
        await attendance.addAlert('suspicious_activity', details || 'Suspicious activity detected', 'high');
        break;
      default:
        logger.warn('Unknown activity type', { activityType, studentId: req.user.userId });
    }

    await attendance.save();

    req.app.get('io')?.to(`session-${sessionId}`).emit('student_activity', {
      studentId: req.user.userId,
      activityType,
      timestamp: new Date(),
      studentName: req.user.name,
    });

    res.json({ message: 'Activity recorded successfully', status: attendance.status });
  } catch (error) {
    logger.error('Activity reporting error:', error);
    next(error);
  }
};

// Get attendance summary for a session (Faculty/Admin)
exports.getAttendanceSummary = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const summary = await Attendance.getSessionSummary(sessionId);

    if (!summary || summary.length === 0) {
      return res.json({
        summary: {
          totalStudents: 0,
          presentStudents: 0,
          attendanceRate: 0,
          averageDuration: 0,
          totalAlerts: 0,
          averageBehaviorScore: 100,
          averageEngagement: 0,
        },
      });
    }
    res.json({ summary: summary[0] });
  } catch (error) {
    logger.error('Attendance summary error:', error);
    next(error);
  }
};

// Get student attendance history (Student/Faculty/Admin)
exports.getStudentAttendanceHistory = async (req, res, next) => {
  try {
    const { studentId } = req.params;
    const { limit = 10 } = req.query;

    if (req.user.role === 'student' && req.user.userId !== studentId) {
      return res.status(403).json({ error: 'Access denied', message: 'Students can only view their own attendance' });
    }

    // Faculty can add logic to restrict to their sessions if desired

    const history = await Attendance.getStudentHistory(studentId, parseInt(limit));

    res.json({ attendance: history, studentId });
  } catch (error) {
    logger.error('Student attendance history error:', error);
    next(error);
  }
};
