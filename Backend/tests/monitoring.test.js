const mongoose = require('mongoose');
const monitoringService = require('../services/monitoringService');
const { Attendance, ClassSession, User } = require('../models');

jest.mock('../models');

describe('Monitoring Service', () => {
    beforeAll(async() => {
        await mongoose.connect(global.__MONGO_URI__, { useNewUrlParser: true, useUnifiedTopology: true });
    });

    afterAll(async() => {
        await mongoose.connection.close();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('recordStudentActivity', () => {
        it('throws error if attendance not found', async() => {
            Attendance.findOne.mockResolvedValue(null);

            await expect(
                monitoringService.recordStudentActivity({ sessionId: 'session1', studentId: 'student1', activityType: 'heartbeat' })
            ).rejects.toThrow('Attendance not found');
        });

        it('updates attendance on heartbeat activity', async() => {
            const mockAttendance = {
                lastActivity: null,
                status: 'inactive',
                save: jest.fn().mockResolvedValue(true),
            };
            Attendance.findOne.mockResolvedValue(mockAttendance);

            const result = await monitoringService.recordStudentActivity({
                sessionId: 'session1',
                studentId: 'student1',
                activityType: 'heartbeat',
            });

            expect(result.lastActivity).not.toBeNull();
            expect(result.status).toBe('active');
            expect(mockAttendance.save).toHaveBeenCalled();
        });

        it('adds alert on suspicious activity', async() => {
            const mockAttendance = {
                addAlert: jest.fn().mockResolvedValue(true),
                save: jest.fn().mockResolvedValue(true),
            };
            Attendance.findOne.mockResolvedValue(mockAttendance);

            await monitoringService.recordStudentActivity({
                sessionId: 'session1',
                studentId: 'student1',
                activityType: 'suspicious_activity',
                details: 'Face not detected',
            });

            expect(mockAttendance.addAlert).toHaveBeenCalledWith('suspicious_activity', 'Face not detected', 'high');
            expect(mockAttendance.save).toHaveBeenCalled();
        });
    });

    describe('getMonitoringDashboard', () => {
        it('throws error if session not found', async() => {
            ClassSession.findById = jest.fn().mockResolvedValue(null);

            await expect(monitoringService.getMonitoringDashboard('sess1', 'faculty1')).rejects.toThrow('Session not found');
        });

        it('throws error if faculty ID mismatches session faculty', async() => {
            ClassSession.findById = jest.fn().mockResolvedValue({
                faculty: 'faculty2',
                _id: 'sess1',
            });

            await expect(monitoringService.getMonitoringDashboard('sess1', 'faculty1')).rejects.toThrow('Access denied');
        });

        it('returns monitoring dashboard data', async() => {
            ClassSession.findById = jest.fn().mockResolvedValue({
                faculty: 'faculty1',
                _id: 'sess1',
            });

            Attendance.find = jest.fn().mockResolvedValue([{
                student: { _id: 'user1', name: 'Jane Doe', email: 'jane@example.com', studentId: 'STU123' },
                status: 'active',
                isPresent: true,
                joinTime: new Date(),
                leaveTime: null,
                totalDuration: 3600,
                lastActivity: new Date(),
                location: { latitude: 28.6, longitude: 77.2 },
                activityMonitoring: {},
                engagement: { participationScore: 80 },
                alertSummary: {},
                calculated: { attendancePercentage: 90 },
                deviceInfo: {},
                networkInfo: { qualityScore: 4 },
            }, ]);

            const dashboard = await monitoringService.getMonitoringDashboard('sess1', 'faculty1');

            expect(Array.isArray(dashboard)).toBe(true);
            expect(dashboard[0].name).toBe('Jane Doe');
            expect(dashboard[0].status).toBe('active');
        });
    });
});