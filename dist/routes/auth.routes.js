"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_validator_1 = require("express-validator");
const auth_controller_1 = require("../controllers/auth.controller");
const auth_middleware_1 = require("../middleware/auth.middleware");
// Type guard for UserRole
const isUserRole = (value) => {
    return typeof value === 'string' &&
        (value === 'ADMIN' ||
            value === 'ZONE_USER' ||
            value === 'SERVICE_PERSON' ||
            value === 'CUSTOMER_OWNER');
};
// Role validation middleware
const validateRole = (value) => {
    if (!isUserRole(value)) {
        throw new Error('Invalid role');
    }
    return true;
};
// Helper function to validate request
const validateRequest = (validations) => {
    return async (req, res, next) => {
        await Promise.all(validations.map((validation) => validation.run(req)));
        const errors = (0, express_validator_1.validationResult)(req);
        if (errors.isEmpty()) {
            return next();
        }
        return res.status(400).json({ errors: errors.array() });
    };
};
const router = (0, express_1.Router)();
// Register route
router.post('/register', validateRequest([
    (0, express_validator_1.body)('email').isEmail().normalizeEmail(),
    (0, express_validator_1.body)('password').isLength({ min: 8 }),
    (0, express_validator_1.body)('role').custom(validateRole),
    (0, express_validator_1.body)('customerId').optional().isInt(),
    (0, express_validator_1.body)('phone').optional().isMobilePhone('any'),
    (0, express_validator_1.body)('name').optional().isString().trim()
]), auth_controller_1.register);
// Login route
router.post('/login', validateRequest([
    (0, express_validator_1.body)('email').isEmail().normalizeEmail(),
    (0, express_validator_1.body)('password').notEmpty()
]), auth_controller_1.login);
// Request OTP route (placeholder for future implementation)
router.post('/request-otp', validateRequest([
    (0, express_validator_1.body)('email').isEmail().normalizeEmail()
]), (req, res) => {
    return res.status(501).json({ message: 'OTP functionality not yet implemented' });
});
// Login with OTP route (placeholder for future implementation)
router.post('/login-with-otp', validateRequest([
    (0, express_validator_1.body)('email').isEmail().normalizeEmail(),
    (0, express_validator_1.body)('otp').isLength({ min: 6, max: 6 })
]), (req, res) => {
    return res.status(501).json({ message: 'OTP login not yet implemented' });
});
// Protected routes - require authentication
router.get('/me', auth_middleware_1.authenticate, (req, res, next) => {
    const authReq = req;
    return (0, auth_controller_1.getCurrentUser)(authReq, res).catch(next);
});
router.post('/logout', auth_middleware_1.authenticate, (req, res, next) => {
    const authReq = req;
    return (0, auth_controller_1.logout)(authReq, res).catch(next);
});
// Refresh token route (no authentication required)
router.post('/refresh-token', (req, res, next) => {
    return (0, auth_controller_1.refreshToken)(req, res).catch(next);
});
exports.default = router;
