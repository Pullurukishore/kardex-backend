"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zoneUser_controller_1 = require("../controllers/zoneUser.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_request_1 = require("../middleware/validate-request");
const express_validator_1 = require("express-validator");
const db_1 = __importDefault(require("../config/db"));
const router = (0, express_1.Router)();
router.use(auth_middleware_1.authenticate);
// Create a new zone user with zone assignments
router.post('/create-with-zones', [
    (0, express_validator_1.body)('name').trim().notEmpty().withMessage('Name is required'),
    (0, express_validator_1.body)('email').isEmail().withMessage('Please provide a valid email'),
    (0, express_validator_1.body)('phone').optional().isMobilePhone('any').withMessage('Please provide a valid phone number'),
    (0, express_validator_1.body)('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    (0, express_validator_1.body)('serviceZoneIds')
        .isArray({ min: 1 })
        .withMessage('At least one service zone is required'),
    (0, express_validator_1.body)('serviceZoneIds.*').isInt().withMessage('Invalid service zone ID'),
    (0, express_validator_1.body)('isActive').optional().isBoolean(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN']), zoneUser_controller_1.createZoneUserWithZones);
// Get all zone users with pagination and search
router.get('/', [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    (0, express_validator_1.query)('search').optional().trim(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN']), zoneUser_controller_1.listZoneUsers);
// Get all zone users (simplified for dropdowns)
router.get('/zone-users', [
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), async (req, res) => {
    try {
        const users = await db_1.default.user.findMany({
            where: {
                role: 'ZONE_USER',
                isActive: true
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true
            },
            orderBy: {
                name: 'asc'
            }
        });
        res.json(users);
    }
    catch (error) {
        console.error('Error fetching zone users:', error);
        res.status(500).json({ error: 'Failed to fetch zone users' });
    }
});
// Get all users available for zone assignment
router.get('/available', [
    (0, express_validator_1.query)('search').optional().trim(),
    (0, express_validator_1.query)('role').optional().isIn(['ADMIN', 'SERVICE_PERSON', 'CUSTOMER']),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN']), zoneUser_controller_1.getAllUsersForZoneAssignment);
// Get a specific zone user
router.get('/:id', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid user ID'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN']), zoneUser_controller_1.getZoneUser);
// Assign user to zones (create new assignment)
router.post('/', [
    (0, express_validator_1.body)('userId').isInt().withMessage('Valid user ID is required'),
    (0, express_validator_1.body)('serviceZoneIds').optional().isArray().withMessage('serviceZoneIds must be an array'),
    (0, express_validator_1.body)('serviceZoneIds.*').optional().isInt().withMessage('Each service zone ID must be an integer'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN']), zoneUser_controller_1.assignUserToZones);
// Update zone assignments for a user
router.put('/:id', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid user ID'),
    (0, express_validator_1.body)('serviceZoneIds').optional().isArray().withMessage('serviceZoneIds must be an array'),
    (0, express_validator_1.body)('serviceZoneIds.*').optional().isInt().withMessage('Each service zone ID must be an integer'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN']), zoneUser_controller_1.updateZoneUserAssignments);
// Remove all zone assignments for a user
router.delete('/:id', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid user ID'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN']), zoneUser_controller_1.deleteZoneUser);
exports.default = router;
