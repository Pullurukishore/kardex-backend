import jwt from 'jsonwebtoken';

// Import the UserRole enum from Prisma client
import { UserRole } from '@prisma/client';

export { UserRole };

// Fallback JWT secret for development
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-7f3a1b9e5d8c2f6a4e0b7d5f8a3c1e9b2f6d4a8c7e1b3f9a5d8c2e6b4f0a7d9-extra-long-secret-key';

// Fallback refresh token secret for development
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'refresh-secret-9f4b2e8d6c1a5f9e2b7d4c8a1e6b3f9a5d8c2e7b4f0a9d6c1e5b2f8a7d4c9e1b3f9a5d8c2e6b4f0a7d9-extra-long-secret-key';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters long');
}

if (!REFRESH_TOKEN_SECRET || REFRESH_TOKEN_SECRET.length < 32) {
  throw new Error('REFRESH_TOKEN_SECRET must be at least 32 characters long');
}

interface JwtPayload {
  id: number;
  role: UserRole;
  iat: number;
  exp: number;
}

// Using JWT_SECRET from environment or fallback value

// OTP configuration
export const OTP_CONFIG = {
  expiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES || '10'), // Default 10 minutes
  length: 6
} as const;

export const JWT_CONFIG = {
  secret: JWT_SECRET,
  expiresIn: '1d' as const
};

export const REFRESH_TOKEN_CONFIG = {
  secret: REFRESH_TOKEN_SECRET,
  expiresIn: '7d' as const
};

export const generateToken = (userId: number, role: UserRole): string => {
  if (!JWT_CONFIG.secret) {
    throw new Error('JWT secret is not configured');
  }
  return jwt.sign(
    { id: userId, role },
    JWT_CONFIG.secret,
    { expiresIn: JWT_CONFIG.expiresIn }
  );
}

export function verifyToken(token: string): JwtPayload {
  if (!JWT_CONFIG.secret) {
    throw new Error('JWT secret is not configured');
  }
  return jwt.verify(token, JWT_CONFIG.secret) as JwtPayload;
}