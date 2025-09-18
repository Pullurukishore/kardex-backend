import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { GeocodingService } from '../services/geocoding.service';
import { Parser } from 'json2csv';

const prisma = new PrismaClient();

export const adminAttendanceController = {
  // Get all attendance records with comprehensive filtering
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
        userId: filterUserId,
        activityType,
        search,
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
      if (status && status !== 'all') {
        if (status === 'AUTO_CHECKED_OUT') {
          whereClause.status = 'CHECKED_OUT';
          whereClause.notes = { contains: 'Auto-checkout' };
        } else {
          whereClause.status = status;
        }
      }

      // User filtering
      if (filterUserId && filterUserId !== 'all') {
        whereClause.userId = parseInt(filterUserId as string);
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

      // Search filtering
      if (search) {
        whereClause.user = {
          ...whereClause.user,
          OR: [
            { name: { contains: search as string, mode: 'insensitive' } },
            { email: { contains: search as string, mode: 'insensitive' } },
          ],
        };
      }

      // First, get all service persons based on filters
      const servicePersonsWhere: any = {
        role: 'SERVICE_PERSON',
        isActive: true,
      };

      // Apply zone filtering for service persons
      if (userRole === 'ZONE_USER' || (whereClause.user && whereClause.user.serviceZones)) {
        const zoneFilter = req.query.zoneId || req.user?.zoneId;
        if (zoneFilter) {
          servicePersonsWhere.serviceZones = {
            some: {
              serviceZoneId: parseInt(zoneFilter as string),
            },
          };
        }
      }

      // Apply user filtering
      if (filterUserId && filterUserId !== 'all') {
        servicePersonsWhere.id = parseInt(filterUserId as string);
      }

      // Apply search filtering
      if (search) {
        servicePersonsWhere.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      const allServicePersons = await prisma.user.findMany({
        where: servicePersonsWhere,
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
      });

      // Fetch attendance records for the date range (optimized for table view)
      const allAttendanceRecords = await prisma.attendance.findMany({
        where: whereClause,
        select: {
          id: true,
          userId: true,
          checkInAt: true,
          checkOutAt: true,
          checkInLatitude: true,
          checkInLongitude: true,
          checkInAddress: true,
          checkOutLatitude: true,
          checkOutLongitude: true,
          checkOutAddress: true,
          totalHours: true,
          status: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              serviceZones: {
                select: {
                  serviceZone: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
              // Only get activity count, not full activity logs
              _count: {
                select: {
                  activityLogs: {
                    where: {
                      startTime: {
                        gte: startDate ? new Date(startDate as string) : undefined,
                        lte: endDate ? new Date(endDate as string) : undefined,
                      },
                      ...(activityType && activityType !== 'all' ? { activityType: activityType as any } : {}),
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
      });

      // Group attendance records by user and date
      const consolidatedRecords = new Map();
      
      // First, process actual attendance records
      allAttendanceRecords.forEach(record => {
        const userId = record.userId;
        const dateKey = new Date(record.checkInAt).toDateString(); // Group by date
        const key = `${userId}-${dateKey}`;
        
        if (!consolidatedRecords.has(key)) {
          // First record for this user-date combination
          consolidatedRecords.set(key, {
            ...record,
            sessions: [record],
            totalHours: Number(record.totalHours || 0),
            earliestCheckIn: record.checkInAt,
            latestCheckOut: record.checkOutAt,
          });
        } else {
          // Additional session for the same user-date
          const existing = consolidatedRecords.get(key);
          existing.sessions.push(record);
          existing.totalHours += Number(record.totalHours || 0);
          
          // Update earliest check-in
          if (new Date(record.checkInAt) < new Date(existing.earliestCheckIn)) {
            existing.earliestCheckIn = record.checkInAt;
            existing.checkInAt = record.checkInAt;
            existing.checkInLatitude = record.checkInLatitude;
            existing.checkInLongitude = record.checkInLongitude;
            existing.checkInAddress = record.checkInAddress;
          }
          
          // Update latest check-out
          if (record.checkOutAt && (!existing.latestCheckOut || new Date(record.checkOutAt) > new Date(existing.latestCheckOut))) {
            existing.latestCheckOut = record.checkOutAt;
            existing.checkOutAt = record.checkOutAt;
            existing.checkOutLatitude = record.checkOutLatitude;
            existing.checkOutLongitude = record.checkOutLongitude;
            existing.checkOutAddress = record.checkOutAddress;
          }
          
          // Update status - prioritize certain statuses
          const statusPriority: Record<string, number> = {
            'CHECKED_IN': 5,
            'LATE': 4,
            'EARLY_CHECKOUT': 3,
            'CHECKED_OUT': 2,
            'ABSENT': 1
          };
          
          if ((statusPriority[record.status] || 0) > (statusPriority[existing.status] || 0)) {
            existing.status = record.status;
          }
          
          // Combine notes
          if (record.notes && !existing.notes?.includes(record.notes)) {
            existing.notes = existing.notes ? `${existing.notes}; ${record.notes}` : record.notes;
          }
        }
      });

      // Now add absent service persons (those without attendance records)
      const filterStartDate = startDate ? new Date(startDate as string) : new Date();
      const targetDate = filterStartDate.toDateString();
      
      allServicePersons.forEach(servicePerson => {
        const key = `${servicePerson.id}-${targetDate}`;
        
        if (!consolidatedRecords.has(key)) {
          // Create absent record for service person with no attendance
          consolidatedRecords.set(key, {
            id: `absent-${servicePerson.id}-${Date.now()}`, // Unique ID for absent records
            userId: servicePerson.id,
            checkInAt: null,
            checkOutAt: null,
            checkInLatitude: null,
            checkInLongitude: null,
            checkInAddress: null,
            checkOutLatitude: null,
            checkOutLongitude: null,
            checkOutAddress: null,
            totalHours: 0,
            status: 'ABSENT',
            notes: 'No attendance record for this date',
            createdAt: new Date(),
            updatedAt: new Date(),
            user: {
              ...servicePerson,
              _count: { activityLogs: 0 }, // No activities for absent users
            },
            sessions: [],
            earliestCheckIn: null,
            latestCheckOut: null,
          });
        }
      });

      // Convert map to array and apply pagination
      const consolidatedArray = Array.from(consolidatedRecords.values());
      const total = consolidatedArray.length;
      const attendanceRecords = consolidatedArray.slice(skip, skip + Number(limit));

      // Add computed fields and flags
      const enrichedRecords = attendanceRecords.map(record => {
        const flags = [];
        const checkInTime = record.checkInAt ? new Date(record.checkInAt) : null;
        const checkOutTime = record.checkOutAt ? new Date(record.checkOutAt) : null;
        
        // Skip flagging for absent users
        if (record.status === 'ABSENT') {
          flags.push({ type: 'ABSENT', message: 'No attendance record', severity: 'error' });
        } else {
          // Flag: Late check-in (after 11 AM)
          if (checkInTime && checkInTime.getHours() >= 11) {
            flags.push({ type: 'LATE', message: 'Late check-in', severity: 'warning' });
          }
        }
        
        if (record.status !== 'ABSENT') {
          // Flag: Early checkout (before 4 PM)
          if (checkOutTime && checkOutTime.getHours() < 16) {
            flags.push({ type: 'EARLY_CHECKOUT', message: 'Early checkout', severity: 'warning' });
          }
          
          // Flag: Long day (>12 hours)
          if (record.totalHours && Number(record.totalHours) > 12) {
            flags.push({ type: 'LONG_DAY', message: 'Unusually long day', severity: 'warning' });
          }
          
          // Flag: Auto checkout
          if (record.status === 'CHECKED_OUT' && record.notes?.includes('Auto-checkout')) {
            flags.push({ type: 'AUTO_CHECKOUT', message: 'Auto checked out', severity: 'info' });
          }
          
          // Flag: No activity logged but checked in
          const activityCount = record.user._count?.activityLogs || 0;
          if (activityCount === 0) {
            if (record.status === 'CHECKED_IN') {
              flags.push({ type: 'NO_ACTIVITY', message: 'No work recorded', severity: 'error' });
            } else if (record.status === 'CHECKED_OUT') {
              flags.push({ type: 'NO_ACTIVITY', message: 'No activity after check-in', severity: 'warning' });
            }
          }
          
          // Flag: Missing checkout (still checked in from previous day)
          if (record.status === 'CHECKED_IN' && checkInTime) {
            const now = new Date();
            const daysDiff = Math.floor((now.getTime() - checkInTime.getTime()) / (1000 * 60 * 60 * 24));
            if (daysDiff > 0) {
              flags.push({ type: 'MISSING_CHECKOUT', message: 'Missing checkout from previous day', severity: 'error' });
            }
          }
        }
        
        // Add flag for multiple sessions
        if (record.sessions && record.sessions.length > 1) {
          flags.push({ 
            type: 'MULTIPLE_SESSIONS', 
            message: `${record.sessions.length} check-in sessions`, 
            severity: 'info' 
          });
        }

        return {
          ...record,
          flags,
          gaps: [], // Remove gaps calculation for performance - can be calculated on detail view
          activityCount: record.user._count?.activityLogs || 0,
          sessionCount: record.sessions ? record.sessions.length : 1,
        };
      });

      res.json({
        success: true,
        data: {
          attendance: enrichedRecords,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit)),
          },
        },
      });
    } catch (error) {
      console.error('Get all attendance error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get attendance statistics for dashboard
  async getAttendanceStats(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!userRole || !['ADMIN', 'ZONE_USER'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const { startDate, endDate, zoneId } = req.query;

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

      // Zone filtering
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

      const [
        totalRecords,
        checkedInCount,
        checkedOutCount,
        absentCount,
        lateCount,
        earlyCheckoutCount,
        autoCheckoutCount,
        avgHours
      ] = await Promise.all([
        prisma.attendance.count({ where: whereClause }),
        prisma.attendance.count({ where: { ...whereClause, status: 'CHECKED_IN' } }),
        prisma.attendance.count({ where: { ...whereClause, status: 'CHECKED_OUT' } }),
        prisma.attendance.count({ where: { ...whereClause, status: 'ABSENT' } }),
        prisma.attendance.count({ where: { ...whereClause, status: 'LATE' } }),
        prisma.attendance.count({ where: { ...whereClause, status: 'EARLY_CHECKOUT' } }),
        prisma.attendance.count({ 
          where: { 
            ...whereClause, 
            notes: { contains: 'Auto-checkout' } 
          } 
        }),
        prisma.attendance.aggregate({
          where: { ...whereClause, totalHours: { not: null } },
          _avg: { totalHours: true },
        }),
      ]);

      const statusBreakdown = {
        CHECKED_IN: checkedInCount,
        CHECKED_OUT: checkedOutCount,
        ABSENT: absentCount,
        LATE: lateCount,
        EARLY_CHECKOUT: earlyCheckoutCount,
        AUTO_CHECKOUT: autoCheckoutCount,
      };

      res.json({
        success: true,
        data: {
          totalRecords,
          statusBreakdown,
          averageHours: avgHours._avg.totalHours ? Number(avgHours._avg.totalHours) : 0,
          period: startDate && endDate ? 'custom' : 'all',
        },
      });
    } catch (error) {
      console.error('Get attendance stats error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get detailed attendance record with activities
  async getAttendanceDetail(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!userRole || !['ADMIN', 'ZONE_USER'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const { id } = req.params;

      // Handle synthetic IDs for absent records
      if (id.startsWith('absent-')) {
        // Parse absent record ID: absent-{userId}-{timestamp}
        const parts = id.split('-');
        if (parts.length >= 3) {
          const userId = parseInt(parts[1]);
          const timestamp = parts[2];
          
          // Get user details for absent record
          const user = await prisma.user.findUnique({
            where: { id: userId },
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
                    gte: new Date(new Date().setHours(0, 0, 0, 0)),
                    lt: new Date(new Date().setHours(23, 59, 59, 999)),
                  },
                },
                include: {
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
                  startTime: 'asc',
                },
              },
            },
          });

          if (!user) {
            return res.status(404).json({ error: 'User not found for absent record' });
          }

          // Create synthetic absent attendance record
          const absentAttendance = {
            id: id,
            userId: userId,
            checkInAt: null,
            checkOutAt: null,
            checkInLatitude: null,
            checkInLongitude: null,
            checkInAddress: null,
            checkOutLatitude: null,
            checkOutLongitude: null,
            checkOutAddress: null,
            totalHours: 0,
            status: 'ABSENT',
            notes: 'No attendance record for this date',
            createdAt: new Date(),
            updatedAt: new Date(),
            user: user,
            gaps: [], // No gaps for absent records
          };

          return res.json(absentAttendance);
        } else {
          return res.status(400).json({ error: 'Invalid absent record ID format' });
        }
      }

      // Handle regular numeric IDs
      const numericId = parseInt(id);
      if (isNaN(numericId)) {
        return res.status(400).json({ error: 'Invalid attendance ID format' });
      }

      const attendance = await prisma.attendance.findUnique({
        where: { id: numericId },
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
                    gte: new Date(new Date().setHours(0, 0, 0, 0)),
                    lt: new Date(new Date().setHours(23, 59, 59, 999)),
                  },
                },
                include: {
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
                  startTime: 'asc',
                },
              },
            },
          },
        },
      });

      if (!attendance) {
        return res.status(404).json({ error: 'Attendance record not found' });
      }

      // Calculate gaps between activities
      const activities = attendance.user.activityLogs;
      const gaps = [];
      
      for (let i = 1; i < activities.length; i++) {
        const prevEnd = activities[i - 1].endTime ? new Date(activities[i - 1].endTime!) : new Date(activities[i - 1].startTime);
        const currentStart = new Date(activities[i].startTime);
        const gapMinutes = (currentStart.getTime() - prevEnd.getTime()) / (1000 * 60);
        
        if (gapMinutes > 30) { // 30+ minute gap
          gaps.push({
            start: prevEnd,
            end: currentStart,
            duration: Math.round(gapMinutes),
          });
        }
      }

      res.json({
        ...attendance,
        gaps,
      });
    } catch (error) {
      console.error('Get attendance detail error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Update attendance record (admin action)
  async updateAttendance(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!userRole || userRole !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { id } = req.params;
      const { 
        checkInAt, 
        checkOutAt, 
        checkInLatitude, 
        checkInLongitude, 
        checkInAddress,
        checkOutLatitude, 
        checkOutLongitude, 
        checkOutAddress,
        status, 
        notes,
        adminNotes 
      } = req.body;

      const attendance = await prisma.attendance.findUnique({
        where: { id: parseInt(id) },
      });

      if (!attendance) {
        return res.status(404).json({ error: 'Attendance record not found' });
      }

      // Calculate total hours if both check-in and check-out are provided
      let totalHours = null;
      if (checkInAt && checkOutAt) {
        const checkIn = new Date(checkInAt);
        const checkOut = new Date(checkOutAt);
        totalHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
      }

      const updatedAttendance = await prisma.attendance.update({
        where: { id: parseInt(id) },
        data: {
          ...(checkInAt && { checkInAt: new Date(checkInAt) }),
          ...(checkOutAt && { checkOutAt: new Date(checkOutAt) }),
          ...(checkInLatitude && { checkInLatitude }),
          ...(checkInLongitude && { checkInLongitude }),
          ...(checkInAddress && { checkInAddress }),
          ...(checkOutLatitude && { checkOutLatitude }),
          ...(checkOutLongitude && { checkOutLongitude }),
          ...(checkOutAddress && { checkOutAddress }),
          ...(status && { status }),
          ...(totalHours && { totalHours }),
          notes: adminNotes ? `${notes || attendance.notes || ''} | Admin: ${adminNotes}` : notes || attendance.notes,
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

      // Log the admin action
      await prisma.auditLog.create({
        data: {
          action: 'ATTENDANCE_UPDATED',
          entityType: 'ATTENDANCE',
          entityId: parseInt(id),
          performedById: userId,
          updatedAt: new Date(),
          details: {
            changes: req.body,
            originalRecord: attendance,
          },
        },
      });

      res.json({
        message: 'Attendance record updated successfully',
        attendance: updatedAttendance,
      });
    } catch (error) {
      console.error('Update attendance error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Add manual activity log (admin action)
  async addActivityLog(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!userRole || userRole !== 'ADMIN') {
        return res.status(403).json({ error: 'Admin access required' });
      }

      const { attendanceId } = req.params;
      const { 
        activityType, 
        title, 
        description, 
        startTime, 
        endTime, 
        location, 
        latitude, 
        longitude,
        ticketId 
      } = req.body;

      const attendance = await prisma.attendance.findUnique({
        where: { id: parseInt(attendanceId) },
      });

      if (!attendance) {
        return res.status(404).json({ error: 'Attendance record not found' });
      }

      // Calculate duration if both start and end times are provided
      let duration = null;
      if (startTime && endTime) {
        const start = new Date(startTime);
        const end = new Date(endTime);
        duration = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
      }

      const activityLog = await prisma.dailyActivityLog.create({
        data: {
          userId: attendance.userId,
          activityType,
          title,
          description: description ? `${description} (Added by admin)` : 'Added by admin',
          startTime: new Date(startTime),
          endTime: endTime ? new Date(endTime) : null,
          duration,
          location,
          latitude,
          longitude,
          ticketId: ticketId ? parseInt(ticketId) : null,
          metadata: {
            addedByAdmin: true,
            addedById: userId,
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
          ticket: {
            select: {
              id: true,
              title: true,
              status: true,
            },
          },
        },
      });

      // Log the admin action
      await prisma.auditLog.create({
        data: {
          action: 'ACTIVITY_LOG_ADDED',
          entityType: 'ACTIVITY_LOG',
          entityId: activityLog.id,
          performedById: userId,
          updatedAt: new Date(),
          details: {
            attendanceId: parseInt(attendanceId),
            activityData: req.body,
          },
        },
      });

      res.json({
        message: 'Activity log added successfully',
        activityLog,
      });
    } catch (error) {
      console.error('Add activity log error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Export attendance data as CSV
  async exportAttendance(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!userRole || !['ADMIN', 'ZONE_USER'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const { startDate, endDate, zoneId, status, userId: filterUserId } = req.query;

      const whereClause: any = {};

      // Apply same filters as getAllAttendance
      if (startDate || endDate) {
        whereClause.checkInAt = {};
        if (startDate) {
          whereClause.checkInAt.gte = new Date(startDate as string);
        }
        if (endDate) {
          whereClause.checkInAt.lte = new Date(endDate as string);
        }
      }

      if (status && status !== 'all') {
        whereClause.status = status;
      }

      if (filterUserId && filterUserId !== 'all') {
        whereClause.userId = parseInt(filterUserId as string);
      }

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

      const attendanceRecords = await prisma.attendance.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              serviceZones: {
                include: {
                  serviceZone: {
                    select: {
                      name: true,
                    },
                  },
                },
              },
              activityLogs: {
                where: {
                  startTime: {
                    gte: startDate ? new Date(startDate as string) : undefined,
                    lte: endDate ? new Date(endDate as string) : undefined,
                  },
                },
                select: {
                  activityType: true,
                  title: true,
                  duration: true,
                },
              },
            },
          },
        },
        orderBy: {
          checkInAt: 'desc',
        },
      });

      // Transform data for CSV export
      const csvData = attendanceRecords.map(record => ({
        'User Name': record.user.name || record.user.email,
        'Email': record.user.email,
        'Date': record.checkInAt.toISOString().split('T')[0],
        'Check-In Time': record.checkInAt.toISOString(),
        'Check-In Address': record.checkInAddress || '',
        'Check-Out Time': record.checkOutAt ? record.checkOutAt.toISOString() : '',
        'Check-Out Address': record.checkOutAddress || '',
        'Total Hours': record.totalHours ? Number(record.totalHours).toFixed(2) : '',
        'Status': record.status,
        'Activity Count': record.user.activityLogs.length,
        'Zone': record.user.serviceZones.map(sz => sz.serviceZone.name).join(', '),
        'Notes': record.notes || '',
      }));

      const parser = new Parser();
      const csv = parser.parse(csvData);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=attendance-export.csv');
      res.send(csv);
    } catch (error) {
      console.error('Export attendance error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get service persons list for filters
  async getServicePersons(req: Request, res: Response) {
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
      const whereClause: any = {
        role: 'SERVICE_PERSON',
        isActive: true,
      };

      // Zone filtering
      if (userRole === 'ZONE_USER' || zoneId) {
        const zoneFilter = zoneId || req.user?.zoneId;
        if (zoneFilter) {
          whereClause.serviceZones = {
            some: {
              serviceZoneId: parseInt(zoneFilter as string),
            },
          };
        }
      }

      const servicePersons = await prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          email: true,
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
        orderBy: {
          name: 'asc',
        },
      });

      res.json({
        success: true,
        data: servicePersons,
      });
    } catch (error) {
      console.error('Get service persons error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get service zones list for filters
  async getServiceZones(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!userRole || !['ADMIN', 'ZONE_USER'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const whereClause: any = {};

      // Zone filtering for ZONE_USER
      if (userRole === 'ZONE_USER' && req.user?.zoneId) {
        whereClause.id = req.user.zoneId;
      }

      const serviceZones = await prisma.serviceZone.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          description: true,
        },
        orderBy: {
          name: 'asc',
        },
      });

      res.json({
        success: true,
        data: serviceZones,
      });
    } catch (error) {
      console.error('Get service zones error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};
