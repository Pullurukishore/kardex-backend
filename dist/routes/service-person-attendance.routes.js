"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const servicePersonAttendanceController_1 = require("../controllers/servicePersonAttendanceController");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// All routes require SERVICE_PERSON authentication
router.use(auth_middleware_1.authenticate);
router.use((0, auth_middleware_1.requireRole)(['SERVICE_PERSON']));
// Get service person's own attendance records
router.get('/', servicePersonAttendanceController_1.servicePersonAttendanceController.getMyAttendance);
// Get service person's attendance statistics
router.get('/stats', servicePersonAttendanceController_1.servicePersonAttendanceController.getMyAttendanceStats);
// Get specific attendance record details
router.get('/:id', servicePersonAttendanceController_1.servicePersonAttendanceController.getMyAttendanceDetail);
exports.default = router;
