"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.healthCheck = void 0;
const db_1 = __importDefault(require("../config/db"));
const healthCheck = async (req, res) => {
    const startTime = Date.now();
    try {
        // Test database connection
        const dbStart = Date.now();
        await db_1.default.$queryRaw `SELECT 1`;
        const dbTime = Date.now() - dbStart;
        // Get basic stats
        const customerCount = await db_1.default.customer.count();
        const totalTime = Date.now() - startTime;
        console.log(`🏥 [HEALTH] Health check completed in ${totalTime}ms (DB: ${dbTime}ms)`);
        res.json({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            database: {
                connected: true,
                responseTime: `${dbTime}ms`
            },
            stats: {
                customers: customerCount
            },
            responseTime: `${totalTime}ms`
        });
    }
    catch (error) {
        const totalTime = Date.now() - startTime;
        console.error(`❌ [HEALTH] Health check failed after ${totalTime}ms:`, error);
        res.status(500).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Database connection failed',
            responseTime: `${totalTime}ms`
        });
    }
};
exports.healthCheck = healthCheck;
