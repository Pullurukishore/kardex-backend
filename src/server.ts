// Load environment variables first, before any other imports
import 'dotenv/config';

import { createServer, Server as HttpServer, IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { app } from './app';
import { prisma } from './lib/prisma';
import { logger } from './utils/logger';
import { CustomWebSocket } from './types/custom';
import { cronService } from './services/cron.service';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

// Create HTTP server
const server: HttpServer = createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ 
  server, 
  path: '/api/notifications/ws' 
});

// Handle WebSocket connections
wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
  // Safe type conversion
  const customWs = ws as unknown as CustomWebSocket;
  
  // Initialize custom properties
  customWs.isAlive = true;
  
  // Extract user ID from the auth token in the query params
  const token = new URLSearchParams(req.url?.split('?')[1] || '').get('token');
  const userId = token || '1'; // Replace with actual JWT verification
  
  if (!userId) {
    logger.warn('WebSocket connection attempt without userId');
    ws.close(4001, 'User ID is required');
    return;
  }
  
  customWs.userId = userId;
  
  logger.info(`New WebSocket connection: ${userId}`);
  
  // Handle pong messages
  customWs.on('pong', () => {
    customWs.isAlive = true;
  });
  
  // Handle messages
  customWs.on('message', (message: string) => {
    try {
      const data = JSON.parse(message);
      switch (data.type) {
        case 'PING':
          customWs.send(JSON.stringify({ type: 'PONG', timestamp: Date.now() }));
          break;
        default:
          logger.warn(`Unknown message type: ${data.type}`);
      }
    } catch (error) {
      logger.error('Error processing WebSocket message:', error);
    }
  });
  
  // Handle close
  customWs.on('close', () => {
    if (customWs.userId) {
      // Cleanup logic can go here if needed
    }
    logger.info(`WebSocket connection closed: ${customWs.userId || 'unknown'}`);
  });
});

// Ping interval
const interval = setInterval(() => {
  wss.clients.forEach((client) => {
    const customClient = client as unknown as CustomWebSocket;
    
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
  logger.info('Shutting down server...');
  
  wss.clients.forEach(client => {
    client.close(1001, 'Server shutting down');
  });
  
  server.close(() => {
    
    prisma.$disconnect()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error('Error closing database:', errorMessage);
        process.exit(1);
      });
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
const startServer = async () => {
  try {
    await prisma.$connect();
    
    // Start cron jobs
    cronService.startAutoCheckoutJob();
    logger.info('Cron jobs initialized');
    
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Server startup failed:', error);
    process.exit(1);
  }
};

startServer();