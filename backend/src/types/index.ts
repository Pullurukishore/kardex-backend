import { Request } from 'express';

export type UserRole = 'CUSTOMER' | 'SERVICE_PERSON' | 'ADMIN';

export interface AuthRequest extends Request {
  user?: {
    id: number;
    role: UserRole;
    customerId: number; 
  };
}

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'FIXED' | 'CLOSED' | 'SPARE_NEEDED' | 'WAITING_PO';