"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRequest = void 0;
const express_validator_1 = require("express-validator");
const validateRequest = (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        const errorResponse = [];
        for (const error of errors.array()) {
            const errorObj = error; // Type assertion to access properties safely
            errorResponse.push({
                param: String(errorObj.param || 'unknown'),
                message: String(errorObj.msg || 'Validation error'),
                ...(errorObj.value !== undefined && { value: errorObj.value })
            });
        }
        return res.status(400).json({
            error: 'Validation failed',
            errors: errorResponse
        });
    }
    next();
};
exports.validateRequest = validateRequest;
