import express from 'express';
import { zoneAttendanceController } from '../controllers/zoneAttendanceController';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Get all attendance records for current zone with filtering
router.get('/', zoneAttendanceController.getAllAttendance);

// Get attendance statistics for current zone
router.get('/stats', zoneAttendanceController.getAttendanceStats);

// Get service persons list for filters (zone-specific)
router.get('/service-persons', zoneAttendanceController.getServicePersons);

// Get service zones list for current user's zone
router.get('/service-zones', zoneAttendanceController.getServiceZones);

// Export attendance data as CSV (zone-specific)
router.get('/export', zoneAttendanceController.exportAttendance);

export default router;
