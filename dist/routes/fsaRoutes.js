"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// routes/fsaRoutes.ts
const express_1 = __importDefault(require("express"));
const fsaController_1 = require("../controllers/fsaController");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
// All routes require authentication
router.use(auth_middleware_1.authenticate);
// Core FSA Dashboard routes
router.get('/', fsaController_1.getFSADashboard);
router.get('/dashboard', fsaController_1.getFSADashboard);
router.get('/zones/:zoneId', fsaController_1.getServiceZoneAnalytics);
router.get('/users/:userId/performance', fsaController_1.getUserPerformance);
router.get('/service-persons/:servicePersonId/performance', fsaController_1.getServicePersonPerformance);
// Advanced Analytics routes - Updated to match frontend expectations
router.get('/realtime', fsaController_1.getRealTimeMetrics);
router.get('/predictive', fsaController_1.getPredictiveAnalytics);
router.get('/performance/advanced', fsaController_1.getAdvancedPerformanceMetrics);
router.get('/equipment/analytics', fsaController_1.getEquipmentAnalytics);
router.get('/satisfaction', fsaController_1.getCustomerSatisfactionMetrics);
router.get('/optimization', fsaController_1.getResourceOptimization);
// Reporting routes
router.get('/reports', fsaController_1.getServiceReports);
router.get('/export/:format', fsaController_1.exportFSAData);
router.post('/export', fsaController_1.exportFSAData);
exports.default = router;
