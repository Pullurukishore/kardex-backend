import express from 'express';
import { servicePersonReportsController } from '../controllers/servicePersonReportsController';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Get comprehensive service person reports
router.get('/', servicePersonReportsController.getServicePersonReports);

// Get summary statistics for reports dashboard
router.get('/summary', servicePersonReportsController.getReportsSummary);

// Get service persons list for filter dropdown
router.get('/service-persons', servicePersonReportsController.getServicePersons);

// Get service zones for filter dropdown
router.get('/service-zones', servicePersonReportsController.getServiceZones);

// Export service person reports as CSV
router.get('/export', servicePersonReportsController.exportReports);

// Get detailed activity logs for a specific service person and date
router.get('/activity-details/:servicePersonId/:date', servicePersonReportsController.getActivityDetails);

export default router;
