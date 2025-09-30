"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateParams = exports.validateQuery = exports.validateBody = exports.validate = void 0;
const validate = (schema) => {
    return (req, res, next) => {
        const errors = {};
        // Validate request body
        if (schema.body) {
            const { error } = schema.body.validate(req.body, { abortEarly: false });
            if (error) {
                errors.body = error.details.map((detail) => detail.message);
            }
        }
        // Validate query parameters
        if (schema.query) {
            const { error } = schema.query.validate(req.query, { abortEarly: false });
            if (error) {
                errors.query = error.details.map((detail) => detail.message);
            }
        }
        // Validate route parameters
        if (schema.params) {
            const { error } = schema.params.validate(req.params, { abortEarly: false });
            if (error) {
                errors.params = error.details.map((detail) => detail.message);
            }
        }
        // If there are validation errors, return them
        if (Object.keys(errors).length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: errors,
            });
        }
        // If validation passes, proceed to the next middleware/route handler
        next();
    };
};
exports.validate = validate;
const validateBody = (schema) => {
    return (0, exports.validate)({ body: schema });
};
exports.validateBody = validateBody;
const validateQuery = (schema) => {
    return (0, exports.validate)({ query: schema });
};
exports.validateQuery = validateQuery;
const validateParams = (schema) => {
    return (0, exports.validate)({ params: schema });
};
exports.validateParams = validateParams;
