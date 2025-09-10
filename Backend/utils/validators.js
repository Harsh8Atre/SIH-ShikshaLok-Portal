const validator = require('validator');

// Validate email format
function isValidEmail(email) {
    return validator.isEmail(email);
}

// Validate password strength
function isStrongPassword(password) {
    // Minimum 6 characters, at least one uppercase, one lowercase, and one digit
    const strongPasswordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{6,}$/;
    return strongPasswordPattern.test(password);
}

// Validate phone number (international format)
function isValidPhoneNumber(phone) {
    return validator.isMobilePhone(phone, 'any', { strictMode: false });
}

// Validate MongoDB ObjectId format
function isValidObjectId(id) {
    return validator.isMongoId(id);
}

// Validate ISO8601 date string
function isISO8601Date(value) {
    return validator.isISO8601(value);
}

module.exports = {
    isValidEmail,
    isStrongPassword,
    isValidPhoneNumber,
    isValidObjectId,
    isISO8601Date,
};