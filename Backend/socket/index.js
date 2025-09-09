const { Server } = require('socket.io');
const socketAuth = require('./auth');
const sessionHandlers = require('./sessionHandlers');
const chatHandlers = require('./chatHandlers');
const pollHandlers = require('./pollHandlers');
const monitoringHandlers = require('./monitoringHandlers');
const logger = require('../utils/logger');

function initializeSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : ['http://localhost:3000'],
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 30000,
  });

  io.use(socketAuth);

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} - User: ${socket.userId}`);

    sessionHandlers(io, socket);
    chatHandlers(io, socket);
    pollHandlers(io, socket);
    monitoringHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      logger.info(`Socket disconnected: ${socket.id} - Reason: ${reason}`);
    });
  });

  return io;
}

module.exports = { initializeSocket };
