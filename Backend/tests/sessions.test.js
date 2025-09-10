const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const { User, College, ClassSession } = require('../models');
const bcrypt = require('bcryptjs');

let adminToken;
let facultyToken;
let collegeId;
let facultyId;

describe('Session Management API', () => {
    beforeAll(async() => {
        await mongoose.connect(global.__MONGO_URI__, { useNewUrlParser: true, useUnifiedTopology: true });

        // Seed college
        const college = new College({ name: 'Test College' });
        await college.save();
        collegeId = college._id;

        // Seed admin
        const adminPassword = await bcrypt.hash('AdminPass1', 12);
        const admin = new User({
            name: 'Admin User',
            email: 'admin@test.com',
            password: adminPassword,
            role: 'admin',
            college: collegeId,
            isActive: true,
        });
        await admin.save();

        // Seed faculty
        const facultyPassword = await bcrypt.hash('FacultyPass1', 12);
        const faculty = new User({
            name: 'Faculty User',
            email: 'faculty@test.com',
            password: facultyPassword,
            role: 'faculty',
            college: collegeId,
            isActive: true,
        });
        await faculty.save();
        facultyId = faculty._id;

        // Login admin
        const adminRes = await request(app).post('/api/auth/login').send({
            email: 'admin@test.com',
            password: 'AdminPass1',
        });
        adminToken = adminRes.body.tokens.accessToken;

        // Login faculty
        const facultyRes = await request(app).post('/api/auth/login').send({
            email: 'faculty@test.com',
            password: 'FacultyPass1',
        });
        facultyToken = facultyRes.body.tokens.accessToken;
    });

    afterAll(async() => {
        await mongoose.connection.close();
    });

    afterEach(async() => {
        await ClassSession.deleteMany({});
    });

    it('should prevent unauthenticated creation of session', async() => {
        const res = await request(app).post('/api/sessions').send({
            title: 'Unauthorized Session',
            subject: 'Math',
            scheduledStartTime: new Date(Date.now() + 3600000).toISOString(),
        });
        expect(res.statusCode).toBe(401);
    });

    it('should allow faculty to create a session', async() => {
        const res = await request(app)
            .post('/api/sessions')
            .set('Authorization', `Bearer ${facultyToken}`)
            .send({
                title: 'Algebra Class',
                subject: 'Math',
                scheduledStartTime: new Date(Date.now() + 3600000).toISOString(),
                duration: 60,
            });

        expect(res.statusCode).toBe(201);
        expect(res.body.title).toBe('Algebra Class');
        expect(res.body.faculty).toBe(facultyId.toString());
    });

    it('should not allow student to create session', async() => {
        // Seed student and login
        const studentPassword = await bcrypt.hash('StudentPass1', 12);
        const student = new User({
            name: 'Student User',
            email: 'student@test.com',
            password: studentPassword,
            role: 'student',
            college: collegeId,
            isActive: true,
        });
        await student.save();

        const studentRes = await request(app).post('/api/auth/login').send({
            email: 'student@test.com',
            password: 'StudentPass1',
        });

        const studentToken = studentRes.body.tokens.accessToken;

        const res = await request(app)
            .post('/api/sessions')
            .set('Authorization', `Bearer ${studentToken}`)
            .send({
                title: 'Student Session',
                subject: 'Science',
                scheduledStartTime: new Date(Date.now() + 3600000).toISOString(),
            });

        expect(res.statusCode).toBe(403);
    });

    it('should fetch sessions for a college admin', async() => {
        await ClassSession.create({
            title: 'History Session',
            subject: 'History',
            scheduledStartTime: new Date(Date.now() + 3600000),
            faculty: facultyId,
            college: collegeId,
        });

        const res = await request(app)
            .get('/api/sessions')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
    });
});