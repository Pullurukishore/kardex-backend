import express from 'express';
import { adminAttendanceController } from '../controllers/adminAttendanceController';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Get all attendance records with filtering
router.get('/', adminAttendanceController.getAllAttendance);

// Get attendance statistics
router.get('/stats', adminAttendanceController.getAttendanceStats);

// Get service persons list for filters
router.get('/service-persons', adminAttendanceController.getServicePersons);

// Get service zones list for filters
router.get('/service-zones', adminAttendanceController.getServiceZones);

// Export attendance data as CSV
router.get('/export', adminAttendanceController.exportAttendance);

// Get detailed attendance record
router.get('/:id', adminAttendanceController.getAttendanceDetail);

// Update attendance record (admin only)
router.put('/:id', adminAttendanceController.updateAttendance);

// Add manual activity log to attendance (admin only)
router.post('/:attendanceId/activities', adminAttendanceController.addActivityLog);

export default router;
