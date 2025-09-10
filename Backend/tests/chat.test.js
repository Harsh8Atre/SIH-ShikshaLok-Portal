const chatHandlers = require('../socket/chatHandlers');
const { ChatMessage } = require('../models');

jest.mock('../models');

describe('Chat Socket Handlers', () => {
    let io;
    let socket;
    let callback;

    beforeEach(() => {
        io = { to: jest.fn().mockReturnThis(), emit: jest.fn() };
        socket = { userId: 'user1' };
        callback = jest.fn();
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('send_message', () => {
        it('should send a new chat message successfully', async() => {
            const mockSave = jest.fn().mockResolvedValue(true);
            const mockPopulate = jest.fn().mockResolvedValue({
                _id: 'msg1',
                message: 'Hello',
                sender: { name: 'User1', role: 'student' },
                session: 'sess1',
            });

            ChatMessage.prototype.save = mockSave;
            ChatMessage.prototype.populate = mockPopulate;

            await chatHandlers(io, socket).send_message({
                    sessionId: 'sess1',
                    message: 'Hello',
                    type: 'text',
                    isPrivate: false,
                },
                callback
            );

            expect(mockSave).toHaveBeenCalled();
            expect(io.to).toHaveBeenCalledWith('session-sess1');
            expect(io.emit).toHaveBeenCalledWith('chat_message', expect.any(Object));
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });

        it('should handle send message failure', async() => {
            ChatMessage.prototype.save = jest.fn().mockRejectedValue(new Error('DB error'));

            await chatHandlers(io, socket).send_message({ sessionId: 'sess1', message: 'Hello' },
                callback
            );

            expect(callback).toHaveBeenCalledWith(expect.objectContaining({ error: 'Failed to send message' }));
        });
    });

    describe('edit_message', () => {
        it('should edit message if sender matches', async() => {
            const mockMessage = {
                sender: 'user1',
                message: 'Old',
                save: jest.fn(),
                editedAt: null,
                originalMessage: null,
            };
            mockMessage.sender = {
                equals: (id) => id === 'user1',
            };

            ChatMessage.findById = jest.fn().mockResolvedValue(mockMessage);

            await chatHandlers(io, socket).edit_message({ messageId: 'msg1', newMessage: 'New' },
                callback
            );

            expect(mockMessage.message).toBe('New');
            expect(mockMessage.isEdited).toBe(true);
            expect(mockMessage.save).toHaveBeenCalled();
            expect(io.to).toHaveBeenCalled();
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });

        it('should reject edit if message not found', async() => {
            ChatMessage.findById = jest.fn().mockResolvedValue(null);

            await chatHandlers(io, socket).edit_message({ messageId: 'msg1', newMessage: 'New' }, callback);

            expect(callback).toHaveBeenCalledWith({ error: 'Message not found' });
        });

        it('should reject edit if user not sender', async() => {
            const mockMessage = {
                sender: {
                    equals: (id) => false,
                },
            };
            ChatMessage.findById = jest.fn().mockResolvedValue(mockMessage);

            await chatHandlers(io, socket).edit_message({ messageId: 'msg1', newMessage: 'New' }, callback);

            expect(callback).toHaveBeenCalledWith({ error: 'Permission denied' });
        });
    });

    describe('delete_message', () => {
        it('should delete message if sender matches', async() => {
            const mockMessage = {
                sender: {
                    equals: (id) => id === 'user1',
                },
                isDeleted: false,
                save: jest.fn(),
            };
            ChatMessage.findById = jest.fn().mockResolvedValue(mockMessage);

            await chatHandlers(io, socket).delete_message({ messageId: 'msg1' }, callback);

            expect(mockMessage.isDeleted).toBe(true);
            expect(mockMessage.save).toHaveBeenCalled();
            expect(io.to).toHaveBeenCalledWith('session-undefined'); // session not mocked here
            expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
        });

        it('should reject delete if message not found', async() => {
            ChatMessage.findById = jest.fn().mockResolvedValue(null);

            await chatHandlers(io, socket).delete_message({ messageId: 'msg1' }, callback);

            expect(callback).toHaveBeenCalledWith({ error: 'Message not found' });
        });

        it('should reject delete if user not sender', async() => {
            const mockMessage = {
                sender: { equals: () => false },
            };
            ChatMessage.findById = jest.fn().mockResolvedValue(mockMessage);

            await chatHandlers(io, socket).delete_message({ messageId: 'msg1' }, callback);

            expect(callback).toHaveBeenCalledWith({ error: 'Permission denied' });
        });
    });
});