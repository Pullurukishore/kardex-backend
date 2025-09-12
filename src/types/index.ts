import { Request } from 'express';
import { AuthUser } from './express';

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'FIXED' | 'CLOSED' | 'SPARE_NEEDED' | 'WAITING_PO';