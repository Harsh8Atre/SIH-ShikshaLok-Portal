// routes/users.js - User management routes
const express = require('express');
const router = express.Router();
const { User, College } = require('../models');
const { authenticateToken, requireRole, requireSameCollege } = require('../middleware/auth');
const { validationRules, handleValidationErrors } = require('../middleware/validation');
const { generalLimiter, uploadLimiter } = require('../middleware/rateLimiter');
const { upload } = require('../config/multer');
const logger = require('../utils/logger');

// Get current user profile
router.get('/profile',
  authenticateToken,
  async (req, res, next) => {
    try {
      const user = await User.findById(req.user.userId)
        .select('-password')
        .populate('college', 'name address contact settings');
      
      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      res.json({
        user,
        permissions: {
          canCreateSessions: user.role === 'faculty' || user.role === 'admin',
          canManageUsers: user.role === 'admin',
          canViewAnalytics: user.role === 'faculty' || user.role === 'admin',
          canManageCollege: user.role === 'admin'
        }
      });

    } catch (error) {
      logger.error('Profile fetch error:', error);
      next(error);
    }
  }
);

// Update user profile
router.patch('/profile',
  authenticateToken,
  [
    validationRules.userRegistration[0], // name validation
    validationRules.userRegistration[4], // phone validation
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { name, phoneNumber, settings, specialization, experience } = req.body;
      
      const updateData = {};
      if (name) updateData.name = name.trim();
      if (phoneNumber) updateData.phoneNumber = phoneNumber.trim();
      if (settings) {
        updateData.settings = { 
          ...req.user.userData?.settings, 
          ...settings 
        };
      }

      // Faculty-specific fields
      if (req.user.role === 'faculty') {
        if (specialization) updateData.specialization = specialization.trim();
        if (experience !== undefined) updateData.experience = parseInt(experience);
      }

      const user = await User.findByIdAndUpdate(
        req.user.userId,
        updateData,
        { new: true, runValidators: true }
      ).select('-password').populate('college', 'name');

      logger.info('Profile updated', {
        userId: user._id,
        updatedFields: Object.keys(updateData)
      });

      res.json({
        message: 'Profile updated successfully',
        user
      });

    } catch (error) {
      logger.error('Profile update error:', error);
      next(error);
    }
  }
);

// Upload profile picture
router.post('/profile/picture',
  authenticateToken,
  uploadLimiter,
  upload.single('profilePicture'),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded',
          message: 'Please select a profile picture to upload'
        });
      }

      // Validate file type
      if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({
          error: 'Invalid file type',
          message: 'Profile picture must be an image'
        });
      }

      const profilePictureUrl = `/uploads/images/${req.file.filename}`;

      const user = await User.findByIdAndUpdate(
        req.user.userId,
        { profilePicture: profilePictureUrl },
        { new: true }
      ).select('-password');

      logger.info('Profile picture updated', {
        userId: user._id,
        filename: req.file.filename
      });

      res.json({
        message: 'Profile picture updated successfully',
        profilePicture: profilePictureUrl,
        user
      });

    } catch (error) {
      logger.error('Profile picture upload error:', error);
      next(error);
    }
  }
);

// Get all students (Admin only)
router.get('/students',
  authenticateToken,
  requireRole(['admin']),
  generalLimiter,
  async (req, res, next) => {
    try {
      const { page = 1, limit = 20, search, sortBy = 'name' } = req.query;
      
      const adminUser = await User.findById(req.user.userId);
      const query = {
        college: adminUser.college,
        role: 'student',
        isActive: true
      };

      // Add search functionality
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { studentId: { $regex: search, $options: 'i' } }
        ];
      }

      const students = await User.find(query)
        .select('-password')
        .sort({ [sortBy]: 1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .lean();

      const totalStudents = await User.countDocuments(query);

      res.json({
        students,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalStudents / limit),
          totalStudents,
          hasNext: page * limit < totalStudents,
          hasPrev: page > 1
        }
      });

    } catch (error) {
      logger.error('Students fetch error:', error);
      next(error);
    }
  }
);

// Get all faculty (Admin only)
router.get('/faculty',
  authenticateToken,
  requireRole(['admin']),
  async (req, res, next) => {
    try {
      const adminUser = await User.findById(req.user.userId);
      
      const faculty = await User.find({
        college: adminUser.college,
        role: 'faculty',
        isActive: true
      })
      .select('-password')
      .sort({ name: 1 });

      res.json({ faculty });

    } catch (error) {
      logger.error('Faculty fetch error:', error);
      next(error);
    }
  }
);

// Create new user (Admin only)
router.post('/',
  authenticateToken,
  requireRole(['admin']),
  validationRules.userRegistration,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { name, email, role, phoneNumber, specialization, experience } = req.body;
      
      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(409).json({
          error: 'User already exists',
          message: 'A user with this email already exists'
        });
      }

      // Get admin's college
      const adminUser = await User.findById(req.user.userId);
      const college = await College.findById(adminUser.college);

      // Check college capacity
      if (role === 'student' && !college.canAddStudent()) {
        return res.status(400).json({
          error: 'College capacity exceeded',
          message: 'Maximum student limit reached'
        });
      }

      if (role === 'faculty' && !college.canAddFaculty()) {
        return res.status(400).json({
          error: 'College capacity exceeded',
          message: 'Maximum faculty limit reached'
        });
      }

      // Generate temporary password
      const tempPassword = Math.random().toString(36).slice(-8);
      const hashedPassword = await bcrypt.hash(tempPassword, 12);

      const userData = {
        name: name.trim(),
        email: email.toLowerCase(),
        password: hashedPassword,
        role,
        phoneNumber: phoneNumber ? phoneNumber.trim() : undefined,
        college: adminUser.college
      };

      // Add role-specific fields
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

      logger.info('User created by admin', {
        createdUserId: user._id,
        adminId: req.user.userId,
        role: user.role
      });

      // In production, send email with temporary password
      logger.info('Temporary password generated', {
        email: user.email,
        tempPassword: tempPassword // Don't log this in production!
      });

      res.status(201).json({
        message: 'User created successfully',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          studentId: user.studentId
        },
        tempPassword: tempPassword // Don't send this in production!
      });

    } catch (error) {
      logger.error('User creation error:', error);
      next(error);
    }
  }
);

