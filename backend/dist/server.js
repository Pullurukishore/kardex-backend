"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Load environment variables first, before any other imports
require("dotenv/config");
const http_1 = require("http");
const ws_1 = require("ws");
const app_1 = require("./app");
const prisma_1 = require("./lib/prisma");
const logger_1 = require("./utils/logger");
const websocket_service_1 = require("./services/websocket.service");
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;
// Create HTTP server
const server = (0, http_1.createServer)(app_1.app);
// Create WebSocket server
const wss = new ws_1.WebSocketServer({
    server,
    path: '/api/notifications/ws'
});
// Handle WebSocket connections
wss.on('connection', (ws, req) => {
    // Safe type conversion
    const customWs = ws;
    // Initialize custom properties
    customWs.isAlive = true;
    // Extract user ID from the auth token in the query params
    const token = new URLSearchParams(req.url?.split('?')[1] || '').get('token');
    const userId = token || '1'; // Replace with actual JWT verification
    if (!userId) {
        logger_1.logger.warn('WebSocket connection attempt without userId');
        ws.close(4001, 'User ID is required');
        return;
    }
    customWs.userId = userId;
    websocket_service_1.webSocketService.addClient(userId, customWs);
    logger_1.logger.info(`New WebSocket connection: ${userId}`);
    // Handle pong messages
    customWs.on('pong', () => {
        customWs.isAlive = true;
    });
    // Handle messages
    customWs.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            switch (data.type) {
                case 'PING':
                    customWs.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
                    break;
                default:
                    logger_1.logger.warn(`Unknown message type: ${data.type}`);
            }
        }
        catch (error) {
            logger_1.logger.error('Error processing WebSocket message:', error);
        }
    });
    // Handle close
    customWs.on('close', () => {
        if (customWs.userId) {
            websocket_service_1.webSocketService.removeClient(customWs.userId);
        }
        logger_1.logger.info(`WebSocket connection closed: ${customWs.userId || 'unknown'}`);
    });
    // Handle errors
    customWs.on('error', (error) => {
        logger_1.logger.error('WebSocket error:', error);
        if (customWs.userId) {
            websocket_service_1.webSocketService.removeClient(customWs.userId);
        }
    });
});
// Ping interval
const interval = setInterval(() => {
    wss.clients.forEach((client) => {
        const customClient = client;
        if (!customClient.isAlive) {
            customClient.terminate();
            return;
        }
        customClient.isAlive = false;
        customClient.ping();
    });
}, 30000);
// Cleanup on server close
wss.on('close', () => {
    clearInterval(interval);
});
// Shutdown handler
const shutdown = () => {
    logger_1.logger.info('Shutting down server...');
    wss.clients.forEach(client => {
        client.close(1001, 'Server shutting down');
    });
    server.close(() => {
        websocket_service_1.webSocketService.cleanup();
        prisma_1.prisma.$disconnect()
            .then(() => process.exit(0))
            .catch((error) => {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger_1.logger.error('Error closing database:', errorMessage);
            process.exit(1);
        });
    });
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
// Start server
const startServer = async () => {
    try {
        await prisma_1.prisma.$connect();
        server.listen(PORT, () => {
            logger_1.logger.info(`Server running on port ${PORT}`);
        });
    }
    catch (error) {
        logger_1.logger.error('Server startup failed:', error);
        process.exit(1);
    }
};
startServer();
