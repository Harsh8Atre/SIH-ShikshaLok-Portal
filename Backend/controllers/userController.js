const bcrypt = require('bcryptjs');
const { User, College } = require('../models');
const logger = require('../utils/logger');

// Get detailed profile of a user by ID
exports.getUserProfile = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('-password')
      .populate('college', 'name address contact settings');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    logger.error('Get user profile error:', error);
    next(error);
  }
};

// Update user profile (self-update)
exports.updateUserProfile = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { name, phoneNumber, settings, specialization, experience } = req.body;

    const updateData = {};
    if (name) updateData.name = name.trim();
    if (phoneNumber) updateData.phoneNumber = phoneNumber.trim();
    if (settings) updateData.settings = { ...req.user.settings, ...settings };

    if (req.user.role === 'faculty') {
      if (specialization) updateData.specialization = specialization.trim();
      if (experience !== undefined) updateData.experience = parseInt(experience);
    }

    const user = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    })
      .select('-password')
      .populate('college', 'name');
    logger.info('User profile updated', { userId, updatedFields: Object.keys(updateData) });

    res.json({ message: 'Profile updated successfully', user });
  } catch (error) {
    logger.error('User profile update error:', error);
    next(error);
  }
};

// Upload or update profile picture URL for user
exports.updateProfilePicture = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded', message: 'Please upload a profile picture' });
    }
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Invalid file type', message: 'Profile picture must be an image' });
    }

    const profilePictureUrl = `/uploads/images/${req.file.filename}`;
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { profilePicture: profilePictureUrl },
      { new: true }
    ).select('-password');

    logger.info('Profile picture updated', { userId: user._id, filename: req.file.filename });
    res.json({ message: 'Profile picture updated successfully', profilePicture: profilePictureUrl, user });
  } catch (error) {
    logger.error('Profile picture upload error:', error);
    next(error);
  }
};

// List students (Admin only), with search and pagination
exports.listStudents = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, sortBy = 'name' } = req.query;
    const adminUser = await User.findById(req.user.userId);

    const query = {
      college: adminUser.college,
      role: 'student',
      isActive: true,
    };

    // Search by name, email or studentId
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { studentId: { $regex: search, $options: 'i' } },
      ];
    }

    const students = await User.find(query)
      .select('-password')
      .sort({ [sortBy]: 1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .lean();

    const totalStudents = await User.countDocuments(query);

    res.json({
      students,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(totalStudents / limit),
        totalStudents,
        hasNext: page * limit < totalStudents,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    logger.error('List students error:', error);
    next(error);
  }
};

// List faculty members in the college (Admin only)
exports.listFaculty = async (req, res, next) => {
  try {
    const adminUser = await User.findById(req.user.userId);
    const faculty = await User.find({
      college: adminUser.college,
      role: 'faculty',
      isActive: true,
    })
      .select('-password')
      .sort({ name: 1 });

    res.json({ faculty });
  } catch (error) {
    logger.error('List faculty error:', error);
    next(error);
  }
};

// Create user (Admin only)
exports.createUser = async (req, res, next) => {
  try {
    const { name, email, role, phoneNumber, specialization, experience } = req.body;

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists', message: 'User with this email already exists' });
    }

    const adminUser = await User.findById(req.user.userId);
    const college = await College.findById(adminUser.college);

    // Capacity checks
    if (role === 'student' && !college.canAddStudent()) {
      return res.status(400).json({ error: 'College capacity exceeded', message: 'Maximum student limit reached' });
    }
    if (role === 'faculty' && !college.canAddFaculty()) {
      return res.status(400).json({ error: 'College capacity exceeded', message: 'Maximum faculty limit reached' });
    }

    // Temporary password generation
    const tempPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const userData = {
      name: name.trim(),
      email: email.toLowerCase(),
      password: hashedPassword,
      role,
      phoneNumber: phoneNumber ? phoneNumber.trim() : undefined,
      college: adminUser.college,
    };

    if (role === 'student') {
      userData.studentId = `STU${Date.now()}${Math.floor(Math.random() * 1000)}`;
      userData.enrollmentYear = new Date().getFullYear();
    } else if (role === 'faculty') {
      if (specialization) userData.specialization = specialization.trim();
      if (experience !== undefined) userData.experience = parseInt(experience);
    }

    const user = new User(userData);
    await user.save();

    // Add user to college
    if (role === 'student') {
      await college.addStudent(user._id);
    } else if (role === 'faculty') {
      await college.addFaculty(user._id);
    }

    logger.info('User created by admin', { createdUserId: user._id, adminId: req.user.userId, role: user.role });
    logger.info('Temporary password generated', { email: user.email, tempPassword }); // Avoid in production logs

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        studentId: user.studentId,
      },
      tempPassword, // Do not send in production
    });
  } catch (error) {
    logger.error('User creation error:', error);
    next(error);
  }
};

