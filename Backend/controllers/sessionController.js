const { ClassSession, User, Attendance, College } = require('../models');
const logger = require('../utils/logger');

// Get all sessions for the current user with optional filters
exports.getSessions = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20, upcoming = false } = req.query;
    const userRole = req.user.role;
    const userId = req.user.userId;
    let query = {};

    if (userRole === 'faculty') {
      query.faculty = userId;
    } else if (userRole === 'student') {
      query['students.student'] = userId;
    } else if (userRole === 'admin') {
      const user = await User.findById(userId);
      query.college = user.college;
    }

    if (status) {
      query.status = status;
    }

    if (upcoming === 'true') {
      query.scheduledStartTime = { $gte: new Date() };
      query.status = 'scheduled';
    }

    const sessions = await ClassSession.find(query)
      .populate('faculty', 'name email specialization')
      .populate('college', 'name')
      .populate('students.student', 'name email studentId')
      .sort({ scheduledStartTime: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const totalSessions = await ClassSession.countDocuments(query);

    // Add attendance info for students if request is from student
    if (userRole === 'student') {
      for (const session of sessions) {
        const attendance = await Attendance.findOne({
          student: userId,
          session: session._id,
        });
        session._doc.myAttendance = attendance
          ? {
              isPresent: attendance.isPresent,
              joinTime: attendance.joinTime,
              leaveTime: attendance.leaveTime,
              engagementScore: attendance.engagement.participationScore,
            }
          : null;
      }
    }

    res.json({
      sessions,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalSessions / limit),
        totalSessions,
        hasNext: page * limit < totalSessions,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    logger.error('Get sessions error:', error);
    next(error);
  }
};

// Create a new session (Faculty/Admin only)
exports.createSession = async (req, res, next) => {
  try {
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
    } = req.body;

    const user = await User.findById(req.user.userId);
    const college = await College.findById(user.college);

    const activeSessions = await ClassSession.countDocuments({
      college: user.college,
      status: 'live',
    });

    if (!college.canCreateSession(activeSessions)) {
      return res.status(400).json({
        error: 'Session limit exceeded',
        message: 'Maximum concurrent sessions reached for your college plan',
      });
    }

    // Allow admin to specify faculty
    let facultyId = req.user.userId;
    if (req.user.role === 'admin' && req.body.facultyId) {
      const faculty = await User.findById(req.body.facultyId);
      if (!faculty || faculty.role !== 'faculty' || !faculty.college.equals(user.college)) {
        return res.status(400).json({ error: 'Invalid faculty selection' });
      }
      facultyId = req.body.facultyId;
    }

    const sessionData = {
      title: title.trim(),
      subject: subject.trim(),
      description: description ? description.trim() : undefined,
      faculty: facultyId,
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

    logger.info('Session created', { sessionId: session._id, facultyId, title: session.title, scheduledStartTime: session.scheduledStartTime });

    res.status(201).json({ message: 'Session created successfully', session });
  } catch (error) {
    logger.error('Session creation error:', error);
    next(error);
  }
};

// Get a session's details by ID
exports.getSessionById = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = await ClassSession.findById(sessionId)
      .populate('faculty', 'name email specialization experience')
      .populate('college', 'name address')
      .populate('students.student', 'name email studentId profilePicture');

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    let additionalData = {};
    if (req.user.role === 'student') {
      const attendance = await Attendance.findOne({ student: req.user.userId, session: sessionId });
      additionalData.myAttendance = attendance;
      additionalData.canJoin = session.status === 'live' && (session.settings.allowLateJoin ? session.canJoinLate : true);
    }

    if (req.user.role === 'faculty' || req.user.role === 'admin') {
      const attendanceSummary = await Attendance.aggregate([
        { $match: { session: session._id } },
        {
          $group: {
            _id: null,
            totalStudents: { $sum: 1 },
            presentStudents: { $sum: { $cond: ['$isPresent', 1, 0] } },
            totalAlerts: { $sum: { $size: '$alerts' } },
            averageEngagement: { $avg: '$engagement.participationScore' },
          },
        },
      ]);
      additionalData.attendanceSummary = attendanceSummary[0] || { totalStudents: 0, presentStudents: 0, totalAlerts: 0, averageEngagement: 0 };
    }

    res.json({ session, ...additionalData });
  } catch (error) {
    logger.error('Get session details error:', error);
    next(error);
  }
};

// Update a session by ID (Faculty/Admin only)
exports.updateSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = await ClassSession.findById(sessionId);

    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (req.user.role === 'faculty' && !session.faculty.equals(req.user.userId)) {
      return res.status(403).json({ error: 'Access denied', message: 'You can only modify your own sessions' });
    }

    if (session.status === 'live') {
      return res.status(400).json({ error: 'Cannot modify live session', message: 'Please end the session before making changes' });
    }

    const { title, subject, description, scheduledStartTime, scheduledEndTime, duration, settings } = req.body;

    const updateData = {};
    if (title) updateData.title = title.trim();
    if (subject) updateData.subject = subject.trim();
    if (description !== undefined) updateData.description = description ? description.trim() : null;
    if (scheduledStartTime) updateData.scheduledStartTime = new Date(scheduledStartTime);
    if (scheduledEndTime) updateData.scheduledEndTime = new Date(scheduledEndTime);
    if (duration) updateData.duration = duration;
    if (settings) updateData.settings = { ...session.settings.toObject(), ...settings };

    const updatedSession = await ClassSession.findByIdAndUpdate(sessionId, updateData, { new: true, runValidators: true })
      .populate('faculty', 'name email')
      .populate('college', 'name');

    logger.info('Session updated', { sessionId, userId: req.user.userId, updatedFields: Object.keys(updateData) });

    res.json({ message: 'Session updated successfully', session: updatedSession });
  } catch (error) {
    logger.error('Session update error:', error);
    next(error);
  }
};

