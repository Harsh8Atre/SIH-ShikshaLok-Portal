const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

const TEMP_DIR = path.join(process.cwd(), 'uploads', 'temp');
const LOG_DIR = path.join(process.cwd(), 'logs');
const MAX_FILE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function cleanupOldFiles(directory) {
    if (!fs.existsSync(directory)) {
        logger.warn(`Directory does not exist: ${directory}`);
        return;
    }
    fs.readdir(directory, (err, files) => {
        if (err) {
            logger.error(`Error reading directory ${directory}:`, err);
            return;
        }
        const now = Date.now();
        files.forEach((file) => {
            const filePath = path.join(directory, file);
            fs.stat(filePath, (err, stats) => {
                if (err) {
                    logger.error(`Error stating file ${filePath}:`, err);
                    return;
                }
                if (now - stats.mtimeMs > MAX_FILE_AGE_MS) {
                    fs.unlink(filePath, (err) => {
                        if (err) {
                            logger.error(`Error deleting file ${filePath}:`, err);
                            return;
                        }
                        logger.info(`Deleted old file: ${filePath}`);
                    });
                }
            });
        });
    });
}

function runCleanup() {
    cleanupOldFiles(TEMP_DIR);
    cleanupOldFiles(LOG_DIR);
    logger.info('Old files cleanup completed');
}

runCleanup();