"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const activityController_1 = require("../controllers/activityController");
const auth_middleware_1 = require("../middleware/auth.middleware");
const router = (0, express_1.Router)();
// All activity routes require authentication
router.use(auth_middleware_1.authenticate);
// Create activity
router.post('/', (0, auth_middleware_1.requireRole)(['SERVICE_PERSON']), activityController_1.activityController.createActivity);
// Update activity
router.put('/:id', (0, auth_middleware_1.requireRole)(['SERVICE_PERSON']), activityController_1.activityController.updateActivity);
// Get activities
router.get('/', (0, auth_middleware_1.requireRole)(['SERVICE_PERSON']), activityController_1.activityController.getActivities);
// Get activity statistics
router.get('/stats', (0, auth_middleware_1.requireRole)(['SERVICE_PERSON']), activityController_1.activityController.getActivityStats);
exports.default = router;
