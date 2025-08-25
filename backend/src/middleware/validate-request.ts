import { Request, Response, NextFunction } from 'express';
import { validationResult, ValidationError } from 'express-validator';

interface ValidationErrorResponse {
  param: string;
  message: string;
  value?: any;
}

export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorResponse: ValidationErrorResponse[] = [];
    
    for (const error of errors.array()) {
      const errorObj = error as any; // Type assertion to access properties safely
      
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
