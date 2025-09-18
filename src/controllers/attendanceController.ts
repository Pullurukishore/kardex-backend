import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { GeocodingService } from '../services/geocoding.service';

const prisma = new PrismaClient();

// Simple validation functions
const validateCheckIn = (data: any) => {
  const errors: string[] = [];
  
  // Location is now mandatory for check-in
  if (!data.latitude || typeof data.latitude !== 'number') {
    errors.push('Latitude is required and must be a number');
  }
  
  if (!data.longitude || typeof data.longitude !== 'number') {
    errors.push('Longitude is required and must be a number');
  }
  
  if (data.address && typeof data.address !== 'string') {
    errors.push('Address must be a string');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

const validateCheckOut = (data: any) => {
  const errors: string[] = [];
  
  if (data.latitude && typeof data.latitude !== 'number') {
    errors.push('Latitude must be a number');
  }
  
  if (data.longitude && typeof data.longitude !== 'number') {
    errors.push('Longitude must be a number');
  }
  
  if (data.address && typeof data.address !== 'string') {
    errors.push('Address must be a string');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

export const attendanceController = {
  // Check in
  async checkIn(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const validation = validateCheckIn(req.body);
      if (!validation.isValid) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: validation.errors 
        });
      }
      
      const { latitude, longitude, address, notes } = req.body;

      // Get real address from coordinates using geocoding service
      let checkInAddress = address;
      if (latitude && longitude) {
        try {
          const { address: geocodedAddress } = await GeocodingService.reverseGeocode(latitude, longitude);
          checkInAddress = geocodedAddress || `${latitude}, ${longitude}`;
          console.log(`Geocoded check-in address: ${checkInAddress}`);
        } catch (error) {
          console.error('Geocoding error on check-in:', error);
          // Fallback to coordinates if geocoding fails
          checkInAddress = address || `${latitude}, ${longitude}`;
        }
      }

      // Check if user is already checked in today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const existingAttendance = await prisma.attendance.findFirst({
        where: {
          userId,
          checkInAt: {
            gte: today,
            lt: tomorrow,
          },
          status: 'CHECKED_IN',
        },
      });

      if (existingAttendance) {
        return res.status(400).json({ 
          error: 'Already checked in today',
          attendance: existingAttendance 
        });
      }

      const attendance = await prisma.attendance.create({
        data: {
          userId,
          checkInAt: new Date(),
          checkInLatitude: latitude,
          checkInLongitude: longitude,
          checkInAddress: checkInAddress,
          notes: notes,
          status: 'CHECKED_IN',
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      res.status(201).json({
        message: 'Successfully checked in',
        attendance,
      });
    } catch (error) {
      console.error('Check-in error:', error);
      return res.status(500).json({ 
        error: 'Failed to check in',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  // Check out
  async checkOut(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const validation = validateCheckOut(req.body);
      if (!validation.isValid) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: validation.errors 
        });
      }
      
      const { latitude, longitude, address, notes, attendanceId, isEarlyCheckout, confirmEarlyCheckout } = req.body;

      // Get real address from coordinates using geocoding service
      let checkOutAddress = address;
      if (latitude && longitude) {
        try {
          const { address: geocodedAddress } = await GeocodingService.reverseGeocode(latitude, longitude);
          checkOutAddress = geocodedAddress || `${latitude}, ${longitude}`;
          console.log(`Geocoded check-out address: ${checkOutAddress}`);
        } catch (error) {
          console.error('Geocoding error on check-out:', error);
          // Fallback to coordinates if geocoding fails
          checkOutAddress = address || `${latitude}, ${longitude}`;
        }
      }

      const attendance = await prisma.attendance.findFirst({
        where: {
          id: attendanceId,
          userId,
          status: 'CHECKED_IN',
        },
      });

      if (!attendance) {
        return res.status(404).json({ error: 'Active attendance record not found' });
      }

      const checkOutTime = new Date();
      const checkInTime = new Date(attendance.checkInAt);
      const totalHours = (checkOutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

      // Check for early checkout (before 7 PM)
      const sevenPM = new Date();
      sevenPM.setHours(19, 0, 0, 0); // 7 PM
      
      if (checkOutTime < sevenPM && !confirmEarlyCheckout) {
        return res.status(400).json({ 
          error: 'Early checkout confirmation required',
          message: 'You are checking out before 7 PM. Do you really want to checkout?',
          requiresConfirmation: true,
          checkoutTime: checkOutTime.toISOString(),
          scheduledTime: sevenPM.toISOString()
        });
      }

      const updatedAttendance = await prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          checkOutAt: checkOutTime,
          checkOutLatitude: latitude,
          checkOutLongitude: longitude,
          checkOutAddress: checkOutAddress,
          totalHours: Math.round(totalHours * 100) / 100, // Round to 2 decimal places
          status: checkOutTime < sevenPM ? 'EARLY_CHECKOUT' : 'CHECKED_OUT',
          notes: notes || attendance.notes,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      res.json({
        message: 'Successfully checked out',
        attendance: updatedAttendance,
      });
    } catch (error) {
      console.error('Check-out error:', error);
      return res.status(500).json({ 
        error: 'Failed to check out',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  // Get current attendance status
  async getCurrentStatus(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const attendance = await prisma.attendance.findFirst({
        where: {
          userId,
          checkInAt: {
            gte: today,
            lt: tomorrow,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: {
          checkInAt: 'desc',
        },
      });

      res.json({
        attendance,
        isCheckedIn: attendance?.status === 'CHECKED_IN',
      });
    } catch (error) {
      console.error('Get attendance status error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get attendance history
  async getAttendanceHistory(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { startDate, endDate, page = 1, limit = 10 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const whereClause: any = { userId };

      if (startDate || endDate) {
        whereClause.checkInAt = {};
        if (startDate) {
          whereClause.checkInAt.gte = new Date(startDate as string);
        }
        if (endDate) {
          whereClause.checkInAt.lte = new Date(endDate as string);
        }
      }

      const [attendanceRecords, total] = await Promise.all([
        prisma.attendance.findMany({
          where: whereClause,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: {
            checkInAt: 'desc',
          },
          skip,
          take: Number(limit),
        }),
        prisma.attendance.count({ where: whereClause }),
      ]);

      res.json({
        attendance: attendanceRecords,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error('Get attendance history error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get attendance statistics
  async getAttendanceStats(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { period = 'month' } = req.query;
      
      let startDate = new Date();
      if (period === 'week') {
        startDate.setDate(startDate.getDate() - 7);
      } else if (period === 'month') {
        startDate.setMonth(startDate.getMonth() - 1);
      } else if (period === 'year') {
        startDate.setFullYear(startDate.getFullYear() - 1);
      }

      const attendanceRecords = await prisma.attendance.findMany({
        where: {
          userId,
          checkInAt: {
            gte: startDate,
          },
          status: 'CHECKED_OUT',
        },
        select: {
          totalHours: true,
          checkInAt: true,
          checkOutAt: true,
        },
      });

      const totalHours = attendanceRecords.reduce((sum, record) => {
        return sum + (record.totalHours ? Number(record.totalHours) : 0);
      }, 0);

      const avgHoursPerDay = attendanceRecords.length > 0 ? totalHours / attendanceRecords.length : 0;
      const totalDaysWorked = attendanceRecords.length;

      res.json({
        period,
        totalHours: Math.round(totalHours * 100) / 100,
        avgHoursPerDay: Math.round(avgHoursPerDay * 100) / 100,
        totalDaysWorked,
        records: attendanceRecords.length,
      });
    } catch (error) {
      console.error('Get attendance stats error:', error);
      return res.status(500).json({ 
        error: 'Failed to get attendance stats',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  // Re-check-in after mistaken checkout
  async reCheckIn(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const validation = validateCheckIn(req.body);
      if (!validation.isValid) {
        return res.status(400).json({ 
          error: 'Validation failed', 
          details: validation.errors 
        });
      }
      
      const { latitude, longitude, address, notes, attendanceId } = req.body;

      // Find the attendance record to re-check-in
      const attendance = await prisma.attendance.findFirst({
        where: {
          id: attendanceId,
          userId,
          status: { in: ['CHECKED_OUT', 'EARLY_CHECKOUT'] },
        },
      });

      if (!attendance) {
        return res.status(404).json({ error: 'Attendance record not found or not eligible for re-check-in' });
      }

      // Check if it's the same day
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      if (attendance.checkInAt < today || attendance.checkInAt >= tomorrow) {
        return res.status(400).json({ error: 'Can only re-check-in for today\'s attendance' });
      }

      // Get real address from coordinates using geocoding service
      let checkInAddress = address;
      if (latitude && longitude) {
        try {
          const { address: geocodedAddress } = await GeocodingService.reverseGeocode(latitude, longitude);
          checkInAddress = geocodedAddress || `${latitude}, ${longitude}`;
          console.log(`Geocoded re-check-in address: ${checkInAddress}`);
        } catch (error) {
          console.error('Geocoding error on re-check-in:', error);
          checkInAddress = address || `${latitude}, ${longitude}`;
        }
      }

      const updatedAttendance = await prisma.attendance.update({
        where: { id: attendance.id },
        data: {
          checkOutAt: null,
          checkOutLatitude: null,
          checkOutLongitude: null,
          checkOutAddress: null,
          totalHours: null,
          status: 'CHECKED_IN',
          notes: notes || attendance.notes,
          updatedAt: new Date(),
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      res.json({
        message: 'Successfully re-checked in',
        attendance: updatedAttendance,
      });
    } catch (error) {
      console.error('Re-check-in error:', error);
      return res.status(500).json({ 
        error: 'Failed to re-check-in',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  // Auto checkout at 7 PM (to be called by a cron job)
  async autoCheckout(req: Request, res: Response) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Find all users who are still checked in today
      const activeAttendances = await prisma.attendance.findMany({
        where: {
          checkInAt: {
            gte: today,
            lt: tomorrow,
          },
          status: 'CHECKED_IN',
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      const autoCheckoutTime = new Date();
      autoCheckoutTime.setHours(19, 0, 0, 0); // 7 PM

      const updatedAttendances = [];

      for (const attendance of activeAttendances) {
        const checkInTime = new Date(attendance.checkInAt);
        const totalHours = (autoCheckoutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

        const updated = await prisma.attendance.update({
          where: { id: attendance.id },
          data: {
            checkOutAt: autoCheckoutTime,
            totalHours: Math.round(totalHours * 100) / 100,
            status: 'CHECKED_OUT',
            notes: attendance.notes ? `${attendance.notes} | Auto-checkout at 7 PM` : 'Auto-checkout at 7 PM',
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        updatedAttendances.push(updated);
      }

      res.json({
        message: `Auto-checkout completed for ${updatedAttendances.length} users`,
        attendances: updatedAttendances,
      });
    } catch (error) {
      console.error('Auto-checkout error:', error);
      return res.status(500).json({ 
        error: 'Failed to perform auto-checkout',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  // Get all attendance records for admin (with zone filtering)
  async getAllAttendance(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!userRole || !['ADMIN', 'ZONE_USER'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const { 
        startDate, 
        endDate, 
        zoneId, 
        status,
        page = 1, 
        limit = 20 
      } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const whereClause: any = {};

      // Date filtering
      if (startDate || endDate) {
        whereClause.checkInAt = {};
        if (startDate) {
          whereClause.checkInAt.gte = new Date(startDate as string);
        }
        if (endDate) {
          whereClause.checkInAt.lte = new Date(endDate as string);
        }
      }

      // Status filtering
      if (status) {
        whereClause.status = status;
      }

      // Zone filtering for ZONE_USER
      if (userRole === 'ZONE_USER' || zoneId) {
        const zoneFilter = zoneId || req.user?.zoneId;
        if (zoneFilter) {
          whereClause.user = {
            serviceZones: {
              some: {
                serviceZoneId: parseInt(zoneFilter as string),
              },
            },
          };
        }
      }

      const [attendanceRecords, total] = await Promise.all([
        prisma.attendance.findMany({
          where: whereClause,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                role: true,
                serviceZones: {
                  include: {
                    serviceZone: {
                      select: {
                        id: true,
                        name: true,
                      },
                    },
                  },
                },
              },
            },
          },
          orderBy: {
            checkInAt: 'desc',
          },
          skip,
          take: Number(limit),
        }),
        prisma.attendance.count({ where: whereClause }),
      ]);

      res.json({
        attendance: attendanceRecords,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error('Get all attendance error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get live tracking data for zone users
  async getLiveTracking(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!userRole || !['ADMIN', 'ZONE_USER'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const { zoneId } = req.query;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const whereClause: any = {
        checkInAt: {
          gte: today,
          lt: tomorrow,
        },
        status: 'CHECKED_IN',
      };

      // Zone filtering for ZONE_USER
      if (userRole === 'ZONE_USER' || zoneId) {
        const zoneFilter = zoneId || req.user?.zoneId;
        if (zoneFilter) {
          whereClause.user = {
            serviceZones: {
              some: {
                serviceZoneId: parseInt(zoneFilter as string),
              },
            },
          };
        }
      }

      const liveAttendance = await prisma.attendance.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              serviceZones: {
                include: {
                  serviceZone: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
              activityLogs: {
                where: {
                  startTime: {
                    gte: today,
                    lt: tomorrow,
                  },
                },
                orderBy: {
                  startTime: 'desc',
                },
                take: 5,
                select: {
                  id: true,
                  activityType: true,
                  title: true,
                  startTime: true,
                  endTime: true,
                  location: true,
                  latitude: true,
                  longitude: true,
                },
              },
            },
          },
        },
        orderBy: {
          checkInAt: 'desc',
        },
      });

      res.json({
        liveTracking: liveAttendance,
        totalActive: liveAttendance.length,
        lastUpdated: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Get live tracking error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};
