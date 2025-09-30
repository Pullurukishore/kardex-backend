"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/routes/reports.routes.ts
const express_1 = __importDefault(require("express"));
const reports_controller_1 = require("../controllers/reports.controller");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
// Generate reports (Admin only)
router.get('/general', (0, auth_1.authMiddleware)(['ADMIN']), reports_controller_1.generateReport);
router.get('/generate', (0, auth_1.authMiddleware)(['ADMIN']), reports_controller_1.generateReport);
// Export reports (Admin only)
router.get('/general/export', (0, auth_1.authMiddleware)(['ADMIN']), reports_controller_1.exportReport);
router.get('/export', (0, auth_1.authMiddleware)(['ADMIN']), reports_controller_1.exportReport);
router.post('/export', (0, auth_1.authMiddleware)(['ADMIN']), reports_controller_1.exportReport);
// Generate zone reports (Zone users and service persons)
router.get('/zone', (0, auth_1.authMiddleware)(['ZONE_USER', 'SERVICE_PERSON', 'ADMIN']), reports_controller_1.generateZoneReport);
// Export zone reports (Zone users and service persons)
router.get('/zone/export', (0, auth_1.authMiddleware)(['ZONE_USER', 'SERVICE_PERSON', 'ADMIN']), reports_controller_1.exportZoneReport);
exports.default = router;
