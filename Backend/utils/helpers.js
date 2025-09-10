const crypto = require('crypto');

// Generate random string of given length
function generateRandomString(length = 16) {
    return crypto.randomBytes(length).toString('hex');
}

// Format Date object to "YYYY-MM-DD HH:mm:ss"
function formatDateTime(date) {
    const pad = (n) => (n < 10 ? '0' + n : n);
    return (
        date.getFullYear() +
        '-' +
        pad(date.getMonth() + 1) +
        '-' +
        pad(date.getDate()) +
        ' ' +
        pad(date.getHours()) +
        ':' +
        pad(date.getMinutes()) +
        ':' +
        pad(date.getSeconds())
    );
}

// Safe JSON parse with fallback
function safeJSONParse(str, fallback = null) {
    try {
        return JSON.parse(str);
    } catch {
        return fallback;
    }
}

// Delay promise for a given milliseconds
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
    generateRandomString,
    formatDateTime,
    safeJSONParse,
    delay,
};