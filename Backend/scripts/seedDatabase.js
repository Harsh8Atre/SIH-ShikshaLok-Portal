require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { User, College } = require('../models');
const logger = require('../utils/logger');

const DB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/educonnect';

// Connect to MongoDB
mongoose
    .connect(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => logger.info('Database connected for seeding'))
    .catch((err) => {
        logger.error('Database connection error:', err);
        process.exit(1);
    });

async function seed() {
    try {
        // Clear existing data
        await User.deleteMany({});
        await College.deleteMany({});

        // Create sample college
        const college = new College({
            name: 'Sample College',
            address: '123 Education Blvd, City, Country',
            contact: { email: 'contact@samplecollege.edu' },
            settings: {},
        });
        await college.save();

        // Create admin user
        const password = 'Admin@123'; // Change this after seeding
        const hashedPassword = await bcrypt.hash(password, 12);

        const adminUser = new User({
            name: 'Admin User',
            email: 'admin@samplecollege.edu',
            password: hashedPassword,
            role: 'admin',
            college: college._id,
            isActive: true,
        });
        await adminUser.save();

        // Link admin to college
        college.admin = adminUser._id;
        await college.save();

        logger.info('Database seeded successfully');
        console.log('Admin credentials - Email: admin@samplecollege.edu, Password: Admin@123');
        process.exit(0);
    } catch (error) {
        logger.error('Seeding error:', error);
        process.exit(1);
    }
}

seed();