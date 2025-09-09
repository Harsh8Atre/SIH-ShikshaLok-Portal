// config/multer.js - File upload configuration
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// Ensure upload directories exist
const ensureUploadDirs = () => {
  const dirs = ['uploads', 'uploads/documents', 'uploads/images', 'uploads/videos', 'uploads/temp'];
  
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`Created upload directory: ${dir}`);
    }
  });
};

// Initialize directories
ensureUploadDirs();

// Storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    let uploadPath = 'uploads/temp';
    
    // Determine upload path based on file type
    if (file.mimetype.startsWith('image/')) {
      uploadPath = 'uploads/images';
    } else if (file.mimetype.startsWith('video/')) {
      uploadPath = 'uploads/videos';
    } else if (file.mimetype === 'application/pdf' || 
               file.mimetype.includes('document') ||
               file.mimetype.includes('spreadsheet') ||
               file.mimetype.includes('presentation')) {
      uploadPath = 'uploads/documents';
    }
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    // Generate unique filename
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileName = file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname);
    cb(null, fileName);
  }
});

// File filter function
const fileFilter = (req, file, cb) => {
  const allowedTypes = process.env.ALLOWED_FILE_TYPES || 'jpeg,jpg,png,gif,pdf,doc,docx,ppt,pptx,mp4,mp3';
  const allowedExtensions = allowedTypes.split(',');
  
  const fileExtension = path.extname(file.originalname).toLowerCase().substring(1);
  const mimeType = file.mimetype.toLowerCase();
  
  // Check file extension
  if (!allowedExtensions.includes(fileExtension)) {
    logger.warn(`File upload rejected - invalid extension: ${fileExtension}`);
    return cb(new Error(`File type not allowed. Allowed types: ${allowedTypes}`), false);
  }
  
  // Additional MIME type validation
  const allowedMimeTypes = [
    'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'video/mp4', 'video/mpeg', 'video/quicktime',
    'audio/mpeg', 'audio/mp3', 'audio/wav'
  ];
  
  if (!allowedMimeTypes.includes(mimeType)) {
    logger.warn(`File upload rejected - invalid MIME type: ${mimeType}`);
    return cb(new Error('Invalid file type'), false);
  }
  
  cb(null, true);
};

// Multer configuration
const upload = multer({
  storage: storage,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
    files: 5 // Maximum 5 files per request
  },
  fileFilter: fileFilter
});

// Error handling middleware
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        maxSize: process.env.MAX_FILE_SIZE || '10MB'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Too many files',
        maxFiles: 5
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        error: 'Unexpected file field'
      });
    }
  }
  
  if (error.message.includes('File type not allowed')) {
    return res.status(400).json({
      error: error.message
    });
  }
  
  logger.error('Multer error:', error);
  res.status(500).json({ error: 'File upload failed' });
};

// Clean up old temporary files (run periodically)
const cleanupTempFiles = () => {
  const tempDir = 'uploads/temp';
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  if (!fs.existsSync(tempDir)) return;
  
  fs.readdir(tempDir, (err, files) => {
    if (err) {
      logger.error('Error reading temp directory:', err);
      return;
    }
    
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        
        const now = Date.now();
        const fileAge = now - stats.mtime.getTime();
        
        if (fileAge > maxAge) {
          fs.unlink(filePath, (err) => {
            if (err) {
              logger.error(`Error deleting temp file ${file}:`, err);
            } else {
              logger.info(`Deleted old temp file: ${file}`);
            }
          });
        }
      });
    });
  });
};

// Schedule cleanup every 6 hours
setInterval(cleanupTempFiles, 6 * 60 * 60 * 1000);

module.exports = {
  upload,
  handleMulterError,
  cleanupTempFiles,
  ensureUploadDirs
};