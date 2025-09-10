const mongoose = require('mongoose');
const logger = require('../utils/logger');
const { MONGODB_URI } = process.env || 'mongodb://localhost:27017/educonnect';

// Example migration tasks
const migrations = [{
        id: '2025-09-10-add-new-field-to-user',
        description: 'Add phoneNumber field to user documents if missing',
        up: async() => {
            const { User } = require('../models');
            await User.updateMany({ phoneNumber: { $exists: false } }, { $set: { phoneNumber: null } });
            logger.info('Migration 2025-09-10-add-new-field-to-user applied');
        },
    },
    // Add more migration objects here with unique ids and up functions
];

// Connect to DB and run migrations
async function migrate() {
    try {
        await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
        logger.info('Connected to database for migrations');

        for (const migration of migrations) {
            logger.info(`Running migration: ${migration.id} - ${migration.description}`);
            await migration.up();
        }

        logger.info('All migrations applied successfully');
        process.exit(0);
    } catch (error) {
        logger.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();