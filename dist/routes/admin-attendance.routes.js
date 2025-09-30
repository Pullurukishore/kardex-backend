"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const adminAttendanceController_1 = require("../controllers/adminAttendanceController");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
// Apply authentication middleware to all routes
router.use(auth_middleware_1.authenticate);
// Get all attendance records with filtering
router.get('/', adminAttendanceController_1.adminAttendanceController.getAllAttendance);
// Get attendance statistics
router.get('/stats', adminAttendanceController_1.adminAttendanceController.getAttendanceStats);
// Get service persons list for filters
router.get('/service-persons', adminAttendanceController_1.adminAttendanceController.getServicePersons);
// Get service zones list for filters
router.get('/service-zones', adminAttendanceController_1.adminAttendanceController.getServiceZones);
// Export attendance data as CSV
router.get('/export', adminAttendanceController_1.adminAttendanceController.exportAttendance);
// Get detailed attendance record
router.get('/:id', adminAttendanceController_1.adminAttendanceController.getAttendanceDetail);
// Update attendance record (admin only)
router.put('/:id', adminAttendanceController_1.adminAttendanceController.updateAttendance);
// Add manual activity log to attendance (admin only)
router.post('/:attendanceId/activities', adminAttendanceController_1.adminAttendanceController.addActivityLog);
exports.default = router;
