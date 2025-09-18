import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { GeocodingService } from '../services/geocoding.service';

const prisma = new PrismaClient();

// Simple validation functions (replacing zod for now)
function validateCreateActivity(data: any) {
  const errors: string[] = [];
  
  if (!data.activityType) errors.push('Activity type is required');
  if (!data.title || data.title.trim().length === 0) errors.push('Title is required');
  if (!data.startTime) errors.push('Start time is required');
  
  const validActivityTypes = [
    'TICKET_WORK', 'BD_VISIT', 'PO_DISCUSSION', 'SPARE_REPLACEMENT',
    'TRAVEL', 'TRAINING', 'MEETING', 'MAINTENANCE', 'DOCUMENTATION', 'OTHER'
  ];
  
  if (data.activityType && !validActivityTypes.includes(data.activityType)) {
    errors.push('Invalid activity type');
  }
  
  return { isValid: errors.length === 0, errors };
}

function validateUpdateActivity(data: any) {
  // For updates, all fields are optional
  return { isValid: true, errors: [] };
}

// Helper function to parse location string into lat/lng
function parseLocation(location: string): { latitude: number | null, longitude: number | null } {
  if (!location || typeof location !== 'string') {
    return { latitude: null, longitude: null };
  }
  
  // Handle comma-separated lat,lng format
  const parts = location.split(',').map(part => part.trim());
  if (parts.length === 2) {
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    
    if (!isNaN(lat) && !isNaN(lng)) {
      return { latitude: lat, longitude: lng };
    }
  }
  
  return { latitude: null, longitude: null };
}

