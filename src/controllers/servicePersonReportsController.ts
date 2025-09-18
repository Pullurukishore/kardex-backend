import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { format, subDays, eachDayOfInterval, startOfDay, endOfDay } from 'date-fns';
import { Parser } from 'json2csv';

const prisma = new PrismaClient();

export const servicePersonReportsController = {
  // Get comprehensive service person reports with date range filtering
  async getServicePersonReports(req: Request, res: Response) {
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
        fromDate, 
        toDate, 
        servicePersonIds, // comma-separated string or array
        zoneId, 
        status,
        search,
        page = 1, 
        limit = 50 
      } = req.query;

      // Parse date range
      const startDate = fromDate ? new Date(fromDate as string) : subDays(new Date(), 30);
      const endDate = toDate ? new Date(toDate as string) : new Date();
      
      // Set to start/end of day for proper filtering
      const fromDateTime = startOfDay(startDate);
      const toDateTime = endOfDay(endDate);

      const skip = (Number(page) - 1) * Number(limit);

      // Build service person filter
      const servicePersonWhere: any = {
        role: 'SERVICE_PERSON',
        isActive: true,
      };

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

      // Service person filtering
      if (servicePersonIds && servicePersonIds !== 'all') {
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

      // Get all service persons matching criteria
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
        skip,
        take: Number(limit),
        orderBy: { name: 'asc' },
      });

      const totalServicePersons = await prisma.user.count({
        where: servicePersonWhere,
      });

      // Generate date range for analysis
      const dateRange = eachDayOfInterval({ start: fromDateTime, end: toDateTime });

      // Get comprehensive data for each service person
      const servicePersonReports = await Promise.all(
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

          // Calculate summary statistics
          const totalWorkingDays = attendanceRecords.length;
          const totalHours = attendanceRecords.reduce((sum, record) => 
            sum + (Number(record.totalHours) || 0), 0);
          
          const absentDays = dateRange.length - totalWorkingDays;
          const autoCheckouts = attendanceRecords.filter(record => 
            record.notes?.includes('Auto-checkout')).length;
          const activitiesLogged = activityLogs.length;

          // Calculate flags
          const flags = [];
          const lateCheckIns = attendanceRecords.filter(record => {
            const checkInTime = new Date(record.checkInAt);
            return checkInTime.getHours() >= 11;
          }).length;

          const noActivityDays = attendanceRecords.filter(record => {
            const recordDate = format(new Date(record.checkInAt), 'yyyy-MM-dd');
            const dayActivities = activityLogs.filter(activity => 
              format(new Date(activity.startTime), 'yyyy-MM-dd') === recordDate);
            return dayActivities.length === 0;
          }).length;

          if (lateCheckIns > 0) {
            flags.push({ type: 'LATE', count: lateCheckIns, message: `${lateCheckIns} late check-ins` });
          }
          if (noActivityDays > 0) {
            flags.push({ type: 'NO_ACTIVITY', count: noActivityDays, message: `${noActivityDays} days with no activity` });
          }
          if (autoCheckouts > 0) {
            flags.push({ type: 'AUTO_CHECKOUT', count: autoCheckouts, message: `${autoCheckouts} auto checkouts` });
          }

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

          return {
            id: person.id,
            name: person.name,
            email: person.email,
            phone: person.phone,
            zones: person.serviceZones.map(sz => sz.serviceZone.name),
            summary: {
              totalWorkingDays,
              totalHours: Math.round(totalHours * 100) / 100,
              absentDays,
              autoCheckouts,
              activitiesLogged,
              averageHoursPerDay: totalWorkingDays > 0 ? Math.round((totalHours / totalWorkingDays) * 100) / 100 : 0,
            },
            flags,
            dayWiseBreakdown,
          };
        })
      );

      // Apply status filtering if specified
      let filteredReports = servicePersonReports;
      if (status && status !== 'all') {
        filteredReports = servicePersonReports.filter(report => {
          switch (status) {
            case 'present':
              return report.summary.totalWorkingDays > 0;
            case 'absent':
              return report.summary.absentDays > 0;
            case 'late':
              return report.flags.some(flag => flag.type === 'LATE');
            case 'auto_checkout':
              return report.flags.some(flag => flag.type === 'AUTO_CHECKOUT');
            default:
              return true;
          }
        });
      }

      res.json({
        success: true,
        data: {
          reports: filteredReports,
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total: totalServicePersons,
            totalPages: Math.ceil(totalServicePersons / Number(limit)),
          },
          dateRange: {
            from: format(fromDateTime, 'yyyy-MM-dd'),
            to: format(toDateTime, 'yyyy-MM-dd'),
            totalDays: dateRange.length,
          },
        },
      });
    } catch (error) {
      console.error('Get service person reports error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  },

  // Get summary statistics for the reports dashboard
  async getReportsSummary(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!userRole || !['ADMIN', 'ZONE_USER'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const { fromDate, toDate, zoneId } = req.query;

      const startDate = fromDate ? new Date(fromDate as string) : subDays(new Date(), 30);
      const endDate = toDate ? new Date(toDate as string) : new Date();
      
      const fromDateTime = startOfDay(startDate);
      const toDateTime = endOfDay(endDate);

      // Build where clause for zone filtering
      const whereClause: any = {};
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

      // Get attendance statistics
      const [
        totalCheckIns,
        totalAbsentees,
        totalServicePersons,
        totalActivities,
        avgHoursData
      ] = await Promise.all([
        prisma.attendance.count({
          where: {
            ...whereClause,
            checkInAt: {
              gte: fromDateTime,
              lte: toDateTime,
            },
          },
        }),
        prisma.user.count({
          where: {
            role: 'SERVICE_PERSON',
            isActive: true,
            ...(userRole === 'ZONE_USER' || zoneId ? {
              serviceZones: {
                some: {
                  serviceZoneId: parseInt((zoneId || req.user?.zoneId) as string),
                },
              },
            } : {}),
            attendance: {
              none: {
                checkInAt: {
                  gte: fromDateTime,
                  lte: toDateTime,
                },
              },
            },
          },
        }),
        prisma.user.count({
          where: {
            role: 'SERVICE_PERSON',
            isActive: true,
            ...(userRole === 'ZONE_USER' || zoneId ? {
              serviceZones: {
                some: {
                  serviceZoneId: parseInt((zoneId || req.user?.zoneId) as string),
                },
              },
            } : {}),
          },
        }),
        prisma.dailyActivityLog.count({
          where: {
            startTime: {
              gte: fromDateTime,
              lte: toDateTime,
            },
            ...(whereClause.user ? { user: whereClause.user } : {}),
          },
        }),
        prisma.attendance.aggregate({
          where: {
            ...whereClause,
            checkInAt: {
              gte: fromDateTime,
              lte: toDateTime,
            },
            totalHours: { not: null },
          },
          _avg: { totalHours: true },
        }),
      ]);

      // Find most active user
      const mostActiveUser = await prisma.user.findFirst({
        where: {
          role: 'SERVICE_PERSON',
          isActive: true,
          ...(userRole === 'ZONE_USER' || zoneId ? {
            serviceZones: {
              some: {
                serviceZoneId: parseInt((zoneId || req.user?.zoneId) as string),
              },
            },
          } : {}),
        },
        include: {
          _count: {
            select: {
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
        orderBy: {
          activityLogs: {
            _count: 'desc',
          },
        },
      });

      res.json({
        success: true,
        data: {
          totalCheckIns,
          totalAbsentees,
          totalServicePersons,
          averageHoursPerDay: avgHoursData._avg.totalHours ? Number(avgHoursData._avg.totalHours) : 0,
          totalActivitiesLogged: totalActivities,
          mostActiveUser: mostActiveUser ? {
            name: mostActiveUser.name,
            email: mostActiveUser.email,
            activityCount: mostActiveUser._count.activityLogs,
          } : null,
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
        orderBy: { name: 'asc' },
      });

      res.json({
        success: true,
        data: servicePersons.map(person => ({
          id: person.id,
          name: person.name,
          email: person.email,
          zones: person.serviceZones.map(sz => sz.serviceZone.name),
        })),
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

  // Export service person reports as CSV
  async exportReports(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role;
      
      if (!userId) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!userRole || !['ADMIN', 'ZONE_USER'].includes(userRole)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const { fromDate, toDate, servicePersonIds, zoneId, status, search } = req.query;

      // Parse date range
      const startDate = fromDate ? new Date(fromDate as string) : subDays(new Date(), 30);
      const endDate = toDate ? new Date(toDate as string) : new Date();
      
      const fromDateTime = startOfDay(startDate);
      const toDateTime = endOfDay(endDate);

      // Build service person filter (same logic as main report)
      const servicePersonWhere: any = {
        role: 'SERVICE_PERSON',
        isActive: true,
      };

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

      if (servicePersonIds && servicePersonIds !== 'all') {
        const personIds = Array.isArray(servicePersonIds) 
          ? servicePersonIds.map(id => parseInt(id as string))
          : (servicePersonIds as string).split(',').map(id => parseInt(id.trim()));
        servicePersonWhere.id = { in: personIds };
      }

      if (search) {
        servicePersonWhere.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { email: { contains: search as string, mode: 'insensitive' } },
        ];
      }

      // Get all service persons matching criteria
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
        orderBy: { name: 'asc' },
      });

      // Generate date range for analysis
      const dateRange = eachDayOfInterval({ start: fromDateTime, end: toDateTime });

      // Get comprehensive data for each service person (simplified for export)
      const reports = await Promise.all(
        servicePersons.map(async (person) => {
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

          return {
            id: person.id,
            name: person.name,
            email: person.email,
            phone: person.phone,
            zones: person.serviceZones.map(sz => sz.serviceZone.name),
            dayWiseBreakdown,
          };
        })
      );

      // Transform data for CSV export
      const csvData: any[] = [];

      reports.forEach((report: any) => {
        report.dayWiseBreakdown.forEach((day: any) => {
          csvData.push({
            'Service Person': report.name,
            'Email': report.email,
            'Phone': report.phone || '',
            'Zones': report.zones.join(', '),
            'Date': day.date,
            'Check-In Time': day.checkInTime ? new Date(day.checkInTime).toLocaleString() : '',
            'Check-Out Time': day.checkOutTime ? new Date(day.checkOutTime).toLocaleString() : '',
            'Total Hours': day.totalHours || 0,
            'Status': day.attendanceStatus,
            'Activity Count': day.activityCount,
            'Flags': day.flags.map((f: any) => f.message).join('; '),
            'Activities': day.activities.map((a: any) => 
              `${a.activityType}: ${a.title} (${a.duration || 0}min)`).join('; '),
          });
        });
      });

      const parser = new Parser();
      const csv = parser.parse(csvData);

      const filename = `Service-Person-Reports-${format(new Date(), 'yyyy-MM-dd')}.csv`;

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
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
