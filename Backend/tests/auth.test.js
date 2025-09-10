const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app'); // Express app
const { User, College } = require('../models');

describe('Authentication API', () => {
    beforeAll(async() => {
        // Connect to a test database
        await mongoose.connect(global.__MONGO_URI__, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
    });

    afterAll(async() => {
        // Disconnect after tests
        await mongoose.connection.close();
    });

    afterEach(async() => {
        // Clean up database
        await User.deleteMany({});
        await College.deleteMany({});
    });

    describe('POST /api/auth/register', () => {
        it('should register a new admin user and create a college', async() => {
            const res = await request(app).post('/api/auth/register').send({
                name: 'Admin User',
                email: 'admin@example.com',
                password: 'StrongPassword1',
                role: 'admin',
                collegeName: 'Test College',
            });

            expect(res.statusCode).toBe(201);
            expect(res.body.user).toBeDefined();
            expect(res.body.user.email).toBe('admin@example.com');
            expect(res.body.tokens).toHaveProperty('accessToken');

            // Verify that the college is created
            const college = await College.findOne({ name: 'Test College' });
            expect(college).not.toBeNull();
            expect(college.admin.toString()).toBe(res.body.user._id);
        });

        it('should not allow registration with an existing email', async() => {
            const userData = {
                name: 'Test User',
                email: 'test@example.com',
                password: 'Password123',
                role: 'student',
            };

            // Register first user
            await request(app).post('/api/auth/register').send(userData);

            // Attempt to register again with same email
            const res = await request(app).post('/api/auth/register').send(userData);

            expect(res.statusCode).toBe(409);
            expect(res.body.error).toMatch(/already exists/i);
        });
    });

    describe('POST /api/auth/login', () => {
        beforeEach(async() => {
            // Seed a user for login tests
            const res = await request(app).post('/api/auth/register').send({
                name: 'Login User',
                email: 'login@example.com',
                password: 'LoginPass123',
                role: 'student',
            });
            expect(res.statusCode).toBe(201);
        });

        it('should login with correct credentials', async() => {
            const res = await request(app).post('/api/auth/login').send({
                email: 'login@example.com',
                password: 'LoginPass123',
            });

            expect(res.statusCode).toBe(200);
            expect(res.body.tokens).toHaveProperty('accessToken');
            expect(res.body.user.email).toBe('login@example.com');
        });

        it('should reject login with incorrect password', async() => {
            const res = await request(app).post('/api/auth/login').send({
                email: 'login@example.com',
                password: 'WrongPass',
            });

            expect(res.statusCode).toBe(401);
            expect(res.body.error).toMatch(/invalid credentials/i);
        });

        it('should reject login for non-existent user', async() => {
            const res = await request(app).post('/api/auth/login').send({
                email: 'missing@example.com',
                password: 'AnyPass123',
            });

            expect(res.statusCode).toBe(401);
            expect(res.body.error).toMatch(/invalid credentials/i);
        });
    });
});