// Start a session (Faculty only)
exports.startSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = await ClassSession.findById(sessionId);

    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (!session.faculty.equals(req.user.userId)) {
      return res.status(403).json({ error: 'Access denied', message: 'You can only start your own sessions' });
    }

    if (session.status === 'live') {
      return res.status(400).json({ error: 'Session already live' });
    }

    if (['ended', 'cancelled'].includes(session.status)) {
      return res.status(400).json({ error: 'Cannot start ended or cancelled session' });
    }

    await session.startSession();

    logger.info('Session started', { sessionId, facultyId: req.user.userId, startTime: session.actualStartTime });

    req.app.get('io')?.to(`session-${sessionId}`).emit('session_started', { sessionId, startTime: session.actualStartTime });

    res.json({ message: 'Session started successfully', session: { id: session._id, status: session.status, actualStartTime: session.actualStartTime, isActive: session.isActive } });
  } catch (error) {
    logger.error('Start session error:', error);
    next(error);
  }
};

// End a session (Faculty only)
exports.endSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = await ClassSession.findById(sessionId);

    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (!session.faculty.equals(req.user.userId)) {
      return res.status(403).json({ error: 'Access denied', message: 'You can only end your own sessions' });
    }

    if (session.status !== 'live') {
      return res.status(400).json({ error: 'Session is not live' });
    }

    await session.endSession();

    logger.info('Session ended', { sessionId, facultyId: req.user.userId, endTime: session.actualEndTime, duration: session.actualDuration });

    req.app.get('io')?.to(`session-${sessionId}`).emit('session_ended', { sessionId, endTime: session.actualEndTime, duration: session.actualDuration });

    res.json({ message: 'Session ended successfully', session: { id: session._id, status: session.status, actualEndTime: session.actualEndTime, duration: session.actualDuration } });
  } catch (error) {
    logger.error('End session error:', error);
    next(error);
  }
};

// Pause or resume a session (Faculty only)
exports.pauseResumeSession = async (req, res, next) => {
  try {
    const { sessionId, action } = req.params;
    const session = await ClassSession.findById(sessionId);

    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (!session.faculty.equals(req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (action === 'pause' && session.status !== 'live') {
      return res.status(400).json({ error: 'Can only pause live sessions' });
    }
    if (action === 'resume' && session.status !== 'paused') {
      return res.status(400).json({ error: 'Can only resume paused sessions' });
    }

    if (action === 'pause') {
      await session.pauseSession();
    } else {
      await session.resumeSession();
    }

    logger.info(`Session ${action}d`, { sessionId, facultyId: req.user.userId, action });

    req.app.get('io')?.to(`session-${sessionId}`).emit(`session_${action}d`, { sessionId, status: session.status });

    res.json({ message: `Session ${action}d successfully`, status: session.status });
  } catch (error) {
    logger.error(`Session ${req.params.action} error:`, error);
    next(error);
  }
};

// Enroll students in a session (Faculty/Admin only)
exports.enrollStudents = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { studentIds } = req.body;

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return res.status(400).json({ error: 'Invalid student IDs', message: 'Please provide an array of student IDs' });
    }

    const session = await ClassSession.findById(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const user = await User.findById(req.user.userId);
    if (req.user.role === 'faculty' && !session.faculty.equals(req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Verify all students belong to the same college
    const students = await User.find({
      _id: { $in: studentIds },
      role: 'student',
      college: user.college,
      isActive: true,
    });

    if (students.length !== studentIds.length) {
      return res.status(400).json({ error: 'Invalid students', message: 'Some students not found or not from your college' });
    }

    let enrolledCount = 0;
    const alreadyEnrolled = [];

    for (const studentId of studentIds) {
      const isAlreadyEnrolled = session.students.some((s) => s.student.equals(studentId));
      if (!isAlreadyEnrolled) {
        await session.addStudent(studentId);
        enrolledCount++;
      } else {
        alreadyEnrolled.push(studentId);
      }
    }

    logger.info('Students enrolled in session', {
      sessionId,
      enrolledBy: req.user.userId,
      studentsEnrolled: enrolledCount,
      alreadyEnrolled: alreadyEnrolled.length,
    });

    res.json({
      message: `${enrolledCount} students enrolled successfully`,
      enrolledCount,
      alreadyEnrolled: alreadyEnrolled.length,
      totalEnrolled: session.students.length,
    });
  } catch (error) {
    logger.error('Enroll students error:', error);
    next(error);
  }
};

// Delete (cancel) a session (Faculty/Admin only)
exports.deleteSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const session = await ClassSession.findById(sessionId);

    if (!session) return res.status(404).json({ error: 'Session not found' });

    if (req.user.role === 'faculty' && !session.faculty.equals(req.user.userId)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (session.status === 'live') {
      return res.status(400).json({ error: 'Cannot delete live session', message: 'Please end the session first' });
    }

    session.status = 'cancelled';
    await session.save();

    logger.info('Session deleted (cancelled)', { sessionId, deletedBy: req.user.userId });

    res.json({ message: 'Session cancelled successfully' });
  } catch (error) {
    logger.error('Delete session error:', error);
    next(error);
  }
};
