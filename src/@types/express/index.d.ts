import { UserRole } from '../../config/auth';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        role: UserRole;
        customerId?: number;
      };
    }
  }
}

export {};
