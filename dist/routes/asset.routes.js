"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const asset_controller_1 = require("../controllers/asset.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
const validate_request_1 = require("../middleware/validate-request");
const router = (0, express_1.Router)();
// Apply auth middleware to all routes
router.use(auth_middleware_1.authenticate);
// Get all assets with pagination and search
router.get('/', [
    (0, express_validator_1.query)('page').optional().isInt({ min: 1 }).toInt(),
    (0, express_validator_1.query)('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    (0, express_validator_1.query)('search').optional().trim(),
    (0, express_validator_1.query)('customerId').optional().isInt().toInt(),
    (0, express_validator_1.query)('status').optional().trim(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), asset_controller_1.listAssets);
// Get asset by ID
router.get('/:id', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid asset ID'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), asset_controller_1.getAsset);
// Create a new asset
router.post('/', [
    (0, express_validator_1.body)('machineId').optional().trim(),
    (0, express_validator_1.body)('model').optional().trim(),
    (0, express_validator_1.body)('serialNo').optional().trim(),
    (0, express_validator_1.body)('purchaseDate').optional().isISO8601().withMessage('Invalid purchase date format'),
    (0, express_validator_1.body)('warrantyStart').optional().isISO8601().withMessage('Invalid warranty start date format'),
    (0, express_validator_1.body)('warrantyEnd').optional().isISO8601().withMessage('Invalid warranty end date format'),
    (0, express_validator_1.body)('amcStart').optional().isISO8601().withMessage('Invalid AMC start date format'),
    (0, express_validator_1.body)('amcEnd').optional().isISO8601().withMessage('Invalid AMC end date format'),
    (0, express_validator_1.body)('location').optional().trim(),
    (0, express_validator_1.body)('status').optional().isIn(['ACTIVE', 'MAINTENANCE', 'INACTIVE']).withMessage('Invalid status'),
    (0, express_validator_1.body)('customerId').isInt().toInt().withMessage('Valid customer ID is required'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'ZONE_USER']), asset_controller_1.createAsset);
// Update asset
router.put('/:id', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid asset ID'),
    (0, express_validator_1.body)('machineId').optional().trim().notEmpty().withMessage('Machine ID cannot be empty'),
    (0, express_validator_1.body)('model').optional().trim(),
    (0, express_validator_1.body)('serialNo').optional().trim(),
    (0, express_validator_1.body)('purchaseDate').optional().isISO8601().withMessage('Invalid purchase date format'),
    (0, express_validator_1.body)('warrantyStart').optional().isISO8601().withMessage('Invalid warranty start date format'),
    (0, express_validator_1.body)('warrantyEnd').optional().isISO8601().withMessage('Invalid warranty end date format'),
    (0, express_validator_1.body)('amcStart').optional().isISO8601().withMessage('Invalid AMC start date format'),
    (0, express_validator_1.body)('amcEnd').optional().isISO8601().withMessage('Invalid AMC end date format'),
    (0, express_validator_1.body)('location').optional().trim(),
    (0, express_validator_1.body)('status').optional().isIn(['ACTIVE', 'MAINTENANCE', 'INACTIVE']).withMessage('Invalid status'),
    (0, express_validator_1.body)('customerId').optional().isInt().toInt().withMessage('Valid customer ID is required'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'ZONE_USER']), asset_controller_1.updateAsset);
// Delete asset
router.delete('/:id', [
    (0, express_validator_1.param)('id').isInt().toInt().withMessage('Invalid asset ID'),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'ZONE_USER']), asset_controller_1.deleteAsset);
// Get asset statistics
router.get('/stats/overview', [
    (0, express_validator_1.query)('customerId').optional().isInt().toInt(),
    validate_request_1.validateRequest
], (0, auth_middleware_1.requireRole)(['ADMIN', 'SERVICE_PERSON', 'ZONE_USER']), asset_controller_1.getAssetStats);
exports.default = router;
