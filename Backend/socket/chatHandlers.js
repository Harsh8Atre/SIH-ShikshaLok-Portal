const { ChatMessage } = require('../models');
const logger = require('../utils/logger');

module.exports = (io, socket) => {
  // Handle sending a chat message
  socket.on('send_message', async (data, callback) => {
    try {
      const { sessionId, message, type = 'text', isPrivate = false, targetUser } = data;

      const chatMessage = new ChatMessage({
        session: sessionId,
        sender: socket.userId,
        message: message.trim(),
        type,
        isPrivate,
        targetUser: isPrivate ? targetUser : null,
        status: 'sent',
      });

      await chatMessage.save();

      await chatMessage.populate('sender', 'name role');
      if (isPrivate && targetUser) {
        await chatMessage.populate('targetUser', 'name');
      }

      io.to(`session-${sessionId}`).emit('chat_message', chatMessage);

      logger.info('Chat message sent', { messageId: chatMessage._id, sessionId, sender: socket.userId });

      callback({ success: true, message: 'Message sent', chatMessage });
    } catch (error) {
      logger.error('Chat send_message error:', error);
      callback({ error: 'Failed to send message' });
    }
  });

  // Handle editing a chat message
  socket.on('edit_message', async (data, callback) => {
    try {
      const { messageId, newMessage } = data;

      const chatMessage = await ChatMessage.findById(messageId);
      if (!chatMessage) return callback({ error: 'Message not found' });
      if (!chatMessage.sender.equals(socket.userId)) return callback({ error: 'Permission denied' });

      chatMessage.originalMessage = chatMessage.message;
      chatMessage.message = newMessage.trim();
      chatMessage.isEdited = true;
      chatMessage.editedAt = new Date();

      await chatMessage.save();

      io.to(`session-${chatMessage.session}`).emit('chat_message_edited', chatMessage);

      logger.info('Chat message edited', { messageId, editor: socket.userId });

      callback({ success: true, message: 'Message edited', chatMessage });
    } catch (error) {
      logger.error('Chat edit_message error:', error);
      callback({ error: 'Failed to edit message' });
    }
  });

  // Handle deleting a chat message
  socket.on('delete_message', async (data, callback) => {
    try {
      const { messageId } = data;

      const chatMessage = await ChatMessage.findById(messageId);
      if (!chatMessage) return callback({ error: 'Message not found' });
      if (!chatMessage.sender.equals(socket.userId)) return callback({ error: 'Permission denied' });

      chatMessage.isDeleted = true;
      chatMessage.deletedAt = new Date();
      chatMessage.deletedBy = socket.userId;

      await chatMessage.save();

      io.to(`session-${chatMessage.session}`).emit('chat_message_deleted', { messageId });

      logger.info('Chat message deleted', { messageId, deleter: socket.userId });

      callback({ success: true, message: 'Message deleted' });
    } catch (error) {
      logger.error('Chat delete_message error:', error);
      callback({ error: 'Failed to delete message' });
    }
  });

  // Handle adding a reaction
  socket.on('add_reaction', async (data, callback) => {
    try {
      const { messageId, emoji } = data;

      const chatMessage = await ChatMessage.findById(messageId);
      if (!chatMessage) return callback({ error: 'Message not found' });

      await chatMessage.addReaction(socket.userId, emoji);

      io.to(`session-${chatMessage.session}`).emit('chat_reaction_added', {
        messageId,
        emoji,
        userId: socket.userId,
      });

      logger.info('Chat reaction added', { messageId, emoji, userId: socket.userId });

      callback({ success: true, message: 'Reaction added' });
    } catch (error) {
      logger.error('Chat add_reaction error:', error);
      callback({ error: 'Failed to add reaction' });
    }
  });

  // Handle removing a reaction
  socket.on('remove_reaction', async (data, callback) => {
    try {
      const { messageId, emoji } = data;

      const chatMessage = await ChatMessage.findById(messageId);
      if (!chatMessage) return callback({ error: 'Message not found' });

      await chatMessage.removeReaction(socket.userId, emoji);

      io.to(`session-${chatMessage.session}`).emit('chat_reaction_removed', {
        messageId,
        emoji,
        userId: socket.userId,
      });

      logger.info('Chat reaction removed', { messageId, emoji, userId: socket.userId });

      callback({ success: true, message: 'Reaction removed' });
    } catch (error) {
      logger.error('Chat remove_reaction error:', error);
      callback({ error: 'Failed to remove reaction' });
    }
  });
};
