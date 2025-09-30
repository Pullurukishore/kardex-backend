"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const servicePersonReportsController_1 = require("../controllers/servicePersonReportsController");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = express_1.default.Router();
// Apply authentication middleware to all routes
router.use(auth_middleware_1.authenticate);
// Get comprehensive service person reports
router.get('/', servicePersonReportsController_1.servicePersonReportsController.getServicePersonReports);
// Get summary statistics for reports dashboard
router.get('/summary', servicePersonReportsController_1.servicePersonReportsController.getReportsSummary);
// Get service persons list for filter dropdown
router.get('/service-persons', servicePersonReportsController_1.servicePersonReportsController.getServicePersons);
// Get service zones for filter dropdown
router.get('/service-zones', servicePersonReportsController_1.servicePersonReportsController.getServiceZones);
// Export service person reports as CSV
router.get('/export', servicePersonReportsController_1.servicePersonReportsController.exportServicePersonReports);
// Get detailed activity logs for a specific service person and date
router.get('/activity-details/:servicePersonId/:date', servicePersonReportsController_1.servicePersonReportsController.getActivityDetails);
exports.default = router;
