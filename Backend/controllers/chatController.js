const { ChatMessage } = require('../models');
const logger = require('../utils/logger');

// Send a new chat message
exports.sendMessage = async (req, res, next) => {
  try {
    const { sessionId, message, type = 'text', isPrivate = false, targetUser } = req.body;

    const chatMessage = new ChatMessage({
      session: sessionId,
      sender: req.user.userId,
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

    logger.info('Chat message sent', {
      messageId: chatMessage._id,
      sessionId,
      sender: req.user.userId,
    });

    // Emit chat message to session room through socket.io
    req.app.get('io')?.to(`session-${sessionId}`).emit('chat_message', chatMessage);

    res.status(201).json({ message: 'Message sent successfully', chatMessage });
  } catch (error) {
    logger.error('Send message error:', error);
    next(error);
  }
};

// Edit a chat message
exports.editMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { newMessage } = req.body;

    const chatMessage = await ChatMessage.findById(messageId);
    if (!chatMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (!chatMessage.sender.equals(req.user.userId)) {
      return res.status(403).json({ error: 'Access denied', message: 'You can only edit your own messages' });
    }

    chatMessage.originalMessage = chatMessage.message;
    chatMessage.message = newMessage.trim();
    chatMessage.isEdited = true;
    chatMessage.editedAt = new Date();

    await chatMessage.save();

    logger.info('Chat message edited', { messageId, editedBy: req.user.userId });

    req.app.get('io')?.to(`session-${chatMessage.session}`).emit('chat_message_edited', chatMessage);

    res.json({ message: 'Message edited successfully', chatMessage });
  } catch (error) {
    logger.error('Edit message error:', error);
    next(error);
  }
};

// Delete (soft delete) a chat message
exports.deleteMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;

    const chatMessage = await ChatMessage.findById(messageId);
    if (!chatMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }

    if (!chatMessage.sender.equals(req.user.userId)) {
      // Optionally admins can delete any message; add check here if needed
      return res.status(403).json({ error: 'Access denied', message: 'You can only delete your own messages' });
    }

    chatMessage.isDeleted = true;
    chatMessage.deletedAt = new Date();
    chatMessage.deletedBy = req.user.userId;

    await chatMessage.save();

    logger.info('Chat message deleted', { messageId, deletedBy: req.user.userId });

    req.app.get('io')?.to(`session-${chatMessage.session}`).emit('chat_message_deleted', { messageId });

    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    logger.error('Delete message error:', error);
    next(error);
  }
};

// Add a reaction to a chat message
exports.addReaction = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;

    const chatMessage = await ChatMessage.findById(messageId);
    if (!chatMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }

    await chatMessage.addReaction(req.user.userId, emoji);

    logger.info('Reaction added to message', { messageId, emoji, userId: req.user.userId });

    req.app.get('io')?.to(`session-${chatMessage.session}`).emit('chat_reaction_added', { messageId, emoji, userId: req.user.userId });

    res.json({ message: 'Reaction added successfully' });
  } catch (error) {
    logger.error('Add reaction error:', error);
    next(error);
  }
};

// Remove a reaction from a chat message
exports.removeReaction = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { emoji } = req.body;

    const chatMessage = await ChatMessage.findById(messageId);
    if (!chatMessage) {
      return res.status(404).json({ error: 'Message not found' });
    }

    await chatMessage.removeReaction(req.user.userId, emoji);

    logger.info('Reaction removed from message', { messageId, emoji, userId: req.user.userId });

    req.app.get('io')?.to(`session-${chatMessage.session}`).emit('chat_reaction_removed', { messageId, emoji, userId: req.user.userId });

    res.json({ message: 'Reaction removed successfully' });
  } catch (error) {
    logger.error('Remove reaction error:', error);
    next(error);
  }
};

// Get chat history for a session
exports.getSessionHistory = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50, before } = req.query;

    const query = { session: sessionId, isDeleted: false };
    if (before) {
      query.timestamp = { $lt: new Date(before) };
    }

    const messages = await ChatMessage.find(query)
      .populate('sender', 'name role')
      .populate('targetUser', 'name')
      .populate('replyTo', 'message sender')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json({ messages });
  } catch (error) {
    logger.error('Get chat history error:', error);
    next(error);
  }
};
