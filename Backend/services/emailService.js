const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// Load email config from environment variables
const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST || 'smtp.gmail.com',
    port: process.env.MAIL_PORT ? Number(process.env.MAIL_PORT) : 587,
    secure: process.env.MAIL_SECURE === 'true', // true for port 465, false for others
    auth: {
        user: process.env.MAIL_USER, // Email address or SMTP user
        pass: process.env.MAIL_PASS, // Email password or app password
    },
});

// Optional: Check SMTP connection on project startup
transporter.verify(function(error, success) {
    if (error) {
        logger.error('Email service SMTP connection failed:', error);
    } else {
        logger.info('Email service SMTP connection successful');
    }
});

/**
 * Send an email using nodemailer
 * @param {Object} options - Email options object
 * @param {string} options.to - Comma-separated list of recipients
 * @param {string} options.subject - Email subject
 * @param {string} options.text - Plain text content
 * @param {string} [options.html] - HTML content
 * @param {Array} [options.attachments] - Optional array of files
 * @param {string} [options.from] - Optional sender address (defaults to config)
 */
async function sendEmail(options) {
    try {
        const mailOptions = {
            from: options.from || process.env.MAIL_FROM || process.env.MAIL_USER,
            to: options.to,
            subject: options.subject,
            text: options.text,
            html: options.html,
            attachments: options.attachments, // [{ filename, path }, ...]
        };

        const info = await transporter.sendMail(mailOptions);

        logger.info('Email sent', {
            to: options.to,
            subject: options.subject,
            messageId: info.messageId,
            response: info.response,
        });

        return info;
    } catch (error) {
        logger.error('Email send error:', error);
        throw error;
    }
}

module.exports = {
    sendEmail,
};