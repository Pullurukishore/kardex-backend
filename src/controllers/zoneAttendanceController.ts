import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { GeocodingService } from '../services/geocoding.service';
import { Parser } from 'json2csv';

const prisma = new PrismaClient();

export const zoneAttendanceController = {
  // Get all attendance records for the current zone with comprehensive filtering
  async getAllAttendance(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!userRole || !['ZONE_USER', 'SERVICE_PERSON'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      // Get user's zone information
      const userWithZone = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          serviceZones: {
            include: {
              serviceZone: true
            }
          }
        }
      });

      console.log('🔍 Zone Attendance Debug - User with zones:', JSON.stringify(userWithZone, null, 2));

      if (!userWithZone || !userWithZone.serviceZones.length) {
        console.log('❌ No zone assigned to user:', userId);
        return res.status(404).json({ 
          success: false,
          error: 'No zone assigned to user' 
        });
      }

      const userZoneId = userWithZone.serviceZones[0].serviceZoneId;
      console.log('✅ User zone ID:', userZoneId);

      const { 
        startDate, 
        endDate, 
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

      // Zone filtering - only show service persons from current zone
      whereClause.user = {
        serviceZones: {
          some: {
            serviceZoneId: userZoneId,
          },
        },
      };

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

      // First, get all service persons from the current zone based on filters
      const servicePersonsWhere: any = {
        role: 'SERVICE_PERSON',
        isActive: true,
        serviceZones: {
          some: {
            serviceZoneId: userZoneId
          }
        }
      };

      // Apply search filter to service persons
      if (search) {
        servicePersonsWhere.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      // Apply user filter to service persons
      if (filterUserId && filterUserId !== 'all') {
        servicePersonsWhere.id = parseInt(filterUserId as string);
      }

      const allServicePersons = await prisma.user.findMany({
        where: servicePersonsWhere,
        select: {
          id: true,
          name: true,
          email: true,
          serviceZones: {
            include: {
              serviceZone: true
            }
          }
        }
      });

      console.log('👥 Service persons in zone:', allServicePersons.length, allServicePersons.map(sp => ({ id: sp.id, name: sp.name, email: sp.email })));
      console.log('🔍 Where clause for attendance:', JSON.stringify(whereClause, null, 2));

      // Get attendance records for the date range
      const attendanceRecords = await prisma.attendance.findMany({
        where: whereClause,
        include: {
          user: {
            include: {
              serviceZones: {
                include: {
                  serviceZone: true
                }
              }
            }
          }
        },
        orderBy: [
          { checkInAt: 'desc' },
          { createdAt: 'desc' }
        ]
      });

      console.log('📊 Raw attendance records found:', attendanceRecords.length, attendanceRecords.map(ar => ({ 
        id: ar.id, 
        userId: ar.userId, 
        checkInAt: ar.checkInAt, 
        status: ar.status,
        userName: ar.user?.name || ar.user?.email 
      })));

      // Group attendance records by user and date for consolidation
      const consolidatedRecords = new Map();
      
      attendanceRecords.forEach(record => {
        const userId = record.userId;
        const dateKey = record.checkInAt ? 
          new Date(record.checkInAt).toDateString() : 
          new Date().toDateString();
        const key = `${userId}-${dateKey}`;
        
        if (!consolidatedRecords.has(key)) {
          consolidatedRecords.set(key, {
            ...record,
            sessions: [record],
            activityCount: 0, // Will be calculated separately
            flags: [],
            gaps: []
          });
        } else {
          const existing = consolidatedRecords.get(key);
          existing.sessions.push(record);
          
          // Update consolidated record with earliest check-in and latest check-out
          if (record.checkInAt && (!existing.checkInAt || record.checkInAt < existing.checkInAt)) {
            existing.checkInAt = record.checkInAt;
            existing.checkInLatitude = record.checkInLatitude;
            existing.checkInLongitude = record.checkInLongitude;
            existing.checkInAddress = record.checkInAddress;
          }
          
          if (record.checkOutAt && (!existing.checkOutAt || record.checkOutAt > existing.checkOutAt)) {
            existing.checkOutAt = record.checkOutAt;
            existing.checkOutLatitude = record.checkOutLatitude;
            existing.checkOutLongitude = record.checkOutLongitude;
            existing.checkOutAddress = record.checkOutAddress;
          }
          
          // Sum total hours
          existing.totalHours = (existing.totalHours || 0) + (record.totalHours || 0);
          
          // Combine notes
          if (record.notes) {
            existing.notes = existing.notes ? `${existing.notes}; ${record.notes}` : record.notes;
          }
          
          // Update status priority (CHECKED_IN > LATE > EARLY_CHECKOUT > CHECKED_OUT > ABSENT)
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
        }
      });

      // Create absent records for service persons without attendance
      const attendedUserIds = new Set(Array.from(consolidatedRecords.keys()).map(key => key.split('-')[0]));
      const targetDate = startDate ? new Date(startDate as string) : new Date();
      const dateKey = targetDate.toDateString();

      allServicePersons.forEach(servicePerson => {
        const userDateKey = `${servicePerson.id}-${dateKey}`;
        if (!attendedUserIds.has(servicePerson.id.toString())) {
          // Create synthetic absent record
          consolidatedRecords.set(userDateKey, {
            id: `absent-${servicePerson.id}-${Date.now()}`, // Synthetic ID for absent records
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
              id: servicePerson.id,
              name: servicePerson.name,
              email: servicePerson.email,
              serviceZones: servicePerson.serviceZones
            },
            sessions: [],
            activityCount: 0,
            flags: [{
              type: 'ABSENT',
              message: 'No attendance record',
              severity: 'error' as const
            }],
            gaps: []
          });
        }
      });

      // Convert map to array and add flagging
      const finalRecords = Array.from(consolidatedRecords.values()).map((record: any) => {
        const flags = [...(record.flags || [])];
        
        // Skip additional flagging for absent users (they already have ABSENT flag)
        if (record.status !== 'ABSENT') {
          // Add multiple sessions flag
          if (record.sessions && record.sessions.length > 1) {
            flags.push({
              type: 'MULTIPLE_SESSIONS',
              message: `${record.sessions.length} check-in sessions`,
              severity: 'info' as const
            });
          }
          
          // Add late check-in flag
          if (record.checkInAt) {
            const checkInTime = new Date(record.checkInAt);
            const checkInHour = checkInTime.getHours();
            if (checkInHour >= 11) {
              flags.push({
                type: 'LATE',
                message: 'Late check-in (after 11 AM)',
                severity: 'warning' as const
              });
            }
          }
          
          // Add early checkout flag
          if (record.checkOutAt) {
            const checkOutTime = new Date(record.checkOutAt);
            const checkOutHour = checkOutTime.getHours();
            if (checkOutHour < 16) {
              flags.push({
                type: 'EARLY_CHECKOUT',
                message: 'Early checkout (before 4 PM)',
                severity: 'warning' as const
              });
            }
          }
          
          // Add long day flag
          if (record.totalHours && record.totalHours > 12) {
            flags.push({
              type: 'LONG_DAY',
              message: `Long day (${record.totalHours.toFixed(1)}h)`,
              severity: 'warning' as const
            });
          }
          
          // Add auto checkout flag
          if (record.notes && record.notes.includes('Auto-checkout')) {
            flags.push({
              type: 'AUTO_CHECKOUT',
              message: 'Auto-checkout at 7 PM',
              severity: 'info' as const
            });
          }
          
          // Add no activity flag
          if (record.activityCount === 0) {
            flags.push({
              type: 'NO_ACTIVITY',
              message: 'No activities logged',
              severity: 'error' as const
            });
          }
        }
        
        return {
          ...record,
          flags
        };
      });

      // Apply pagination
      const totalRecords = finalRecords.length;
      const paginatedRecords = finalRecords.slice(skip, skip + Number(limit));
      
      const totalPages = Math.ceil(totalRecords / Number(limit));

      console.log('📈 Final result:', {
        totalRecords,
        paginatedRecords: paginatedRecords.length,
        totalPages,
        sampleRecord: paginatedRecords[0] ? {
          id: paginatedRecords[0].id,
          userId: paginatedRecords[0].userId,
          status: paginatedRecords[0].status,
          userName: paginatedRecords[0].user?.name || paginatedRecords[0].user?.email
        } : 'No records'
      });

      return res.json({
        success: true,
        data: {
          attendance: paginatedRecords,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: totalRecords,
            totalPages
          }
        }
      });

    } catch (error) {
      console.error('Error fetching zone attendance:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Failed to fetch attendance records' 
      });
    }
  },

  // Get attendance statistics for zone dashboard
  async getAttendanceStats(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!userRole || !['ZONE_USER', 'SERVICE_PERSON'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      // Get user's zone information
      const userWithZone = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          serviceZones: {
            include: {
              serviceZone: true
            }
          }
        }
      });

      if (!userWithZone || !userWithZone.serviceZones.length) {
        return res.status(404).json({ error: 'No zone assigned to user' });
      }

      const userZoneId = userWithZone.serviceZones[0].serviceZoneId;

      const { startDate, endDate } = req.query;

      const whereClause: any = {
        user: {
          serviceZones: {
            some: {
              serviceZoneId: userZoneId,
            },
          },
        },
      };

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

      // Get status breakdown
      const statusBreakdown = await prisma.attendance.groupBy({
        by: ['status'],
        where: whereClause,
        _count: {
          status: true
        }
      });

      const statusCounts = statusBreakdown.reduce((acc, item) => {
        acc[item.status] = item._count.status;
        return acc;
      }, {} as Record<string, number>);

      // Calculate total records
      const totalRecords = await prisma.attendance.count({
        where: whereClause
      });

      // Calculate average hours
      const avgHoursResult = await prisma.attendance.aggregate({
        where: {
          ...whereClause,
          totalHours: { not: null }
        },
        _avg: {
          totalHours: true
        }
      });

      const averageHours = avgHoursResult._avg.totalHours || 0;

      return res.json({
        success: true,
        data: {
          totalRecords,
          statusBreakdown: statusCounts,
          averageHours: Number(averageHours.toFixed(2)),
          period: startDate && endDate ? 
            `${new Date(startDate as string).toLocaleDateString()} - ${new Date(endDate as string).toLocaleDateString()}` :
            'All time'
        }
      });

    } catch (error) {
      console.error('Error fetching zone attendance stats:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Failed to fetch attendance statistics' 
      });
    }
  },

  // Get service persons list for filters (zone-specific)
  async getServicePersons(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!userRole || !['ZONE_USER', 'SERVICE_PERSON'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      // Get user's zone information
      const userWithZone = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          serviceZones: {
            include: {
              serviceZone: true
            }
          }
        }
      });

      if (!userWithZone || !userWithZone.serviceZones.length) {
        return res.status(404).json({ error: 'No zone assigned to user' });
      }

      const userZoneId = userWithZone.serviceZones[0].serviceZoneId;

      const servicePersons = await prisma.user.findMany({
        where: {
          role: 'SERVICE_PERSON',
          isActive: true,
          serviceZones: {
            some: {
              serviceZoneId: userZoneId
            }
          }
        },
        select: {
          id: true,
          name: true,
          email: true,
          serviceZones: {
            include: {
              serviceZone: true
            }
          }
        },
        orderBy: [
          { name: 'asc' },
          { email: 'asc' }
        ]
      });

      return res.json({
        success: true,
        data: servicePersons
      });

    } catch (error) {
      console.error('Error fetching zone service persons:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Failed to fetch service persons' 
      });
    }
  },

  // Get service zones list for current user's zone
  async getServiceZones(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!userRole || !['ZONE_USER', 'SERVICE_PERSON'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      // Get user's zone information
      const userWithZone = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          serviceZones: {
            include: {
              serviceZone: true
            }
          }
        }
      });

      if (!userWithZone || !userWithZone.serviceZones.length) {
        return res.status(404).json({ error: 'No zone assigned to user' });
      }

      const userZones = userWithZone.serviceZones.map(sz => sz.serviceZone);

      return res.json({
        success: true,
        data: userZones
      });

    } catch (error) {
      console.error('Error fetching zone service zones:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Failed to fetch service zones' 
      });
    }
  },

  // Export attendance data as CSV (zone-specific)
  async exportAttendance(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!userRole || !['ZONE_USER', 'SERVICE_PERSON'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      // Get user's zone information
      const userWithZone = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          serviceZones: {
            include: {
              serviceZone: true
            }
          }
        }
      });

      if (!userWithZone || !userWithZone.serviceZones.length) {
        return res.status(404).json({ error: 'No zone assigned to user' });
      }

      const userZoneId = userWithZone.serviceZones[0].serviceZoneId;
      const zoneName = userWithZone.serviceZones[0].serviceZone.name;

      const { startDate, endDate, status, userId: filterUserId } = req.query;

      const whereClause: any = {
        user: {
          serviceZones: {
            some: {
              serviceZoneId: userZoneId,
            },
          },
        },
      };

      // Apply filters
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

      const attendanceRecords = await prisma.attendance.findMany({
        where: whereClause,
        include: {
          user: {
            include: {
              serviceZones: {
                include: {
                  serviceZone: true
                }
              }
            }
          }
        },
        orderBy: [
          { checkInAt: 'desc' },
          { createdAt: 'desc' }
        ]
      });

      // Prepare CSV data
      const csvData = attendanceRecords.map(record => ({
        'Service Person': record.user.name || record.user.email,
        'Email': record.user.email,
        'Zone': record.user.serviceZones.map((sz: any) => sz.serviceZone.name).join(', '),
        'Date': record.checkInAt ? new Date(record.checkInAt).toLocaleDateString() : 'N/A',
        'Check-In Time': record.checkInAt ? new Date(record.checkInAt).toLocaleTimeString() : 'N/A',
        'Check-Out Time': record.checkOutAt ? new Date(record.checkOutAt).toLocaleTimeString() : 'N/A',
        'Total Hours': record.totalHours || 0,
        'Status': record.status,
        'Activity Count': 0, // Will be calculated separately if needed
        'Check-In Address': record.checkInAddress || 'N/A',
        'Check-Out Address': record.checkOutAddress || 'N/A',
        'Notes': record.notes || 'N/A'
      }));

      const fields = [
        'Service Person',
        'Email', 
        'Zone',
        'Date',
        'Check-In Time',
        'Check-Out Time',
        'Total Hours',
        'Status',
        'Activity Count',
        'Check-In Address',
        'Check-Out Address',
        'Notes'
      ];

      const json2csvParser = new Parser({ fields });
      const csv = json2csvParser.parse(csvData);

      const filename = `${zoneName}_attendance_${new Date().toISOString().split('T')[0]}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      
      return res.send(csv);

    } catch (error) {
      console.error('Error exporting zone attendance:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Failed to export attendance data' 
      });
    }
  }
};
