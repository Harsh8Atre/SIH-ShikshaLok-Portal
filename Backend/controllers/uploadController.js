const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const { upload, handleMulterError } = require('../config/multer');

// Upload a single file with multer middleware
exports.uploadFile = [
  upload.single('file'),  // Expecting "file" field name
  (req, res, next) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded', message: 'Please select a file to upload' });
    }

    const fileUrl = `/uploads/${req.file.path.replace(/\\/g, '/')}`;

    logger.info('File uploaded', {
      fileName: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype,
      uploader: req.user ? req.user.userId : 'anonymous',
    });

    res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        url: fileUrl,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
      },
    });
  },
];

// Upload multiple files with multer middleware
exports.uploadMultipleFiles = [
  upload.array('files', 5), // Max 5 files expected with 'files' field
  (req, res, next) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded', message: 'Please select files to upload' });
    }

    const filesInfo = req.files.map((file) => ({
      url: `/uploads/${file.path.replace(/\\/g, '/')}`,
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    }));

    logger.info('Multiple files uploaded', {
      count: req.files.length,
      uploader: req.user ? req.user.userId : 'anonymous',
    });

    res.status(201).json({
      message: 'Files uploaded successfully',
      files: filesInfo,
    });
  },
];

// Middleware to handle multer errors globally
exports.handleUploadErrors = (err, req, res, next) => {
  handleMulterError(err, req, res, next);
};

// Optionally: file delete utility function
exports.deleteFile = (filePath) => {
  const fullPath = path.join(process.cwd(), filePath);
  fs.unlink(fullPath, (err) => {
    if (err) {
      logger.error('File deletion error:', err);
    } else {
      logger.info('File deleted', { filePath });
    }
  });
};
