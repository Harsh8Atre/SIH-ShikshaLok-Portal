const { Notification } = require('../models');
const logger = require('../utils/logger');

// Create a notification for a user or group
async function createNotification(data) {
    try {
        const notification = new Notification(data);

        // Set scheduled time and expiry if not provided
        if (!notification.scheduledFor) {
            notification.scheduledFor = new Date();
        }
        if (!notification.expiresAt) {
            const expiry = new Date();
            expiry.setDate(expiry.getDate() + 30); // Default expiry is 30 days
            notification.expiresAt = expiry;
        }

        await notification.save();

        logger.info('Notification created', {
            id: notification._id,
            recipient: notification.recipient,
            type: notification.type,
            title: notification.title
        });

        return notification;
    } catch (err) {
        logger.error('Notification creation error:', err);
        throw err;
    }
}

// Fetch notifications for a specific user
async function getUserNotifications(userId, options = {}) {
    const {
        limit = 50,
            skip = 0,
            unreadOnly = false,
            types = null
    } = options;

    const query = { recipient: userId };
    if (unreadOnly) query.isRead = false;
    if (types && Array.isArray(types) && types.length > 0) {
        query.type = { $in: types };
    }

    const notifications = await Notification.find(query)
        .populate('sender', 'name role')
        .populate('data.sessionId', 'title subject')
        .populate('data.userId', 'name')
        .sort({ createdAt: -1 })
        .limit(Number(limit))
        .skip(Number(skip));

    return notifications;
}

// Mark a notification as read for a particular user
async function markAsRead(notificationId, userId) {
    const notification = await Notification.findOne({ _id: notificationId, recipient: userId });
    if (!notification) throw new Error('Notification not found');

    notification.isRead = true;
    notification.readAt = new Date();
    await notification.save();

    logger.info('Notification marked as read', { notificationId, userId });
    return notification;
}

// Mark notification as delivered for a channel/device if required
async function markAsDelivered(notificationId, userId, channel) {
    const notification = await Notification.findOne({ _id: notificationId, recipient: userId });
    if (!notification) throw new Error('Notification not found');

    if (notification.deliveryStatus[channel]) {
        notification.deliveryStatus[channel].delivered = true;
        notification.deliveryStatus[channel].deliveredAt = new Date();
    }
    await notification.save();

    logger.info('Notification marked as delivered', { notificationId, channel });
    return notification;
}

module.exports = {
    createNotification,
    getUserNotifications,
    markAsRead,
    markAsDelivered
};