// Update user (Admin only)
exports.updateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { name, phoneNumber, isActive, specialization, experience } = req.body;

    const targetUser = await User.findById(userId);
    const adminUser = await User.findById(req.user.userId);

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!targetUser.college.equals(adminUser.college)) {
      return res.status(403).json({ error: 'Access denied', message: 'Cannot modify users from other colleges' });
    }

    const updateData = {};
    if (name) updateData.name = name.trim();
    if (phoneNumber) updateData.phoneNumber = phoneNumber.trim();
    if (isActive !== undefined) updateData.isActive = isActive;

    if (targetUser.role === 'faculty') {
      if (specialization) updateData.specialization = specialization.trim();
      if (experience !== undefined) updateData.experience = parseInt(experience);
    }

    const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
      new: true,
      runValidators: true,
    })
      .select('-password')
      .populate('college', 'name');

    logger.info('User updated by admin', { updatedUserId: userId, adminId: req.user.userId, updatedFields: Object.keys(updateData) });
    res.json({ message: 'User updated successfully', user: updatedUser });
  } catch (error) {
    logger.error('User update error:', error);
    next(error);
  }
};

// Deactivate user (Admin only)
exports.deactivateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const targetUser = await User.findById(userId);
    const adminUser = await User.findById(req.user.userId);

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!targetUser.college.equals(adminUser.college)) {
      return res.status(403).json({ error: 'Access denied', message: 'Cannot modify users from other colleges' });
    }
    if (userId === req.user.userId) {
      return res.status(400).json({ error: 'Cannot deactivate yourself' });
    }

    targetUser.isActive = false;
    await targetUser.save();

    const college = await College.findById(adminUser.college);
    if (targetUser.role === 'student') {
      await college.removeStudent(userId);
    } else if (targetUser.role === 'faculty') {
      await college.removeFaculty(userId);
    }

    logger.info('User deactivated by admin', { deactivatedUserId: userId, adminId: req.user.userId });
    res.json({ message: 'User deactivated successfully' });
  } catch (error) {
    logger.error('User deactivation error:', error);
    next(error);
  }
};

// Bulk create users (Admin only)
exports.bulkCreateUsers = async (req, res, next) => {
  try {
    const { users } = req.body;
    if (!Array.isArray(users) || users.length === 0) {
      return res.status(400).json({ error: 'Invalid data', message: 'Please provide an array of users' });
    }

    const adminUser = await User.findById(req.user.userId);
    const college = await College.findById(adminUser.college);

    const createdUsers = [];
    const errors = [];

    for (const userData of users) {
      try {
        const { name, email, role, phoneNumber } = userData;

        if (!name || !email || !role) {
          errors.push({ email: email || 'unknown', error: 'Missing required fields (name, email, role)' });
          continue;
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
          errors.push({ email, error: 'User already exists' });
          continue;
        }

        if (role === 'student' && !college.canAddStudent()) {
          errors.push({ email, error: 'College student capacity exceeded' });
          continue;
        }
        if (role === 'faculty' && !college.canAddFaculty()) {
          errors.push({ email, error: 'College faculty capacity exceeded' });
          continue;
        }

        const tempPassword = Math.random().toString(36).slice(-8);
        const hashedPassword = await bcrypt.hash(tempPassword, 12);

        const newUserData = {
          name: name.trim(),
          email: email.toLowerCase(),
          password: hashedPassword,
          role,
          phoneNumber: phoneNumber ? phoneNumber.trim() : undefined,
          college: adminUser.college,
        };

        if (role === 'student') {
          newUserData.studentId = `STU${Date.now()}${Math.floor(Math.random() * 1000)}`;
          newUserData.enrollmentYear = new Date().getFullYear();
        }

        const user = new User(newUserData);
        await user.save();

        if (role === 'student') {
          await college.addStudent(user._id);
        } else if (role === 'faculty') {
          await college.addFaculty(user._id);
        }

        createdUsers.push({
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          tempPassword,
        });
      } catch (error) {
        errors.push({ email: userData.email || 'unknown', error: error.message });
      }
    }

    logger.info('Bulk user creation completed', {
      adminId: req.user.userId,
      created: createdUsers.length,
      failed: errors.length,
    });

    res.json({
      message: `Created ${createdUsers.length} users successfully`,
      createdUsers,
      errors,
      summary: {
        total: users.length,
        created: createdUsers.length,
        failed: errors.length,
      },
    });
  } catch (error) {
    logger.error('Bulk user creation error:', error);
    next(error);
  }
};
