"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = exports.validateRequest = void 0;
const express_validator_1 = require("express-validator");
const validateRequest = (validations) => {
    return async (req, res, next) => {
        await Promise.all(validations.map(validation => validation.run(req)));
        const errors = (0, express_validator_1.validationResult)(req);
        if (errors.isEmpty()) {
            return next();
        }
        res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: errors.array(),
        });
    };
};
exports.validateRequest = validateRequest;
const validate = (validations) => {
    return [
        ...validations,
        (req, res, next) => {
            const errors = (0, express_validator_1.validationResult)(req);
            if (errors.isEmpty()) {
                return next();
            }
            res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors: errors.array(),
            });
        },
    ];
};
exports.validate = validate;
