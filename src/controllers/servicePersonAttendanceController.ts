import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const servicePersonAttendanceController = {
  // Get service person's own attendance records (aggregated view)
  async getMyAttendance(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { 
        startDate, 
        endDate, 
        status,
        activityType,
        search,
        page = 1, 
        limit = 20 
      } = req.query;

      const whereClause: any = { userId };

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

      // Get all attendance records for aggregation
      const attendanceRecords = await prisma.attendance.findMany({
        where: whereClause,
        include: {
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
              _count: {
                select: {
                  activityLogs: true,
                },
              },
            },
          },
        },
        orderBy: {
          checkInAt: 'desc',
        },
      });

      // Since this is for a single service person, create one aggregated record
      if (attendanceRecords.length === 0) {
        return res.json({
          success: true,
          data: {
            attendance: [],
            pagination: {
              page: Number(page),
              limit: Number(limit),
              total: 0,
              totalPages: 0,
            },
          },
        });
      }

      // Get the most recent record for basic info
      const latestRecord = attendanceRecords[0];
      
      // Calculate aggregated data
      let totalHours = 0;
      let totalActivityCount = 0;
      let currentStatus = 'CHECKED_OUT';
      let latestCheckIn: string | null = null;
      let latestCheckOut: string | null = null;
      const allFlags: Array<{
        type: string;
        message: string;
        severity: 'info' | 'warning' | 'error';
      }> = [];

      // Find current status (if any record is CHECKED_IN, user is currently checked in)
      const checkedInRecord = attendanceRecords.find(record => record.status === 'CHECKED_IN');
      if (checkedInRecord) {
        currentStatus = 'CHECKED_IN';
        latestCheckIn = checkedInRecord.checkInAt ? checkedInRecord.checkInAt.toISOString() : null;
      } else {
        // Use the most recent check-in/out times
        latestCheckIn = latestRecord.checkInAt ? latestRecord.checkInAt.toISOString() : null;
        latestCheckOut = latestRecord.checkOutAt ? latestRecord.checkOutAt.toISOString() : null;
      }

      // Aggregate data from all records
      for (const record of attendanceRecords) {
        // Sum total hours
        if (record.totalHours) {
          totalHours += Number(record.totalHours);
        } else if (record.status === 'CHECKED_IN' && record.checkInAt) {
          // For current session, calculate hours from check-in to now
          const now = new Date();
          const checkInTime = new Date(record.checkInAt);
          const currentHours = (now.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
          totalHours += currentHours;
        }

        // Get activity count for this record
        if (record.checkInAt) {
          const startTime = new Date(record.checkInAt);
          const endTime = record.checkOutAt ? new Date(record.checkOutAt) : new Date();
          
          const activityCount = await prisma.dailyActivityLog.count({
            where: {
              userId: record.userId,
              startTime: {
                gte: startTime,
                lte: endTime,
              },
            },
          });
          totalActivityCount += activityCount;
        }

        // Collect flags from this record
        if (record.checkInAt) {
          const checkInTime = new Date(record.checkInAt);
          const checkInHour = checkInTime.getHours();
          if (checkInHour >= 9) {
            allFlags.push({
              type: 'LATE_CHECKIN',
              message: `Late check-in on ${checkInTime.toLocaleDateString()}`,
              severity: 'warning',
            });
          }
        }

        if (record.checkOutAt && record.status === 'EARLY_CHECKOUT') {
          allFlags.push({
            type: 'EARLY_CHECKOUT',
            message: 'Early checkout detected',
            severity: 'warning',
          });
        }

        if (!record.checkOutAt && record.status === 'CHECKED_IN') {
          allFlags.push({
            type: 'NO_CHECKOUT',
            message: 'Currently checked in',
            severity: 'info',
          });
        }
      }

      // Check for low activity overall
      if (totalActivityCount < 3) {
        allFlags.push({
          type: 'LOW_ACTIVITY',
          message: `Only ${totalActivityCount} total activities`,
          severity: 'warning',
        });
      }

      // Create aggregated record
      const aggregatedRecord = {
        id: latestRecord.id, // Use latest record ID
        userId: latestRecord.userId,
        checkInAt: latestCheckIn,
        checkOutAt: latestCheckOut,
        checkInLatitude: latestRecord.checkInLatitude,
        checkInLongitude: latestRecord.checkInLongitude,
        checkInAddress: latestRecord.checkInAddress,
        checkOutLatitude: latestRecord.checkOutLatitude,
        checkOutLongitude: latestRecord.checkOutLongitude,
        checkOutAddress: latestRecord.checkOutAddress,
        totalHours: Math.round(totalHours * 100) / 100,
        status: currentStatus,
        notes: latestRecord.notes,
        createdAt: latestRecord.createdAt,
        updatedAt: latestRecord.updatedAt,
        user: latestRecord.user,
        activityCount: totalActivityCount,
        flags: allFlags.slice(0, 5), // Limit to 5 most relevant flags
        gaps: [], // Keep empty for now
      };

      res.json({
        success: true,
        data: {
          attendance: [aggregatedRecord], // Always return single aggregated record
          pagination: {
            page: 1,
            limit: 1,
            total: 1,
            totalPages: 1,
          },
        },
      });
    } catch (error) {
      console.error('Get my attendance error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  // Get service person's attendance statistics
  async getMyAttendanceStats(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const { startDate, endDate } = req.query;

      const whereClause: any = { userId };

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

      // Get all attendance records for the period
      const attendanceRecords = await prisma.attendance.findMany({
        where: whereClause,
        select: {
          status: true,
          totalHours: true,
          checkInAt: true,
          checkOutAt: true,
        },
      });

      // Calculate statistics
      const totalRecords = attendanceRecords.length;
      const statusBreakdown: Record<string, number> = {};
      let totalHours = 0;
      let recordsWithHours = 0;

      attendanceRecords.forEach(record => {
        // Count status breakdown
        statusBreakdown[record.status] = (statusBreakdown[record.status] || 0) + 1;

        // Calculate total hours
        if (record.totalHours) {
          totalHours += Number(record.totalHours);
          recordsWithHours++;
        } else if (record.status === 'CHECKED_IN' && record.checkInAt) {
          // For current session, calculate hours from check-in to now
          const now = new Date();
          const checkInTime = new Date(record.checkInAt);
          const currentHours = (now.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);
          totalHours += currentHours;
          recordsWithHours++;
        }
      });

      const averageHours = recordsWithHours > 0 ? totalHours / recordsWithHours : 0;

      // Determine period for display
      let period = 'custom';
      if (startDate && endDate) {
        const start = new Date(startDate as string);
        const end = new Date(endDate as string);
        const diffDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        
        if (diffDays <= 1) {
          period = 'today';
        } else if (diffDays <= 7) {
          period = 'week';
        } else if (diffDays <= 31) {
          period = 'month';
        }
      }

      res.json({
        success: true,
        data: {
          totalRecords,
          statusBreakdown,
          averageHours: Math.round(averageHours * 100) / 100,
          period,
          totalHours: Math.round(totalHours * 100) / 100,
        },
      });
    } catch (error) {
      console.error('Get my attendance stats error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  // Get specific attendance record details for service person
  async getMyAttendanceDetail(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const attendanceId = req.params.id;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!attendanceId) {
        return res.status(400).json({ error: 'Attendance ID is required' });
      }

      // Get the specific attendance record, but only if it belongs to this user
      const attendanceRecord = await prisma.attendance.findFirst({
        where: {
          id: parseInt(attendanceId),
          userId: userId, // Ensure user can only access their own records
        },
        include: {
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
              _count: {
                select: {
                  activityLogs: true,
                },
              },
            },
          },
        },
      });

      if (!attendanceRecord) {
        return res.status(404).json({ 
          success: false,
          error: 'Attendance record not found or access denied' 
        });
      }

      // Get activities for this attendance record (entire day)
      let activityCount = 0;
      let activityLogs: any[] = [];
      if (attendanceRecord.checkInAt) {
        const attendanceDate = new Date(attendanceRecord.checkInAt);
        // Get start and end of the day instead of just attendance session
        const dayStart = new Date(attendanceDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(attendanceDate);
        dayEnd.setHours(23, 59, 59, 999);
        
        // Get both count and actual activities for the entire day
        const [count, activities] = await Promise.all([
          prisma.dailyActivityLog.count({
            where: {
              userId: attendanceRecord.userId,
              startTime: {
                gte: dayStart,
                lte: dayEnd,
              },
            },
          }),
          prisma.dailyActivityLog.findMany({
            where: {
              userId: attendanceRecord.userId,
              startTime: {
                gte: dayStart,
                lte: dayEnd,
              },
            },
            select: {
              id: true,
              activityType: true,
              title: true,
              description: true,
              startTime: true,
              endTime: true,
              duration: true,
              location: true,
              latitude: true,
              longitude: true,
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
          })
        ]);
        
        activityCount = count;
        activityLogs = activities;
        console.log(`[Service Person Detail] Searching for activities between ${dayStart.toISOString()} and ${dayEnd.toISOString()}`);
        console.log(`[Service Person Detail] Found ${count} activities for attendance ${attendanceId}:`, activities.map(a => ({ id: a.id, title: a.title, type: a.activityType, startTime: a.startTime })));
      }

      // Generate flags based on attendance data
      const flags: Array<{
        type: string;
        message: string;
        severity: 'info' | 'warning' | 'error';
      }> = [];

      // Check for late check-in (after 9 AM)
      if (attendanceRecord.checkInAt) {
        const checkInTime = new Date(attendanceRecord.checkInAt);
        const checkInHour = checkInTime.getHours();
        if (checkInHour >= 9) {
          flags.push({
            type: 'LATE_CHECKIN',
            message: `Late check-in at ${checkInTime.toLocaleTimeString()}`,
            severity: 'warning',
          });
        }
      }

      // Check for early checkout (before 5 PM)
      if (attendanceRecord.checkOutAt && attendanceRecord.status === 'EARLY_CHECKOUT') {
        flags.push({
          type: 'EARLY_CHECKOUT',
          message: 'Early checkout detected',
          severity: 'warning',
        });
      }

      // Check for no checkout
      if (!attendanceRecord.checkOutAt && attendanceRecord.status === 'CHECKED_IN') {
        flags.push({
          type: 'NO_CHECKOUT',
          message: 'No checkout recorded',
          severity: 'error',
        });
      }

      // Check for low activity
      if (activityCount < 3) {
        flags.push({
          type: 'LOW_ACTIVITY',
          message: `Only ${activityCount} activities recorded`,
          severity: 'warning',
        });
      }

      const enrichedRecord = {
        ...attendanceRecord,
        activityCount,
        flags,
        gaps: [], // For now, we'll keep gaps empty - can be enhanced later
        user: {
          ...attendanceRecord.user,
          activityLogs, // Add the activities to the user object
        },
      };

      res.json({
        success: true,
        data: enrichedRecord,
      });
    } catch (error) {
      console.error('Get my attendance detail error:', error);
      res.status(500).json({ 
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },
};
