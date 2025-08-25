import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { PrismaClient, User, UserRole } from '@prisma/client';
import { AuthenticatedRequest } from '../middleware/auth.middleware';
import { JWT_CONFIG, REFRESH_TOKEN_CONFIG } from '../config/auth';

const prisma = new PrismaClient();

// Type for user data that's safe to return to the client
type SafeUser = {
  id: number;
  email: string;
  role: UserRole;
  customerId: number | null;
  isActive: boolean;
  customer?: {
    id: number;
    companyName: string;
    isActive: boolean;
  } | null;
};

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, role, name, phone, companyName } = req.body;

    // Validate required fields
    if (!email || !password || !role) {
      return res.status(400).json({ message: 'Email, password and role are required' });
    }

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user data
    const userData: any = {
      email,
      password: hashedPassword,
      role,
      isActive: true
    };

    // Handle customer owner registration
    if (role === 'CUSTOMER_OWNER' && companyName) {
      // Get admin user or system user ID for createdBy/updatedBy
      const adminUser = await prisma.user.findFirst({
        where: { role: 'ADMIN' },
        select: { id: true }
      });
      
      const systemUserId = adminUser?.id || 1; // Fallback to 1 if no admin found

      // Create customer first
      const customer = await prisma.customer.create({
        data: {
          companyName,
          isActive: true,
          createdBy: {
            connect: { id: systemUserId }
          },
          updatedBy: {
            connect: { id: systemUserId }
          }
        }
      });

      // Create contact
      await prisma.contact.create({
        data: {
          name: name || '',
          email,
          phone: phone || '',
          role: 'ACCOUNT_OWNER',
          customerId: customer.id
        }
      });

      userData.customerId = customer.id;
    }

    // Create user
    const user = await prisma.user.create({
      data: userData,
      select: {
        id: true,
        email: true,
        role: true,
        customerId: true,
        isActive: true,
        customer: {
          select: {
            id: true,
            companyName: true,
            isActive: true
          }
        }
      }
    });

    // Generate tokens
    const token = jwt.sign(
      { id: user.id, role: user.role, customerId: user.customerId },
      JWT_CONFIG.secret,
      { expiresIn: '1d' }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      REFRESH_TOKEN_CONFIG.secret,
      { expiresIn: '7d' }
    );

    // Save refresh token to database
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken }
    });

    // Set HTTP-only cookies
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'none',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Return user and token
    res.status(201).json({
      user,
      token // Also return token for clients that need it
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Find user with customer info
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        customer: true
      }
    });

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ message: 'Account is deactivated' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate tokens
    const token = jwt.sign(
      { id: user.id, role: user.role, customerId: user.customerId },
      JWT_CONFIG.secret,
      { expiresIn: '1d' }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      REFRESH_TOKEN_CONFIG.secret,
      { expiresIn: '7d' }
    );

    // Save refresh token to database
    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken }
    });

    // Set HTTP-only cookies
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'none',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    // Return user data without password
    const { password: _, ...userData } = user;
    res.json({
      ...userData,
      token // Also return token for clients that need it
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const getCurrentUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        role: true,
        customerId: true,
        isActive: true,
        customer: {
          select: {
            id: true,
            companyName: true,
            isActive: true
          }
        },
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const logout = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (req.user?.id) {
      // Clear refresh token from database
      await prisma.user.update({
        where: { id: req.user.id },
        data: { refreshToken: null }
      });
    }

    // Clear cookies
    res.clearCookie('token', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    res.clearCookie('refreshToken', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token required' });
    }

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, REFRESH_TOKEN_CONFIG.secret) as { id: number };

    // Find user with refresh token
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        role: true,
        customerId: true,
        isActive: true,
        refreshToken: true
      }
    });

    // Validate user and refresh token
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    // Generate new access token
    const newToken = jwt.sign(
      { id: user.id, role: user.role, customerId: user.customerId },
      JWT_CONFIG.secret,
      { expiresIn: '1d' }
    );

    // Set new token cookie
    res.cookie('token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'none',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    res.json({ token: newToken });

  } catch (error) {
    console.error('Refresh token error:', error);
    
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: 'Refresh token expired' });
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }
    
    res.status(500).json({ message: 'Internal server error' });
  }
};