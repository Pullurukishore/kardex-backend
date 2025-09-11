// routes/fsaRoutes.ts
import express from 'express';
import {
  getFSADashboard,
  getServiceZoneAnalytics,
  getUserPerformance,
  getServicePersonPerformance,
  getRealTimeMetrics,
  getPredictiveAnalytics,
  getAdvancedPerformanceMetrics,
  getEquipmentAnalytics,
  getCustomerSatisfactionMetrics,
  getResourceOptimization,
  getServiceReports,
  exportFSAData
} from '../controllers/fsaController';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// Core FSA Dashboard routes
router.get('/dashboard', getFSADashboard);
router.get('/zones/:zoneId', getServiceZoneAnalytics);
router.get('/users/:userId/performance', getUserPerformance);
router.get('/service-persons/:servicePersonId/performance', getServicePersonPerformance);

// Advanced Analytics routes
router.get('/real-time-metrics', getRealTimeMetrics);
router.get('/predictive-analytics', getPredictiveAnalytics);
router.get('/performance-metrics', getAdvancedPerformanceMetrics);
router.get('/equipment-analytics', getEquipmentAnalytics);
router.get('/customer-satisfaction', getCustomerSatisfactionMetrics);
router.get('/resource-optimization', getResourceOptimization);

// Reporting routes
router.get('/reports', getServiceReports);
router.get('/export/:format', exportFSAData);

export default router;