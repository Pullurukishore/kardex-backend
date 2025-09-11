import { Request, Response, NextFunction } from 'express';
import { ValidationError } from 'joi';

type SchemaType = {
  body?: any;
  query?: any;
  params?: any;
};

export const validate = (schema: SchemaType) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: Record<string, string[]> = {};
    
    // Validate request body
    if (schema.body) {
      const { error } = schema.body.validate(req.body, { abortEarly: false });
      if (error) {
        errors.body = error.details.map((detail: ValidationError) => detail.message);
      }
    }
    
    // Validate query parameters
    if (schema.query) {
      const { error } = schema.query.validate(req.query, { abortEarly: false });
      if (error) {
        errors.query = error.details.map((detail: ValidationError) => detail.message);
      }
    }
    
    // Validate route parameters
    if (schema.params) {
      const { error } = schema.params.validate(req.params, { abortEarly: false });
      if (error) {
        errors.params = error.details.map((detail: ValidationError) => detail.message);
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

export const validateBody = (schema: any) => {
  return validate({ body: schema });
};

export const validateQuery = (schema: any) => {
  return validate({ query: schema });
};

export const validateParams = (schema: any) => {
  return validate({ params: schema });
};
