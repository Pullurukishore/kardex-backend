import express from 'express';
import path from 'path';
import http from 'http';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { WebSocket as BaseWebSocket, WebSocketServer } from 'ws';
import { Request, Response, NextFunction } from 'express-serve-static-core';
import customerRoutes from './routes/customer.routes';
import contactAdminRoutes from './routes/contact-admin.routes';
import assetRoutes from './routes/asset.routes';
import serviceZoneRoutes from './routes/serviceZone.routes';
import dashboardRoutes from './routes/dashboard.routes';
import ticketRoutes from './routes/ticket.routes';
import servicePersonRoutes from './routes/servicePerson.routes';
import zoneUserRoutes from './routes/zoneUser.routes';
import zoneRoutes from './routes/zone.routes';
import zoneDashboardRoutes from './routes/zone-dashboard.routes';
import zoneReportRoutes from './routes/zone-report.routes';
import authRoutes from './routes/auth.routes';
import reportsRoutes from './routes/reports.routes';
import fsaRoutes from './routes/fsaRoutes';
import adminRoutes from './routes/admin.routes';
import whatsappRoutes from './routes/whatsapp.routes';
import ratingRoutes from './routes/rating.routes';
import onsiteVisitRoutes from './routes/onsite-visit.routes';
import attendanceRoutes from './routes/attendanceRoutes';
import activityRoutes from './routes/activityRoutes';
import adminAttendanceRoutes from './routes/admin-attendance.routes';
import zoneAttendanceRoutes from './routes/zone-attendance.routes';
import servicePersonReportsRoutes from './routes/service-person-reports.routes';
import servicePersonAttendanceRoutes from './routes/service-person-attendance.routes';
import notificationRoutes from './routes/notification.routes';

const app = express();
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ 
  server: server as any, 
  path: '/api/notifications/ws' 
});

// Extend WebSocket type to include userId
export interface CustomWebSocket extends BaseWebSocket {
  userId?: string;
  isAlive: boolean;
}

// Handle WebSocket connections
wss.on('connection', (ws: BaseWebSocket) => {
  const customWs = ws as CustomWebSocket;
  // Set initial alive state
  customWs.isAlive = true;
  
  // Handle ping/pong for connection keep-alive
  customWs.on('pong', () => {
    customWs.isAlive = true;
  });
  
  // Handle WebSocket close
  customWs.on('close', () => {
    console.log('Client disconnected');
  });
  
  // Handle errors
  customWs.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Keep-alive interval
const interval = setInterval(() => {
  wss.clients.forEach((client) => {
    const ws = client as CustomWebSocket;
    if (ws.isAlive === false) return ws.terminate();
    
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Clean up on server close
wss.on('close', () => {
  clearInterval(interval);
});

// CORS Configuration
const corsOptions: cors.CorsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, origin?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      // Add other allowed origins as needed
    ];
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Required for cookies, authorization headers with HTTPS
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'X-Access-Token',
    'X-Refresh-Token',
  ],
  exposedHeaders: [
    'Content-Range',
    'X-Content-Range',
    'X-Access-Token',
    'X-Refresh-Token',
  ],
  maxAge: 86400, // 24 hours
};

// Enable CORS with options
app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Parse JSON bodies
app.use(express.json());

// Parse cookies
app.use(cookieParser());

// serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/contacts', contactAdminRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/service-zones', serviceZoneRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/service-persons', servicePersonRoutes);
app.use('/api/zone-users', zoneUserRoutes);
app.use('/api/zone', zoneRoutes);
app.use('/api/zone-dashboard', zoneDashboardRoutes);
app.use('/api/zone-reports', zoneReportRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/fsa', fsaRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/ratings', ratingRoutes);
app.use('/api/onsite-visits', onsiteVisitRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/activities', activityRoutes);
app.use('/api/admin/attendance', adminAttendanceRoutes);
app.use('/api/zone/attendance', zoneAttendanceRoutes);
app.use('/api/admin/service-person-reports', servicePersonReportsRoutes);
app.use('/api/service-person-reports', servicePersonReportsRoutes);
app.use('/api/service-person/attendance', servicePersonAttendanceRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    return next(err);
  }
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { details: err.message })
  });
});

// Export both the Express app and HTTP server
export { app, server };
