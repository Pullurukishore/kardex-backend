"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const zoneAttendanceController_1 = require("../controllers/zoneAttendanceController");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
// Apply authentication middleware to all routes
router.use(auth_middleware_1.authenticate);
// Get all attendance records for current zone with filtering
router.get('/', zoneAttendanceController_1.zoneAttendanceController.getAllAttendance);
// Get attendance statistics for current zone
router.get('/stats', zoneAttendanceController_1.zoneAttendanceController.getAttendanceStats);
// Get service persons list for filters (zone-specific)
router.get('/service-persons', zoneAttendanceController_1.zoneAttendanceController.getServicePersons);
// Get service zones list for current user's zone
router.get('/service-zones', zoneAttendanceController_1.zoneAttendanceController.getServiceZones);
// Export attendance data as CSV (zone-specific)
router.get('/export', zoneAttendanceController_1.zoneAttendanceController.exportAttendance);
exports.default = router;