export const activityController = {
  // Create new activity log
  async createActivity(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Check if user is checked in today before allowing activity logging
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const todayAttendance = await prisma.attendance.findFirst({
        where: {
          userId,
          checkInAt: {
            gte: today,
            lt: tomorrow,
          },
          status: 'CHECKED_IN',
        },
      });

      if (!todayAttendance) {
        return res.status(400).json({ 
          error: 'Check-in required',
          message: 'You must check in before logging activities. Please check in first with your location.'
        });
      }

      const validation = validateCreateActivity(req.body);
      if (!validation.isValid) {
        return res.status(400).json({ error: 'Invalid input data', details: validation.errors });
      }
      const validatedData = req.body;

      // Calculate duration if endTime is provided
      let duration: number | undefined;
      if (validatedData.endTime) {
        const start = new Date(validatedData.startTime);
        const end = new Date(validatedData.endTime);
        duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60)); // in minutes
      }

      // Parse location coordinates
      let latitude: number | null = validatedData.latitude;
      let longitude: number | null = validatedData.longitude;
      let locationAddress: string | null = null;

      // If location is provided as string but lat/lng are null, parse the location
      if (validatedData.location && (!latitude || !longitude)) {
        const parsed = parseLocation(validatedData.location);
        latitude = parsed.latitude;
        longitude = parsed.longitude;
      }

      // Always get real address from coordinates using geocoding service
      if (latitude && longitude) {
        try {
          const { address } = await GeocodingService.reverseGeocode(latitude, longitude);
          locationAddress = address || `${latitude}, ${longitude}`;
          console.log(`Geocoded address for activity: ${locationAddress}`);
        } catch (error) {
          console.error('Geocoding error:', error);
          // Fallback to coordinates if geocoding fails
          locationAddress = `${latitude}, ${longitude}`;
        }
      } else if (validatedData.location) {
        // If no coordinates but location string provided, use as fallback
        locationAddress = validatedData.location;
      }

      const activity = await prisma.dailyActivityLog.create({
        data: {
          userId,
          ticketId: validatedData.ticketId,
          activityType: validatedData.activityType,
          title: validatedData.title,
          description: validatedData.description,
          startTime: new Date(validatedData.startTime),
          endTime: validatedData.endTime ? new Date(validatedData.endTime) : undefined,
          duration,
          location: locationAddress,
          latitude: latitude,
          longitude: longitude,
          metadata: validatedData.metadata,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          ticket: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      });

      res.status(201).json({
        message: 'Activity logged successfully',
        activity,
      });
    } catch (error) {
      console.error('Create activity error:', error);
      if (error instanceof Error) {
        return res.status(500).json({ 
          error: 'Failed to create activity',
          details: error.message
        });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Update activity (mainly for ending activities)
  async updateActivity(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const activityId = parseInt(req.params.id);

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const validation = validateUpdateActivity(req.body);
      if (!validation.isValid) {
        return res.status(400).json({ error: 'Invalid input data', details: validation.errors });
      }
      const validatedData = req.body;

      const existingActivity = await prisma.dailyActivityLog.findFirst({
        where: {
          id: activityId,
          userId,
        },
      });

      if (!existingActivity) {
        return res.status(404).json({ error: 'Activity not found' });
      }

      // Calculate duration if endTime is provided
      let duration: number | undefined = existingActivity.duration ?? undefined;
      if (validatedData.endTime) {
        const start = new Date(existingActivity.startTime);
        const end = new Date(validatedData.endTime);
        duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60)); // in minutes
      }

      // Parse location coordinates for update
      let latitude: number | null = validatedData.latitude || (existingActivity.latitude ? Number(existingActivity.latitude) : null);
      let longitude: number | null = validatedData.longitude || (existingActivity.longitude ? Number(existingActivity.longitude) : null);
      let locationAddress: string | null = existingActivity.location;

      // If location is provided as string but lat/lng are null, parse the location
      if (validatedData.location && (!latitude || !longitude)) {
        const parsed = parseLocation(validatedData.location);
        latitude = parsed.latitude || (existingActivity.latitude ? Number(existingActivity.latitude) : null);
        longitude = parsed.longitude || (existingActivity.longitude ? Number(existingActivity.longitude) : null);
      }

      // Always get real address from coordinates when updating location
      if (validatedData.location || validatedData.latitude || validatedData.longitude) {
        if (latitude && longitude) {
          try {
            const { address } = await GeocodingService.reverseGeocode(latitude, longitude);
            locationAddress = address || `${latitude}, ${longitude}`;
            console.log(`Geocoded address for activity update: ${locationAddress}`);
          } catch (error) {
            console.error('Geocoding error on update:', error);
            // Fallback to coordinates if geocoding fails
            locationAddress = `${latitude}, ${longitude}`;
          }
        } else if (validatedData.location) {
          // If no coordinates but location string provided, use as fallback
          locationAddress = validatedData.location;
        }
      }

      const updatedActivity = await prisma.dailyActivityLog.update({
        where: { id: activityId },
        data: {
          endTime: validatedData.endTime ? new Date(validatedData.endTime) : undefined,
          duration,
          description: validatedData.description,
          location: locationAddress,
          latitude: latitude,
          longitude: longitude,
          metadata: validatedData.metadata,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          ticket: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      });

      res.json({
        message: 'Activity updated successfully',
        activity: updatedActivity,
      });
    } catch (error) {
      console.error('Update activity error:', error);
      if (error instanceof Error) {
        return res.status(500).json({ 
          error: 'Failed to update activity',
          details: error.message
        });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get user's activity logs
  async getActivities(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { 
        startDate, 
        endDate, 
        activityType, 
        ticketId,
        page = 1, 
        limit = 20 
      } = req.query;

      const skip = (Number(page) - 1) * Number(limit);
      const whereClause: any = { userId };

      if (startDate || endDate) {
        whereClause.startTime = {};
        if (startDate) {
          whereClause.startTime.gte = new Date(startDate as string);
        }
        if (endDate) {
          whereClause.startTime.lte = new Date(endDate as string);
        }
      }

      if (activityType) {
        whereClause.activityType = activityType;
      }

      if (ticketId) {
        whereClause.ticketId = parseInt(ticketId as string);
      }

      const [activities, total] = await Promise.all([
        prisma.dailyActivityLog.findMany({
          where: whereClause,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            ticket: {
              select: {
                id: true,
                title: true,
                status: true,
                customer: {
                  select: {
                    companyName: true,
                  },
                },
              },
            },
          },
          orderBy: {
            startTime: 'desc',
          },
          skip,
          take: Number(limit),
        }),
        prisma.dailyActivityLog.count({ where: whereClause }),
      ]);

      res.json({
        activities,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error('Get activities error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get activity statistics
  async getActivityStats(req: Request, res: Response) {
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

      const totalActivities = await prisma.dailyActivityLog.count({
        where: {
          userId,
          startTime: {
            gte: startDate,
          },
        },
      });

      const activities = await prisma.dailyActivityLog.findMany({
        where: {
          userId,
          startTime: {
            gte: startDate,
          },
        },
        select: {
          activityType: true,
          duration: true,
          startTime: true,
        },
      });

      // Group by activity type
      const activityTypeStats = activities.reduce((acc: Record<string, { count: number; totalDuration: number }>, activity: any) => {
        const type = activity.activityType;
        if (!acc[type]) {
          acc[type] = {
            count: 0,
            totalDuration: 0,
          };
        }
        acc[type].count++;
        acc[type].totalDuration += activity.duration || 0;
        return acc;
      }, {} as Record<string, { count: number; totalDuration: number }>);

      // Calculate total duration
      const totalDuration = activities.reduce((sum: number, activity: any) => {
        return sum + (activity.duration || 0);
      }, 0);

      res.json({
        period,
        totalActivities: activities.length,
        totalDuration, // in minutes
        totalHours: Math.round((totalDuration / 60) * 100) / 100,
        activityTypeBreakdown: activityTypeStats,
      });
    } catch (error) {
      console.error('Get activity stats error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Auto-create activity when ticket status changes
  async createTicketActivity(ticketId: number, userId: number, oldStatus: string, newStatus: string) {
    try {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        include: {
          customer: {
            select: {
              companyName: true,
            },
          },
        },
      });

      if (!ticket) {
        throw new Error('Ticket not found');
      }

      const title = `Ticket Status Update: ${oldStatus} → ${newStatus}`;
      const description = `Updated ticket "${ticket.title}" for ${ticket.customer.companyName} from ${oldStatus} to ${newStatus}`;

      await prisma.dailyActivityLog.create({
        data: {
          userId,
          ticketId,
          activityType: 'TICKET_WORK',
          title,
          description,
          startTime: new Date(),
          endTime: new Date(),
          duration: 5, // Assume 5 minutes for status update
          metadata: {
            oldStatus,
            newStatus,
            ticketTitle: ticket.title,
            customerName: ticket.customer.companyName,
          },
        },
      });

      console.log(`Auto-created activity log for ticket ${ticketId} status change`);
    } catch (error) {
      console.error('Error creating ticket activity:', error);
      // Don't throw error to avoid breaking the main ticket update flow
    }
  },
};
