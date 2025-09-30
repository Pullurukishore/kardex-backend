import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { format, subDays, eachDayOfInterval, startOfDay, endOfDay } from 'date-fns';
import { generatePdf, getPdfColumns } from '../utils/pdfGenerator';

const prisma = new PrismaClient();

interface ServicePersonReport {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  serviceZones: Array<{ id: number; name: string }>;
  summary: {
    totalWorkingDays: number;
    totalHours: number;
    absentDays: number;
    autoCheckouts: number;
    activitiesLogged: number;
    averageHoursPerDay: number;
  };
  dayWiseBreakdown: any[];
  flags: any[];
}

export const servicePersonReportsController = {
  // Get comprehensive service person reports with date range filtering
  async getServicePersonReports(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;

      if (!userId) {
        return res.status(401).json({ success: false, error: 'User not authenticated' });
      }

      if (!userRole || !['ADMIN', 'ZONE_USER', 'SERVICE_PERSON'].includes(userRole)) {
        return res.status(403).json({ success: false, error: 'Insufficient permissions' });
      }

      const {
        fromDate,
        toDate,
        servicePersonIds,
        zoneId,
        status,
        search,
        page = 1,
        limit = 50,
      } = req.query;

      console.log('Received request with params:', {
        fromDate,
        toDate,
        servicePersonIds,
        zoneId,
        status,
        search,
        page,
        limit,
        userRole,
        userId
      });

      // Debug: Check total service persons in database
      const totalServicePersonsInDb = await prisma.user.count({
        where: { role: 'SERVICE_PERSON' }
      });
      console.log(`Total SERVICE_PERSON users in database: ${totalServicePersonsInDb}`);

      const activeServicePersonsInDb = await prisma.user.count({
        where: { role: 'SERVICE_PERSON', isActive: true }
      });
      console.log(`Active SERVICE_PERSON users in database: ${activeServicePersonsInDb}`);

      // Parse date range
      const startDate = fromDate ? new Date(fromDate as string) : subDays(new Date(), 30);
      const endDate = toDate ? new Date(toDate as string) : new Date();

      // Set to start/end of day for proper filtering
      const fromDateTime = startOfDay(startDate);
      const toDateTime = endOfDay(endDate);

      console.log('Processed date range:', { fromDateTime, toDateTime });

      const skip = (Number(page) - 1) * Number(limit);

      // Build service person filter
      const servicePersonWhere: any = {
        role: 'SERVICE_PERSON',
        isActive: true,
      };

      // For SERVICE_PERSON role, only show their own data
      if (userRole === 'SERVICE_PERSON') {
        servicePersonWhere.id = userId;
      }

      // Zone filtering for ZONE_USER
      if (userRole === 'ZONE_USER' || zoneId) {
        const zoneFilter = zoneId || req.user?.zoneId;
        if (zoneFilter) {
          servicePersonWhere.serviceZones = {
            some: {
              serviceZoneId: parseInt(zoneFilter as string),
            },
          };
        }
      }

      // Service person filtering (only for ADMIN and ZONE_USER)
      if (userRole !== 'SERVICE_PERSON' && servicePersonIds && servicePersonIds !== 'all') {
        const personIds = Array.isArray(servicePersonIds)
          ? (servicePersonIds as string[]).map((id) => parseInt(id as string))
          : (servicePersonIds as string).split(',').map((id) => parseInt(id.trim()));
        servicePersonWhere.id = { in: personIds };
      }

      // Search filtering
      if (search) {
        servicePersonWhere.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      // Get all service persons matching criteria with their activity and attendance counts
      const servicePersons = await prisma.user.findMany({
        where: servicePersonWhere,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
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
        skip: skip,
        take: Number(limit),
      });

      console.log(`Found ${servicePersons.length} service persons matching criteria`);

      // Process each service person's report
      const servicePersonReports = await Promise.all(
        servicePersons.map(async (person) => {
          console.log(`Processing report for user: ${person.email}`);
          
          // Get attendance records for the date range
          const attendanceRecords = await prisma.attendance.findMany({
            where: {
              userId: person.id,
              OR: [
                {
                  checkInAt: {
                    gte: fromDateTime,
                    lte: toDateTime,
                  },
                },
                {
                  checkOutAt: {
                    gte: fromDateTime,
                    lte: toDateTime,
                  },
                },
              ],
            },
            orderBy: {
              checkInAt: 'asc',
            },
          });

          console.log(`Found ${attendanceRecords.length} attendance records for user ${person.email}`);

          // Get activities for the date range
          const activities = await prisma.dailyActivityLog.findMany({
            where: {
              userId: person.id,
              startTime: {
                gte: fromDateTime,
                lte: toDateTime,
              },
            },
            include: {
              ticket: {
                include: {
                  customer: true,
                },
              },
            },
            orderBy: {
              startTime: 'asc',
            },
          });

          console.log(`Found ${activities.length} activities for user ${person.email}`);

          // Process day-wise breakdown
          const daysInRange = eachDayOfInterval({
            start: fromDateTime,
            end: toDateTime,
          });

          const dayWiseBreakdown = daysInRange.map((day) => {
            const dayStart = startOfDay(day);
            const dayEnd = endOfDay(day);
            const dayKey = format(day, 'yyyy-MM-dd');

            // Find attendance for this day
            const dayAttendance = attendanceRecords.find((att) => {
              const checkInDay = att.checkInAt ? format(att.checkInAt, 'yyyy-MM-dd') : null;
              const checkOutDay = att.checkOutAt ? format(att.checkOutAt, 'yyyy-MM-dd') : null;
              return checkInDay === dayKey || checkOutDay === dayKey;
            });

            // Find activities for this day
            const dayActivities = activities.filter((activity: any) => {
              const activityDay = format(activity.startTime, 'yyyy-MM-dd');
              return activityDay === dayKey;
            });

            // Calculate total hours for the day
            let totalHours = 0;
            if (dayAttendance?.checkInAt && dayAttendance?.checkOutAt) {
              const checkIn = new Date(dayAttendance.checkInAt);
              const checkOut = new Date(dayAttendance.checkOutAt);
              totalHours = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
            }

            // Determine attendance status
            let attendanceStatus = 'ABSENT';
            if (dayAttendance) {
              if (dayAttendance.checkInAt && dayAttendance.checkOutAt) {
                attendanceStatus = 'CHECKED_OUT';
              } else if (dayAttendance.checkInAt) {
                attendanceStatus = 'CHECKED_IN';
              }
            }

            // Check for flags
            const flags: any[] = [];
            // Check if checkOut is more than 12 hours after checkIn (auto-checkout)
            if (dayAttendance?.checkInAt && dayAttendance.checkOutAt) {
              const checkIn = new Date(dayAttendance.checkInAt);
              const checkOut = new Date(dayAttendance.checkOutAt);
              const hoursDiff = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
              
              if (hoursDiff >= 12) {
                flags.push({
                  type: 'AUTO_CHECKOUT',
                  message: 'Auto-checked out by system',
                });
              }
            }

            return {
              date: dayKey,
              checkInTime: dayAttendance?.checkInAt ?? null,
              checkOutTime: dayAttendance?.checkOutAt ?? null,
              totalHours,
              attendanceStatus,
              activityCount: dayActivities.length,
              flags,
              activities: dayActivities.map((act: any) => ({
                id: act.id,
                activityType: act.activityType,
                title: act.title || 'No title',
                startTime: act.startTime,
                endTime: act.endTime,
                duration: act.duration || 0,
                location: act.location || 'Location not specified',
                ticketId: act.ticketId,
                ticket: act.ticket ? {
                  id: act.ticket.id,
                  title: act.ticket.title,
                  status: act.ticket.status,
                  customer: act.ticket.customer ? {
                    companyName: act.ticket.customer.companyName || 'No company',
                  } : { companyName: 'No company' },
                } : null,
              })),
            };
          });

          // Calculate summary
          const presentDays = dayWiseBreakdown.filter(
            (day) => day.attendanceStatus !== 'ABSENT'
          ).length;
          const absentDays = dayWiseBreakdown.length - presentDays;
          const autoCheckouts = dayWiseBreakdown.filter(
            (day) => day.flags.some((f) => f.type === 'AUTO_CHECKOUT')
          ).length;
          const totalHours = dayWiseBreakdown.reduce(
            (sum, day) => sum + (day.totalHours || 0),
            0
          );
          const activitiesLogged = dayWiseBreakdown.reduce(
            (sum, day) => sum + day.activityCount,
            0
          );

          // Check for late check-ins
          const lateCheckIns = dayWiseBreakdown.filter((day) => {
            if (!day.checkInTime) return false;
            const checkInHour = new Date(day.checkInTime).getHours();
            return checkInHour >= 10; // After 10 AM is considered late
          }).length;

          // Initialize flags array for this service person
          const servicePersonFlags: any[] = [];
          
          // Add late check-in flag if applicable
          if (lateCheckIns > 0) {
            servicePersonFlags.push({
              type: 'LATE',
              message: `${lateCheckIns} late check-in(s) detected`,
            });
          }

          // Calculate average hours per day (only for present days)
          const averageHoursPerDay = presentDays > 0 ? (totalHours / presentDays) : 0;

          // Construct the report for this service person
          return {
            id: person.id,
            name: person.name,
            email: person.email,
            phone: person.phone,
            serviceZones: person.serviceZones.map((sz: any) => ({
              id: sz.serviceZone.id,
              name: sz.serviceZone.name,
            })),
            dayWiseBreakdown,
            summary: {
              totalDays: dayWiseBreakdown.length,
              presentDays,
              absentDays,
              totalHours: parseFloat(totalHours.toFixed(2)),
              totalActivities: activitiesLogged,
              autoCheckouts,
              lateCheckIns,
              averageHoursPerDay: parseFloat(averageHoursPerDay.toFixed(2)),
            },
            flags: servicePersonFlags,
          };
        })
      );

      // Get total count for pagination
      const totalCount = await prisma.user.count({
        where: servicePersonWhere,
      });

      // Return the response
      return res.json({
        success: true,
        data: {
          servicePersonReports,
          total: totalCount,
          page: Number(page),
          limit: Number(limit),
        },
      });
    } catch (error) {
      console.error('Error in getServicePersonReports:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },

  // Get summary statistics for reports dashboard
  async getReportsSummary(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!userRole || !['ADMIN', 'ZONE_USER', 'SERVICE_PERSON'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const { fromDate, toDate, zoneId } = req.query;

      // Set default date range (last 30 days)
      const endDate = toDate ? new Date(toDate as string) : new Date();
      const startDate = fromDate ? new Date(fromDate as string) : subDays(endDate, 30);

      // Build where clause based on user role and filters
      let userWhereClause: any = {};
      
      if (userRole === 'ZONE_USER') {
        const zoneUser = await prisma.user.findUnique({
          where: { id: userId },
          include: { serviceZones: true },
        });
        
        if (!zoneUser?.serviceZones?.length) {
          return res.status(403).json({ error: 'No zones assigned to user' });
        }
        
        userWhereClause.serviceZones = {
          some: {
            serviceZoneId: { in: zoneUser.serviceZones.map(z => z.serviceZoneId) }
          }
        };
      } else if (userRole === 'SERVICE_PERSON') {
        userWhereClause.id = userId;
      }

      if (zoneId) {
        userWhereClause.serviceZones = {
          some: { serviceZoneId: parseInt(zoneId as string) }
        };
      }

      // Get total service persons count
      const totalServicePersons = await prisma.user.count({
        where: {
          role: 'SERVICE_PERSON',
          ...userWhereClause,
        },
      });

      // Get active service persons (those with attendance in date range)
      const activeServicePersons = await prisma.user.count({
        where: {
          role: 'SERVICE_PERSON',
          ...userWhereClause,
          attendance: {
            some: {
              checkInAt: {
                gte: startDate,
                lte: endDate,
              },
            },
          },
        },
      });

      // Get total working hours
      const totalHoursResult = await prisma.attendance.aggregate({
        where: {
          user: {
            role: 'SERVICE_PERSON',
            ...userWhereClause,
          },
          checkInAt: {
            gte: startDate,
            lte: endDate,
          },
          checkOutAt: { not: null },
        },
        _sum: {
          totalHours: true,
        },
      });

      // Get total activities logged
      const totalActivities = await prisma.dailyActivityLog.count({
        where: {
          user: {
            role: 'SERVICE_PERSON',
            ...userWhereClause,
          },
          startTime: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      // Get total check-ins (attendance records in date range)
      const totalCheckIns = await prisma.attendance.count({
        where: {
          user: {
            role: 'SERVICE_PERSON',
            ...userWhereClause,
          },
          checkInAt: {
            gte: startDate,
            lte: endDate,
          },
        },
      });

      // Calculate total absentees (service persons with no attendance in date range)
      const totalAbsentees = totalServicePersons - activeServicePersons;

      // Get most active user (user with most activities in date range)
      const mostActiveUserResult = await prisma.dailyActivityLog.groupBy({
        by: ['userId'],
        where: {
          user: {
            role: 'SERVICE_PERSON',
            ...userWhereClause,
          },
          startTime: {
            gte: startDate,
            lte: endDate,
          },
        },
        _count: {
          id: true,
        },
        orderBy: {
          _count: {
            id: 'desc',
          },
        },
        take: 1,
      });

      let mostActiveUser = null;
      if (mostActiveUserResult.length > 0) {
        const mostActiveUserId = mostActiveUserResult[0].userId;
        const activityCount = mostActiveUserResult[0]._count.id;
        
        const userDetails = await prisma.user.findUnique({
          where: { id: mostActiveUserId },
          select: {
            name: true,
            email: true,
          },
        });

        if (userDetails) {
          mostActiveUser = {
            name: userDetails.name,
            email: userDetails.email,
            activityCount,
          };
        }
      }

      // Calculate average hours per day (not per person)
      const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const averageHoursPerDay = totalDays > 0 
        ? Number((Number(totalHoursResult._sum.totalHours || 0) / totalDays).toFixed(2))
        : 0;

      res.json({
        success: true,
        data: {
          totalCheckIns,
          totalAbsentees,
          totalServicePersons,
          averageHoursPerDay,
          totalActivitiesLogged: totalActivities,
          mostActiveUser,
        },
      });
    } catch (error) {
      console.error('Get reports summary error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get service persons list for filter dropdown
  async getServicePersons(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!userRole || !['ADMIN', 'ZONE_USER', 'SERVICE_PERSON'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      // Build where clause based on user role
      let whereClause: any = { role: 'SERVICE_PERSON' };
      
      if (userRole === 'ZONE_USER') {
        const zoneUser = await prisma.user.findUnique({
          where: { id: userId },
          include: { serviceZones: true },
        });
        
        if (!zoneUser?.serviceZones?.length) {
          return res.status(403).json({ error: 'No zones assigned to user' });
        }
        
        whereClause.serviceZones = {
          some: {
            serviceZoneId: { in: zoneUser.serviceZones.map(z => z.serviceZoneId) }
          }
        };
      } else if (userRole === 'SERVICE_PERSON') {
        whereClause.id = userId;
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
        orderBy: { name: 'asc' },
      });

      // Transform the data to include zone names
      const transformedServicePersons = servicePersons.map(person => ({
        id: person.id,
        name: person.name,
        email: person.email,
        zones: person.serviceZones.map(sz => ({
          id: sz.serviceZone.id,
          name: sz.serviceZone.name,
        })),
      }));

      res.json({
        success: true,
        data: transformedServicePersons,
      });
    } catch (error) {
      console.error('Get service persons error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get service zones for filter dropdown
  async getServiceZones(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;

      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!userRole || !['ADMIN', 'ZONE_USER', 'SERVICE_PERSON'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      let whereClause: any = {};
      
      if (userRole === 'ZONE_USER') {
        const zoneUser = await prisma.user.findUnique({
          where: { id: userId },
          include: { serviceZones: true },
        });
        
        if (!zoneUser?.serviceZones?.length) {
          return res.status(403).json({ error: 'No zones assigned to user' });
        }
        
        whereClause.id = { in: zoneUser.serviceZones.map(z => z.serviceZoneId) };
      } else if (userRole === 'SERVICE_PERSON') {
        // Service person can only see their assigned zones
        const servicePerson = await prisma.user.findUnique({
          where: { id: userId },
          include: { serviceZones: true },
        });
        
        if (!servicePerson?.serviceZones?.length) {
          return res.json({ success: true, data: [] });
        }
        
        whereClause.id = { in: servicePerson.serviceZones.map(z => z.serviceZoneId) };
      }

      const serviceZones = await prisma.serviceZone.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          description: true,
        },
        orderBy: { name: 'asc' },
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

  // Export service person reports to PDF
  async exportServicePersonReports(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!userRole || !['ADMIN', 'ZONE_USER', 'SERVICE_PERSON'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const { fromDate, toDate, servicePersonIds, zoneId, status, search } = req.query;

      // Parse date range
      const startDate = fromDate ? new Date(fromDate as string) : subDays(new Date(), 30);
      const endDate = toDate ? new Date(toDate as string) : new Date();
      
      const fromDateTime = startOfDay(startDate);
      const toDateTime = endOfDay(endDate);

      // Build where clause for filtering
      const servicePersonWhere: any = {
        role: 'SERVICE_PERSON',
        isActive: true,
      };

      // For SERVICE_PERSON role, only show their own data
      if (userRole === 'SERVICE_PERSON') {
        servicePersonWhere.id = userId;
      }

      // Zone filtering for ZONE_USER
      if (userRole === 'ZONE_USER' || zoneId) {
        const zoneFilter = zoneId || req.user?.zoneId;
        if (zoneFilter) {
          servicePersonWhere.serviceZones = {
            some: {
              serviceZoneId: parseInt(zoneFilter as string),
            },
          };
        }
      }

      // Service person filtering (only for ADMIN and ZONE_USER)
      if (userRole !== 'SERVICE_PERSON' && servicePersonIds && servicePersonIds !== 'all') {
        const personIds = Array.isArray(servicePersonIds) 
          ? servicePersonIds.map(id => parseInt(id as string))
          : (servicePersonIds as string).split(',').map(id => parseInt(id.trim()));
        servicePersonWhere.id = { in: personIds };
      }

      // Search filtering
      if (search) {
        servicePersonWhere.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      // Get all service persons matching criteria with their activity and attendance counts
      const servicePersons = await prisma.user.findMany({
        where: servicePersonWhere,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
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
          _count: {
            select: {
              attendance: {
                where: {
                  checkInAt: {
                    gte: fromDateTime,
                    lte: toDateTime,
                  },
                },
              },
              activityLogs: {
                where: {
                  startTime: {
                    gte: fromDateTime,
                    lte: toDateTime,
                  },
                },
              },
            },
          },
        },
        orderBy: { name: 'asc' },
      });

      // Generate date range for analysis
      const dateRange = eachDayOfInterval({ start: fromDateTime, end: toDateTime });

      // Prepare PDF data
      const pdfData: Array<Record<string, string | number>> = [];

      // Get comprehensive data for each service person
      await Promise.all(
        servicePersons.map(async (person) => {
          // Get attendance records for the date range
          const attendanceRecords = await prisma.attendance.findMany({
            where: {
              userId: person.id,
              checkInAt: {
                gte: fromDateTime,
                lte: toDateTime,
              },
            },
            orderBy: { checkInAt: 'asc' },
          });

          // Get activity logs for the date range
          const activityLogs = await prisma.dailyActivityLog.findMany({
            where: {
              userId: person.id,
              startTime: {
                gte: fromDateTime,
                lte: toDateTime,
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
            orderBy: { startTime: 'asc' },
          });

          // Generate day-wise breakdown
          const dayWiseBreakdown = dateRange.map(date => {
            const dateStr = format(date, 'yyyy-MM-dd');
            const dayAttendance = attendanceRecords.find(record => 
              format(new Date(record.checkInAt), 'yyyy-MM-dd') === dateStr);
            
            const dayActivities = activityLogs.filter(activity => 
              format(new Date(activity.startTime), 'yyyy-MM-dd') === dateStr);

            let attendanceStatus = 'ABSENT';
            let checkInTime = null;
            let checkOutTime = null;
            let totalHours = 0;
            let dayFlags = [];

            if (dayAttendance) {
              attendanceStatus = dayAttendance.status;
              checkInTime = dayAttendance.checkInAt;
              checkOutTime = dayAttendance.checkOutAt;
              totalHours = Number(dayAttendance.totalHours) || 0;

              // Day-specific flags
              if (dayAttendance.checkInAt && new Date(dayAttendance.checkInAt).getHours() >= 11) {
                dayFlags.push({ type: 'LATE', message: 'Late check-in' });
              }
              if (dayAttendance.notes?.includes('Auto-checkout')) {
                dayFlags.push({ type: 'AUTO_CHECKOUT', message: 'Auto checkout' });
              }
              if (dayActivities.length === 0) {
                dayFlags.push({ type: 'NO_ACTIVITY', message: 'No activity logged' });
              }
            }

            return {
              date: dateStr,
              checkInTime,
              checkOutTime,
              totalHours,
              attendanceStatus,
              activityCount: dayActivities.length,
              flags: dayFlags,
              activities: dayActivities.map(activity => ({
                id: activity.id,
                activityType: activity.activityType,
                title: activity.title,
                startTime: activity.startTime,
                endTime: activity.endTime,
                duration: activity.duration,
                location: activity.location,
                ticketId: activity.ticketId,
                ticket: activity.ticket,
              })),
            };
          });

          // Add to PDF data
          dayWiseBreakdown.forEach(day => {
            pdfData.push({
              servicePerson: person.name ?? '',
              email: person.email,
              phone: person.phone || '',
              zones: person.serviceZones.map(zone => zone.serviceZone.name).join(', '),
              date: day.date,
              checkInTime: day.checkInTime ? format(new Date(day.checkInTime), 'HH:mm') : '',
              checkOutTime: day.checkOutTime ? format(new Date(day.checkOutTime), 'HH:mm') : '',
              totalHours: day.totalHours || 0,
              status: day.attendanceStatus,
              activityCount: day.activityCount,
              flags: day.flags.map((f: any) => f.message).join('; '),
              activities: day.activities.map((a: any) => 
                `${a.activityType}: ${a.title} (${a.duration || 0}min)`).slice(0, 3).join('; '),
            });
          });
        })
      );

      // Define columns for service person reports
      const columns = [
        { key: 'servicePerson', header: 'Service Person', dataType: 'text' as const, width: 150, align: 'left' as const },
        { key: 'email', header: 'Email', dataType: 'text' as const, width: 180, align: 'left' as const },
        { key: 'phone', header: 'Phone', dataType: 'text' as const, width: 120, align: 'center' as const },
        { key: 'zones', header: 'Service Zones', dataType: 'text' as const, width: 150, align: 'left' as const },
        { key: 'date', header: 'Date', dataType: 'text' as const, width: 100, align: 'center' as const },
        { key: 'status', header: 'Status', dataType: 'text' as const, width: 80, align: 'center' as const },
        { key: 'checkInTime', header: 'Check In', dataType: 'text' as const, width: 80, align: 'center' as const },
        { key: 'checkOutTime', header: 'Check Out', dataType: 'text' as const, width: 80, align: 'center' as const },
        { key: 'totalHours', header: 'Total Hours', dataType: 'number' as const, width: 100, align: 'center' as const },
        { key: 'activityCount', header: 'Activities', dataType: 'number' as const, width: 80, align: 'center' as const },
        { key: 'flags', header: 'Flags', dataType: 'text' as const, width: 150, align: 'left' as const },
        { key: 'activities', header: 'Activity Summary', dataType: 'text' as const, width: 200, align: 'left' as const },
      ];

      const filters = {
        from: fromDate as string,
        to: toDate as string,
        reportType: 'service-person-reports'
      };

      // Generate PDF
      await generatePdf(res, pdfData, columns, 'Service Person Performance Report', filters);
    } catch (error) {
      console.error('Export reports error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get detailed activity logs for a specific service person and date
  async getActivityDetails(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!userRole || !['ADMIN', 'ZONE_USER'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const { servicePersonId, date } = req.params;

      const targetDate = new Date(date);
      const startOfTargetDate = startOfDay(targetDate);
      const endOfTargetDate = endOfDay(targetDate);

      // Get service person details
      const servicePerson = await prisma.user.findUnique({
        where: { id: parseInt(servicePersonId) },
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
      });

      if (!servicePerson) {
        return res.status(404).json({ error: 'Service person not found' });
      }

      // Get attendance record for the date
      const attendance = await prisma.attendance.findFirst({
        where: {
          userId: parseInt(servicePersonId),
          checkInAt: {
            gte: startOfTargetDate,
            lte: endOfTargetDate,
          },
        },
      });

      // Get activity logs for the date
      const activities = await prisma.dailyActivityLog.findMany({
        where: {
          userId: parseInt(servicePersonId),
          startTime: {
            gte: startOfTargetDate,
            lte: endOfTargetDate,
          },
        },
        include: {
          ticket: {
            select: {
              id: true,
              title: true,
              status: true,
              priority: true,
              customer: {
                select: {
                  companyName: true,
                },
              },
            },
          },
        },
        orderBy: { startTime: 'asc' },
      });

      res.json({
        success: true,
        data: {
          servicePerson,
          date: format(targetDate, 'yyyy-MM-dd'),
          attendance,
          activities,
        },
      });
    } catch (error) {
      console.error('Get activity details error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
};

