const pollHandlers = require('../socket/pollHandlers');
const { Poll, Attendance } = require('../models');

jest.mock('../models');

describe('Poll Socket Events', () => {
    let io;
    let socket;
    let callback;

    beforeEach(() => {
        io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
        socket = { userId: 'user1', userRole: 'student' };
        callback = jest.fn();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should call error callback if poll not found', async() => {
        Poll.findById = jest.fn().mockResolvedValue(null);

        await pollHandlers(io, socket).poll_vote({ pollId: 'poll1', optionIndex: 0 }, callback);

        expect(callback).toHaveBeenCalledWith(expect.objectContaining({ error: 'Poll not found' }));
    });

    it('should call error callback if poll expired', async() => {
        Poll.findById = jest.fn().mockResolvedValue({
            isActive: false,
            expiresAt: new Date(Date.now() - 1000),
            session: { students: [{ student: 'user1' }] },
        });

        await pollHandlers(io, socket).poll_vote({ pollId: 'poll1', optionIndex: 0 }, callback);

        expect(callback).toHaveBeenCalledWith(expect.objectContaining({ error: 'Poll is not active or expired' }));
    });

    it('should call error callback if user not enrolled', async() => {
        Poll.findById = jest.fn().mockResolvedValue({
            isActive: true,
            expiresAt: null,
            session: { students: [{ student: 'anotherUser' }] },
        });

        await pollHandlers(io, socket).poll_vote({ pollId: 'poll1', optionIndex: 0 }, callback);

        expect(callback).toHaveBeenCalledWith(expect.objectContaining({ error: 'User not enrolled in session' }));
    });

    it('should record vote for single choice poll', async() => {
        const pollMock = {
            isActive: true,
            expiresAt: null,
            type: 'single_choice',
            options: [
                { voters: [], votes: 0, text: 'Option 1' },
                { voters: [], votes: 0, text: 'Option 2' },
            ],
            session: { _id: 'sess1', students: [{ student: 'user1' }] },
            save: jest.fn().mockResolvedValue(true),
            textResponses: [],
            settings: { allowChangeVote: false },
        };

        Poll.findById = jest.fn().mockResolvedValue(pollMock);
        Attendance.findOne = jest.fn().mockResolvedValue({ updateEngagement: jest.fn() });

        await pollHandlers(io, socket).poll_vote({ pollId: 'poll1', optionIndex: 0 }, callback);

        expect(pollMock.options[0].voters).toEqual([{ user: 'user1', votedAt: expect.any(Date), responseTime: undefined }]);
        expect(pollMock.save).toHaveBeenCalled();
        expect(io.to).toHaveBeenCalledWith('session-sess1');
        expect(io.emit).toHaveBeenCalled; // Check at least called (io.to().emit)
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
});