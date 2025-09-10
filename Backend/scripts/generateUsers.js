require('dotenv').config();
const mongoose = require('mongoose');
const faker = require('faker');
const bcrypt = require('bcryptjs');
const { User, College } = require('../models');
const logger = require('../utils/logger');

const DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/educonnect';

const TOTAL_USERS = 100; // Number of users to generate
const PASSWORD = 'Test@1234'; // Default test password for all generated users

// Connect to MongoDB
mongoose
    .connect(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => logger.info('Database connected for user generation'))
    .catch((err) => {
        logger.error('Database connection error:', err);
        process.exit(1);
    });

async function generateUsers() {
    try {
        const colleges = await College.find({});
        if (colleges.length === 0) {
            logger.error('No colleges found. Please seed colleges first.');
            process.exit(1);
        }
        const hashedPassword = await bcrypt.hash(PASSWORD, 12);

        for (let i = 0; i < TOTAL_USERS; i++) {
            const college = colleges[Math.floor(Math.random() * colleges.length)];

            const user = new User({
                name: faker.name.findName(),
                email: faker.internet.email(),
                password: hashedPassword,
                role: 'student',
                college: college._id,
                studentId: `STU${Date.now()}${i}`,
                enrollmentYear: 2025,
                isActive: true,
            });

            await user.save();
            logger.info(`Generated user: ${user.email} for college: ${college.name}`);
        }

        logger.info(`${TOTAL_USERS} users generated successfully.`);
        process.exit(0);
    } catch (error) {
        logger.error('User generation error:', error);
        process.exit(1);
    }
}

generateUsers();