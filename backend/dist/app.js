"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = exports.app = void 0;
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const http_1 = __importDefault(require("http"));
const cors_1 = __importDefault(require("cors"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const ws_1 = require("ws");
const websocket_service_1 = require("./services/websocket.service");
const customer_routes_1 = __importDefault(require("./routes/customer.routes"));
const contact_admin_routes_1 = __importDefault(require("./routes/contact-admin.routes"));
const asset_routes_1 = __importDefault(require("./routes/asset.routes"));
const serviceZone_routes_1 = __importDefault(require("./routes/serviceZone.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const ticket_routes_1 = __importDefault(require("./routes/ticket.routes"));
const analytics_routes_1 = __importDefault(require("./routes/analytics.routes"));
const reports_routes_1 = __importDefault(require("./routes/reports.routes"));
const notification_routes_1 = require("./routes/notification.routes");
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const app = (0, express_1.default)();
exports.app = app;
const server = http_1.default.createServer(app);
exports.server = server;
// Create WebSocket server
const wss = new ws_1.WebSocketServer({
    server: server,
    path: '/api/notifications/ws'
});
// Handle WebSocket connections
wss.on('connection', (ws) => {
    const customWs = ws;
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
        const ws = client;
        if (ws.isAlive === false)
            return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);
// Clean up on server close
wss.on('close', () => {
    clearInterval(interval);
});
// CORS Configuration
const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin)
            return callback(null, true);
        const allowedOrigins = [
            'http://localhost:3000',
            'http://localhost:3001',
            // Add other allowed origins as needed
        ];
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        }
        else {
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
app.use((0, cors_1.default)(corsOptions));
// Handle preflight requests
app.options('*', (0, cors_1.default)(corsOptions));
// Parse JSON bodies
app.use(express_1.default.json());
// Parse cookies
app.use((0, cookie_parser_1.default)());
// serve uploaded files
app.use('/uploads', express_1.default.static(path_1.default.join(process.cwd(), process.env.UPLOAD_DIR || 'uploads')));
// API Routes
app.use('/api/auth', auth_routes_1.default);
app.use('/api/customers', customer_routes_1.default);
app.use('/api/contacts', contact_admin_routes_1.default);
app.use('/api/assets', asset_routes_1.default);
app.use('/api/tickets', ticket_routes_1.default);
app.use('/api/service-zones', serviceZone_routes_1.default);
app.use('/api/analytics', analytics_routes_1.default);
app.use('/api/dashboard', dashboard_routes_1.default);
app.use('/api/reports', reports_routes_1.default);
app.use('/api/notifications', notification_routes_1.notificationRoutes);
// Set up WebSocket server for notifications
(0, notification_routes_1.setupNotificationWebSocket)(wss);
// Set up WebSocket server for the application
(0, websocket_service_1.setupWebSocketServer)(server);
// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});
// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});
// Error handling middleware
app.use((err, req, res, next) => {
    if (res.headersSent) {
        return next(err);
    }
    console.error(err.stack);
    res.status(500).json({
        error: 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { details: err.message })
    });
});
