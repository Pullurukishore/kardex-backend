import { Request, Response, NextFunction } from 'express';

declare module 'express-validator' {
  export interface ValidationChain {
    (req: Request, res: Response, next: NextFunction): Promise<void>;
    notEmpty(): ValidationChain;
    isEmail(): ValidationChain;
    isLength(options: { min?: number; max?: number }): ValidationChain;
    withMessage(message: string): ValidationChain;
    // Add other validation methods as needed
  }

  export function body(field: string): ValidationChain;
  export function query(field: string): ValidationChain;
  export function param(field: string): ValidationChain;
  export function header(field: string): ValidationChain;
  export function cookie(field: string): ValidationChain;
  
  export function validationResult(req: Request): {
    isEmpty(): boolean;
    array(): Array<{
      value: any;
      msg: string;
      param: string;
      location: string;
    }>;
    mapped(): { [param: string]: { msg: string } };
    throw(): void;
  };
}
