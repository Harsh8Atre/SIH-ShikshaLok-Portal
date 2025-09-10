const faker = require('faker');
const bcrypt = require('bcryptjs');

/**
 * Generates a mock user object.
 * @param {Object} overrides Optional fields to override defaults.
 * @returns {Object} Mock user data.
 */
function createMockUser(overrides = {}) {
    return {
        name: overrides.name || faker.name.findName(),
        email: overrides.email || faker.internet.email(),
        password: overrides.password || 'Test@1234',
        role: overrides.role || 'student',
        college: overrides.college || 'mock-college-id',
        isActive: overrides.isActive !== undefined ? overrides.isActive : true,
        ...overrides,
    };
}

/**
 * Hashes a plain text password for testing.
 * @param {string} password The plain password.
 * @returns {Promise<string>} Hashed password.
 */
async function hashPassword(password) {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
}

/**
 * Creates a mock authentication token payload.
 * @param {Object} user The user object.
 * @returns {Object} Mock auth JWT payload.
 */
function createAuthTokenPayload(user) {
    return {
        userId: user._id || 'mock-user-id',
        role: user.role || 'student',
        email: user.email || 'test@example.com',
    };
}

module.exports = {
    createMockUser,
    hashPassword,
    createAuthTokenPayload,
};