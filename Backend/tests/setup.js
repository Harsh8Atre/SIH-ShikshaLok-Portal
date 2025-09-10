const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

module.exports = async() => {
    // Start in-memory MongoDB server for isolated tests
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();

    process.env.MONGODB_URI = mongoUri;

    // Connect mongoose to in-memory server
    await mongoose.connect(mongoUri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    });

    // Optional: Clear collections before each test file
    const collections = await mongoose.connection.db.collections();
    for (let collection of collections) {
        await collection.deleteMany({});
    }

    // Setup global helper if needed
    global.__MONGO_URI__ = mongoUri;

    // Gracefully disconnect after tests finish
    const cleanup = async() => {
        await mongoose.disconnect();
        await mongoServer.stop();
    };

    // Register cleanup after tests complete
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
    process.on('exit', cleanup);
};