// Update user (Admin only)
router.patch('/:userId',
  authenticateToken,
  requireRole(['admin']),
  validationRules.userId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { userId } = req.params;
      const { name, phoneNumber, isActive, specialization, experience } = req.body;

      // Verify user belongs to same college
      const targetUser = await User.findById(userId);
      const adminUser = await User.findById(req.user.userId);

      if (!targetUser) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      if (!targetUser.college.equals(adminUser.college)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Cannot modify users from other colleges'
        });
      }

      const updateData = {};
      if (name) updateData.name = name.trim();
      if (phoneNumber) updateData.phoneNumber = phoneNumber.trim();
      if (isActive !== undefined) updateData.isActive = isActive;

      // Role-specific updates
      if (targetUser.role === 'faculty') {
        if (specialization) updateData.specialization = specialization.trim();
        if (experience !== undefined) updateData.experience = parseInt(experience);
      }

      const updatedUser = await User.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');

      logger.info('User updated by admin', {
        updatedUserId: userId,
        adminId: req.user.userId,
        updatedFields: Object.keys(updateData)
      });

      res.json({
        message: 'User updated successfully',
        user: updatedUser
      });

    } catch (error) {
      logger.error('User update error:', error);
      next(error);
    }
  }
);

// Deactivate user (Admin only)
router.delete('/:userId',
  authenticateToken,
  requireRole(['admin']),
  validationRules.userId,
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { userId } = req.params;

      // Verify user belongs to same college
      const targetUser = await User.findById(userId);
      const adminUser = await User.findById(req.user.userId);

      if (!targetUser) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      if (!targetUser.college.equals(adminUser.college)) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'Cannot modify users from other colleges'
        });
      }

      // Don't allow admin to deactivate themselves
      if (userId === req.user.userId) {
        return res.status(400).json({
          error: 'Cannot deactivate yourself'
        });
      }

      // Deactivate user instead of deleting
      targetUser.isActive = false;
      await targetUser.save();

      // Remove from college lists
      const college = await College.findById(adminUser.college);
      if (targetUser.role === 'student') {
        await college.removeStudent(userId);
      } else if (targetUser.role === 'faculty') {
        await college.removeFaculty(userId);
      }

      logger.info('User deactivated by admin', {
        deactivatedUserId: userId,
        adminId: req.user.userId
      });

      res.json({
        message: 'User deactivated successfully'
      });

    } catch (error) {
      logger.error('User deactivation error:', error);
      next(error);
    }
  }
);

// Bulk create users (Admin only)
router.post('/bulk',
  authenticateToken,
  requireRole(['admin']),
  async (req, res, next) => {
    try {
      const { users } = req.body;

      if (!Array.isArray(users) || users.length === 0) {
        return res.status(400).json({
          error: 'Invalid data',
          message: 'Please provide an array of users'
        });
      }

      const adminUser = await User.findById(req.user.userId);
      const college = await College.findById(adminUser.college);

      const createdUsers = [];
      const errors = [];

      for (const userData of users) {
        try {
          const { name, email, role, phoneNumber } = userData;

          // Validate required fields
          if (!name || !email || !role) {
            errors.push({
              email: email || 'unknown',
              error: 'Missing required fields (name, email, role)'
            });
            continue;
          }

          // Check if user exists
          const existingUser = await User.findOne({ email: email.toLowerCase() });
          if (existingUser) {
            errors.push({
              email,
              error: 'User already exists'
            });
            continue;
          }

          // Check college capacity
          if (role === 'student' && !college.canAddStudent()) {
            errors.push({
              email,
              error: 'College student capacity exceeded'
            });
            continue;
          }

          if (role === 'faculty' && !college.canAddFaculty()) {
            errors.push({
              email,
              error: 'College faculty capacity exceeded'
            });
            continue;
          }

          // Generate temporary password
          const tempPassword = Math.random().toString(36).slice(-8);
          const hashedPassword = await bcrypt.hash(tempPassword, 12);

          const newUserData = {
            name: name.trim(),
            email: email.toLowerCase(),
            password: hashedPassword,
            role,
            phoneNumber: phoneNumber ? phoneNumber.trim() : undefined,
            college: adminUser.college
          };

          // Add role-specific fields
          if (role === 'student') {
            newUserData.studentId = `STU${Date.now()}${Math.floor(Math.random() * 1000)}`;
            newUserData.enrollmentYear = new Date().getFullYear();
          }

          const user = new User(newUserData);
          await user.save();

          // Add to college
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
            tempPassword
          });

        } catch (error) {
          errors.push({
            email: userData.email || 'unknown',
            error: error.message
          });
        }
      }

      logger.info('Bulk user creation completed', {
        adminId: req.user.userId,
        created: createdUsers.length,
        failed: errors.length
      });

      res.json({
        message: `Created ${createdUsers.length} users successfully`,
        createdUsers,
        errors,
        summary: {
          total: users.length,
          created: createdUsers.length,
          failed: errors.length
        }
      });

    } catch (error) {
      logger.error('Bulk user creation error:', error);
      next(error);
    }
  }
);

module.exports = router;