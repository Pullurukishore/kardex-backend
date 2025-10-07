"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.servicePersonReportsController = void 0;
const client_1 = require("@prisma/client");
const date_fns_1 = require("date-fns");
const pdfGenerator_1 = require("../utils/pdfGenerator");
const prisma = new client_1.PrismaClient();
exports.servicePersonReportsController = {
    // Get comprehensive service person reports with date range filtering
    async getServicePersonReports(req, res) {
        try {
            const userId = req.user?.id;
            const userRole = req.user?.role;
            if (!userId) {
                return res.status(401).json({ success: false, error: 'User not authenticated' });
            }
            if (!userRole || !['ADMIN', 'ZONE_USER', 'SERVICE_PERSON'].includes(userRole)) {
                return res.status(403).json({ success: false, error: 'Insufficient permissions' });
            }
            const { fromDate, toDate, servicePersonIds, zoneId, status, search, page = 1, limit = 50, } = req.query;
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
            const startDate = fromDate ? new Date(fromDate) : (0, date_fns_1.subDays)(new Date(), 30);
            const endDate = toDate ? new Date(toDate) : new Date();
            // Set to start/end of day for proper filtering
            const fromDateTime = (0, date_fns_1.startOfDay)(startDate);
            const toDateTime = (0, date_fns_1.endOfDay)(endDate);
            console.log('Processed date range:', { fromDateTime, toDateTime });
            const skip = (Number(page) - 1) * Number(limit);
            // Build service person filter
            const servicePersonWhere = {
                role: 'SERVICE_PERSON',
                isActive: true,
            };
            // For SERVICE_PERSON role, only show their own data
            if (userRole === 'SERVICE_PERSON') {
                servicePersonWhere.id = userId;
            }
            // Zone filtering for ZONE_USER
            if (userRole === 'ZONE_USER' || zoneId) {
                const zoneFilter = zoneId || req.user?.zoneIds?.[0];
                if (zoneFilter) {
                    servicePersonWhere.serviceZones = {
                        some: {
                            serviceZoneId: parseInt(zoneFilter),
                        },
                    };
                }
            }
            // Service person filtering (only for ADMIN and ZONE_USER)
            if (userRole !== 'SERVICE_PERSON' && servicePersonIds && servicePersonIds !== 'all') {
                const personIds = Array.isArray(servicePersonIds)
                    ? servicePersonIds.map((id) => parseInt(id))
                    : servicePersonIds.split(',').map((id) => parseInt(id.trim()));
                servicePersonWhere.id = { in: personIds };
            }
            // Search filtering
            if (search) {
                servicePersonWhere.OR = [
                    { name: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
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
            const servicePersonReports = await Promise.all(servicePersons.map(async (person) => {
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
                // Get ticket performance metrics for this service person
                const ticketMetrics = await calculateServicePersonTicketMetrics(person.id, fromDateTime, toDateTime);
                console.log(`Calculated ticket metrics for ${person.email}:`, ticketMetrics);
                // Process day-wise breakdown
                const daysInRange = (0, date_fns_1.eachDayOfInterval)({
                    start: fromDateTime,
                    end: toDateTime,
                });
                const dayWiseBreakdown = daysInRange.map((day) => {
                    const dayStart = (0, date_fns_1.startOfDay)(day);
                    const dayEnd = (0, date_fns_1.endOfDay)(day);
                    const dayKey = (0, date_fns_1.format)(day, 'yyyy-MM-dd');
                    // Find attendance for this day
                    const dayAttendance = attendanceRecords.find((att) => {
                        const checkInDay = att.checkInAt ? (0, date_fns_1.format)(att.checkInAt, 'yyyy-MM-dd') : null;
                        const checkOutDay = att.checkOutAt ? (0, date_fns_1.format)(att.checkOutAt, 'yyyy-MM-dd') : null;
                        return checkInDay === dayKey || checkOutDay === dayKey;
                    });
                    // Find activities for this day
                    const dayActivities = activities.filter((activity) => {
                        const activityDay = (0, date_fns_1.format)(activity.startTime, 'yyyy-MM-dd');
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
                        }
                        else if (dayAttendance.checkInAt) {
                            attendanceStatus = 'CHECKED_IN';
                        }
                    }
                    // Check for flags
                    const flags = [];
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
                        activities: dayActivities.map((act) => ({
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
                // Calculate summary - count unique days with check-ins, not total records
                const uniqueCheckInDays = new Set(attendanceRecords
                    .filter(att => att.checkInAt)
                    .map(att => {
                    const checkInDate = new Date(att.checkInAt);
                    return (0, date_fns_1.format)(checkInDate, 'yyyy-MM-dd');
                })).size;
                const presentDays = uniqueCheckInDays;
                const absentDays = dayWiseBreakdown.length - presentDays;
                const autoCheckouts = dayWiseBreakdown.filter((day) => day.flags.some((f) => f.type === 'AUTO_CHECKOUT')).length;
                const totalHours = dayWiseBreakdown.reduce((sum, day) => sum + (day.totalHours || 0), 0);
                const activitiesLogged = dayWiseBreakdown.reduce((sum, day) => sum + day.activityCount, 0);
                // Check for late check-ins
                const lateCheckIns = dayWiseBreakdown.filter((day) => {
                    if (!day.checkInTime)
                        return false;
                    const checkInHour = new Date(day.checkInTime).getHours();
                    return checkInHour >= 10; // After 10 AM is considered late
                }).length;
                // Initialize flags array for this service person
                const servicePersonFlags = [];
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
                    serviceZones: person.serviceZones.map((sz) => ({
                        id: sz.serviceZone.id,
                        name: sz.serviceZone.name,
                    })),
                    dayWiseBreakdown,
                    summary: {
                        totalWorkingDays: presentDays,
                        totalDays: dayWiseBreakdown.length,
                        presentDays,
                        absentDays,
                        totalHours: parseFloat(totalHours.toFixed(2)),
                        totalActivities: activitiesLogged,
                        autoCheckouts,
                        lateCheckIns,
                        averageHoursPerDay: parseFloat(averageHoursPerDay.toFixed(2)),
                        // Performance metrics
                        totalTickets: ticketMetrics.totalTickets,
                        ticketsResolved: ticketMetrics.ticketsResolved,
                        averageResolutionTimeHours: ticketMetrics.averageResolutionTimeHours,
                        averageTravelTimeHours: ticketMetrics.averageTravelTimeHours,
                        averageOnsiteTimeHours: ticketMetrics.averageOnsiteTimeHours,
                        performanceScore: ticketMetrics.performanceScore,
                    },
                    flags: servicePersonFlags,
                };
            }));
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
        }
        catch (error) {
            console.error('Error in getServicePersonReports:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal server error',
                details: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    },
    // Get summary statistics for reports dashboard
    async getReportsSummary(req, res) {
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
            const endDate = toDate ? new Date(toDate) : new Date();
            const startDate = fromDate ? new Date(fromDate) : (0, date_fns_1.subDays)(endDate, 30);
            // Build where clause based on user role and filters
            let userWhereClause = {};
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
            }
            else if (userRole === 'SERVICE_PERSON') {
                userWhereClause.id = userId;
            }
            if (zoneId) {
                userWhereClause.serviceZones = {
                    some: { serviceZoneId: parseInt(zoneId) }
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
        }
        catch (error) {
            console.error('Get reports summary error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    // Get service persons list for filter dropdown
    async getServicePersons(req, res) {
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
            let whereClause = { role: 'SERVICE_PERSON' };
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
            }
            else if (userRole === 'SERVICE_PERSON') {
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
        }
        catch (error) {
            console.error('Get service persons error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    // Get service zones for filter dropdown
    async getServiceZones(req, res) {
        try {
            const userId = req.user?.id;
            const userRole = req.user?.role;
            if (!userId) {
                return res.status(401).json({ error: 'User not authenticated' });
            }
            if (!userRole || !['ADMIN', 'ZONE_USER', 'SERVICE_PERSON'].includes(userRole)) {
                return res.status(403).json({ error: 'Insufficient permissions' });
            }
            let whereClause = {};
            if (userRole === 'ZONE_USER') {
                const zoneUser = await prisma.user.findUnique({
                    where: { id: userId },
                    include: { serviceZones: true },
                });
                if (!zoneUser?.serviceZones?.length) {
                    return res.status(403).json({ error: 'No zones assigned to user' });
                }
                whereClause.id = { in: zoneUser.serviceZones.map(z => z.serviceZoneId) };
            }
            else if (userRole === 'SERVICE_PERSON') {
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
        }
        catch (error) {
            console.error('Get service zones error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    // Export service person reports (handles both performance and attendance based on reportType query param)
    async exportServicePersonReports(req, res) {
        try {
            const { reportType = 'performance' } = req.query;
            // Route to appropriate export function based on reportType
            if (reportType === 'attendance') {
                return await exports.servicePersonReportsController.exportServicePersonAttendanceReports(req, res);
            }
            else {
                return await exports.servicePersonReportsController.exportServicePersonPerformanceReports(req, res);
            }
        }
        catch (error) {
            console.error('Export reports routing error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    // Export service person performance reports to PDF
    async exportServicePersonPerformanceReports(req, res) {
        try {
            const userId = req.user?.id;
            const userRole = req.user?.role;
            if (!userId) {
                return res.status(401).json({ error: 'User not authenticated' });
            }
            if (!userRole || !['ADMIN', 'ZONE_USER', 'SERVICE_PERSON'].includes(userRole)) {
                return res.status(403).json({ error: 'Insufficient permissions' });
            }
            const { fromDate, toDate, servicePersonIds, zoneId, status, search, format = 'pdf' } = req.query;
            // Parse date range
            const startDate = fromDate ? new Date(fromDate) : (0, date_fns_1.subDays)(new Date(), 30);
            const endDate = toDate ? new Date(toDate) : new Date();
            const fromDateTime = (0, date_fns_1.startOfDay)(startDate);
            const toDateTime = (0, date_fns_1.endOfDay)(endDate);
            // Build where clause for filtering
            const servicePersonWhere = {
                role: 'SERVICE_PERSON',
                isActive: true,
            };
            // For SERVICE_PERSON role, only show their own data
            if (userRole === 'SERVICE_PERSON') {
                servicePersonWhere.id = userId;
            }
            // Zone filtering for ZONE_USER
            if (userRole === 'ZONE_USER' || zoneId) {
                const zoneFilter = zoneId || req.user?.zoneIds?.[0];
                if (zoneFilter) {
                    servicePersonWhere.serviceZones = {
                        some: {
                            serviceZoneId: parseInt(zoneFilter),
                        },
                    };
                }
            }
            // Service person filtering (only for ADMIN and ZONE_USER)
            if (userRole !== 'SERVICE_PERSON' && servicePersonIds && servicePersonIds !== 'all') {
                const personIds = Array.isArray(servicePersonIds)
                    ? servicePersonIds.map(id => parseInt(id))
                    : servicePersonIds.split(',').map(id => parseInt(id.trim()));
                servicePersonWhere.id = { in: personIds };
            }
            // Search filtering
            if (search) {
                servicePersonWhere.OR = [
                    { name: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
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
            // Process each service person to get performance summary data
            const performanceData = await Promise.all(servicePersons.map(async (person) => {
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
                // Get activities for the date range
                const activities = await prisma.dailyActivityLog.findMany({
                    where: {
                        userId: person.id,
                        startTime: {
                            gte: fromDateTime,
                            lte: toDateTime,
                        },
                    },
                    orderBy: {
                        startTime: 'asc',
                    },
                });
                // Get ticket performance metrics
                const ticketMetrics = await calculateServicePersonTicketMetrics(person.id, fromDateTime, toDateTime);
                // Calculate summary metrics - count unique days with check-ins, not total records
                const uniqueCheckInDays = new Set(attendanceRecords
                    .filter(att => att.checkInAt)
                    .map(att => {
                    const checkInDate = new Date(att.checkInAt);
                    return (0, date_fns_1.format)(checkInDate, 'yyyy-MM-dd');
                })).size;
                const presentDays = uniqueCheckInDays;
                const totalHours = attendanceRecords.reduce((sum, att) => sum + (Number(att.totalHours) || 0), 0);
                const activitiesLogged = activities.length;
                const autoCheckouts = attendanceRecords.filter(att => att.notes?.includes('Auto-checkout')).length;
                const averageHoursPerDay = presentDays > 0 ? (totalHours / presentDays) : 0;
                // Calculate flags
                const flags = [];
                const lateCheckIns = attendanceRecords.filter(att => {
                    if (!att.checkInAt)
                        return false;
                    const checkInHour = new Date(att.checkInAt).getHours();
                    return checkInHour >= 10;
                }).length;
                if (lateCheckIns > 0) {
                    flags.push({ type: 'LATE', message: `${lateCheckIns} late check-in(s)` });
                }
                if (autoCheckouts > 0) {
                    flags.push({ type: 'AUTO_CHECKOUT', message: `${autoCheckouts} auto checkout(s)` });
                }
                return {
                    name: person.name,
                    email: person.email,
                    zones: person.serviceZones.map(sz => sz.serviceZone.name),
                    summary: {
                        totalWorkingDays: presentDays,
                        presentDays,
                        totalHours: parseFloat(totalHours.toFixed(2)),
                        totalTickets: ticketMetrics.totalTickets,
                        ticketsResolved: ticketMetrics.ticketsResolved,
                        averageResolutionTimeHours: ticketMetrics.averageResolutionTimeHours,
                        averageTravelTimeHours: ticketMetrics.averageTravelTimeHours,
                        averageOnsiteTimeHours: ticketMetrics.averageOnsiteTimeHours,
                        performanceScore: ticketMetrics.performanceScore,
                        totalActivities: activitiesLogged,
                        autoCheckouts,
                        averageHoursPerDay: parseFloat(averageHoursPerDay.toFixed(2)),
                    },
                    flags,
                };
            }));
            const filters = {
                from: fromDate,
                to: toDate,
                reportType: 'service-person-performance'
            };
            // Get the appropriate columns for the report type
            const columns = (0, pdfGenerator_1.getPdfColumns)('service-person-performance');
            // Generate PDF or Excel based on format
            if (format === 'excel') {
                const { generateExcel, getExcelColumns } = await Promise.resolve().then(() => __importStar(require('../utils/excelGenerator')));
                const excelColumns = getExcelColumns('service-person-performance');
                await generateExcel(res, performanceData, excelColumns, 'Service Person Performance Report', filters);
            }
            else {
                await (0, pdfGenerator_1.generatePdf)(res, performanceData, columns, 'Service Person Performance Report', filters);
            }
        }
        catch (error) {
            console.error('Export performance reports error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    // Export service person attendance reports to PDF/Excel
    async exportServicePersonAttendanceReports(req, res) {
        try {
            const userId = req.user?.id;
            const userRole = req.user?.role;
            if (!userId) {
                return res.status(401).json({ error: 'User not authenticated' });
            }
            if (!userRole || !['ADMIN', 'ZONE_USER', 'SERVICE_PERSON'].includes(userRole)) {
                return res.status(403).json({ error: 'Insufficient permissions' });
            }
            const { fromDate, toDate, servicePersonIds, zoneId, status, search, format = 'pdf' } = req.query;
            // Parse date range
            const startDate = fromDate ? new Date(fromDate) : (0, date_fns_1.subDays)(new Date(), 30);
            const endDate = toDate ? new Date(toDate) : new Date();
            const fromDateTime = (0, date_fns_1.startOfDay)(startDate);
            const toDateTime = (0, date_fns_1.endOfDay)(endDate);
            // Build where clause for filtering (same as performance report)
            const servicePersonWhere = {
                role: 'SERVICE_PERSON',
                isActive: true,
            };
            if (userRole === 'SERVICE_PERSON') {
                servicePersonWhere.id = userId;
            }
            if (userRole === 'ZONE_USER' || zoneId) {
                const zoneFilter = zoneId || req.user?.zoneIds?.[0];
                if (zoneFilter) {
                    servicePersonWhere.serviceZones = {
                        some: {
                            serviceZoneId: parseInt(zoneFilter),
                        },
                    };
                }
            }
            if (userRole !== 'SERVICE_PERSON' && servicePersonIds && servicePersonIds !== 'all') {
                const personIds = Array.isArray(servicePersonIds)
                    ? servicePersonIds.map(id => parseInt(id))
                    : servicePersonIds.split(',').map(id => parseInt(id.trim()));
                servicePersonWhere.id = { in: personIds };
            }
            if (search) {
                servicePersonWhere.OR = [
                    { name: { contains: search, mode: 'insensitive' } },
                    { email: { contains: search, mode: 'insensitive' } },
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
            // Process each service person to get attendance summary data
            const attendanceData = await Promise.all(servicePersons.map(async (person) => {
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
                // Get activities for the date range
                const activities = await prisma.dailyActivityLog.findMany({
                    where: {
                        userId: person.id,
                        startTime: {
                            gte: fromDateTime,
                            lte: toDateTime,
                        },
                    },
                    orderBy: {
                        startTime: 'asc',
                    },
                });
                // Generate date range for analysis
                const daysInRange = (0, date_fns_1.eachDayOfInterval)({
                    start: fromDateTime,
                    end: toDateTime,
                });
                // Calculate summary metrics - count unique days with check-ins, not total records
                const uniqueCheckInDays = new Set(attendanceRecords
                    .filter(att => att.checkInAt)
                    .map(att => {
                    const checkInDate = new Date(att.checkInAt);
                    return (0, date_fns_1.format)(checkInDate, 'yyyy-MM-dd');
                })).size;
                const presentDays = uniqueCheckInDays;
                const absentDays = daysInRange.length - presentDays;
                const totalHours = attendanceRecords.reduce((sum, att) => sum + (Number(att.totalHours) || 0), 0);
                const activitiesLogged = activities.length;
                const autoCheckouts = attendanceRecords.filter(att => att.notes?.includes('Auto-checkout')).length;
                const averageHoursPerDay = presentDays > 0 ? (totalHours / presentDays) : 0;
                // Calculate flags
                const flags = [];
                const lateCheckIns = attendanceRecords.filter(att => {
                    if (!att.checkInAt)
                        return false;
                    const checkInHour = new Date(att.checkInAt).getHours();
                    return checkInHour >= 10;
                }).length;
                if (lateCheckIns > 0) {
                    flags.push({ type: 'LATE', message: `${lateCheckIns} late check-in(s)` });
                }
                if (autoCheckouts > 0) {
                    flags.push({ type: 'AUTO_CHECKOUT', message: `${autoCheckouts} auto checkout(s)` });
                }
                if (absentDays > 0) {
                    flags.push({ type: 'ABSENT', message: `${absentDays} absent day(s)` });
                }
                return {
                    name: person.name,
                    email: person.email,
                    zones: person.serviceZones.map(sz => sz.serviceZone.name),
                    summary: {
                        totalWorkingDays: presentDays,
                        presentDays,
                        absentDays,
                        totalHours: parseFloat(totalHours.toFixed(2)),
                        averageHoursPerDay: parseFloat(averageHoursPerDay.toFixed(2)),
                        totalActivities: activitiesLogged,
                        autoCheckouts,
                    },
                    flags,
                };
            }));
            const filters = {
                from: fromDate,
                to: toDate,
                reportType: 'service-person-attendance'
            };
            // Get the appropriate columns for the report type
            const columns = (0, pdfGenerator_1.getPdfColumns)('service-person-attendance');
            // Generate PDF or Excel based on format
            if (format === 'excel') {
                const { generateExcel, getExcelColumns } = await Promise.resolve().then(() => __importStar(require('../utils/excelGenerator')));
                const excelColumns = getExcelColumns('service-person-attendance');
                await generateExcel(res, attendanceData, excelColumns, 'Service Person Attendance Report', filters);
            }
            else {
                await (0, pdfGenerator_1.generatePdf)(res, attendanceData, columns, 'Service Person Attendance Report', filters);
            }
        }
        catch (error) {
            console.error('Export attendance reports error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
    // Get detailed activity logs for a specific service person and date
    async getActivityDetails(req, res) {
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
            const startOfTargetDate = (0, date_fns_1.startOfDay)(targetDate);
            const endOfTargetDate = (0, date_fns_1.endOfDay)(targetDate);
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
                    date: (0, date_fns_1.format)(targetDate, 'yyyy-MM-dd'),
                    attendance,
                    activities,
                },
            });
        }
        catch (error) {
            console.error('Get activity details error:', error);
            res.status(500).json({ error: 'Internal server error' });
        }
    },
};
// Helper function to calculate comprehensive ticket performance metrics for a service person
async function calculateServicePersonTicketMetrics(servicePersonId, fromDate, toDate) {
    try {
        // Get all tickets assigned to this service person in the date range
        const tickets = await prisma.ticket.findMany({
            where: {
                assignedToId: servicePersonId,
                createdAt: {
                    gte: fromDate,
                    lte: toDate,
                },
            },
            include: {
                statusHistory: {
                    orderBy: {
                        changedAt: 'asc',
                    },
                },
            },
        });
        const totalTickets = tickets.length;
        const ticketsResolved = tickets.filter(t => t.status === 'CLOSED' || t.status === 'RESOLVED').length;
        if (totalTickets === 0) {
            return {
                totalTickets: 0,
                ticketsResolved: 0,
                averageResolutionTimeHours: 0,
                averageTravelTimeHours: 0,
                averageOnsiteTimeHours: 0,
                performanceScore: 0,
            };
        }
        // Calculate average resolution time (creation to CLOSED/RESOLVED)
        const resolutionTimes = [];
        const travelTimes = [];
        const onsiteTimes = [];
        for (const ticket of tickets) {
            // Resolution time calculation
            if (ticket.status === 'CLOSED' || ticket.status === 'RESOLVED') {
                const resolutionTime = (0, date_fns_1.differenceInMinutes)(ticket.updatedAt, ticket.createdAt);
                if (resolutionTime > 0) {
                    resolutionTimes.push(resolutionTime);
                }
            }
            // Travel and onsite time calculations from status history
            const statusHistory = ticket.statusHistory;
            if (statusHistory.length > 0) {
                // Travel time: ONSITE_VISIT_STARTED to ONSITE_VISIT_REACHED + ONSITE_VISIT_RESOLVED to ONSITE_VISIT_COMPLETED
                const goingStart = statusHistory.find(h => h.status === 'ONSITE_VISIT_STARTED');
                const goingEnd = statusHistory.find(h => h.status === 'ONSITE_VISIT_REACHED');
                const returnStart = statusHistory.find(h => h.status === 'ONSITE_VISIT_RESOLVED');
                const returnEnd = statusHistory.find(h => h.status === 'ONSITE_VISIT_COMPLETED');
                let ticketTravelTime = 0;
                // Going travel time
                if (goingStart && goingEnd && goingStart.changedAt < goingEnd.changedAt) {
                    ticketTravelTime += (0, date_fns_1.differenceInMinutes)(goingEnd.changedAt, goingStart.changedAt);
                }
                // Return travel time
                if (returnStart && returnEnd && returnStart.changedAt < returnEnd.changedAt) {
                    ticketTravelTime += (0, date_fns_1.differenceInMinutes)(returnEnd.changedAt, returnStart.changedAt);
                }
                if (ticketTravelTime > 0) {
                    travelTimes.push(ticketTravelTime);
                }
                // Onsite work time: ONSITE_VISIT_IN_PROGRESS to ONSITE_VISIT_RESOLVED
                const onsiteStart = statusHistory.find(h => h.status === 'ONSITE_VISIT_IN_PROGRESS');
                const onsiteEnd = statusHistory.find(h => h.status === 'ONSITE_VISIT_RESOLVED');
                if (onsiteStart && onsiteEnd && onsiteStart.changedAt < onsiteEnd.changedAt) {
                    const onsiteTime = (0, date_fns_1.differenceInMinutes)(onsiteEnd.changedAt, onsiteStart.changedAt);
                    if (onsiteTime > 0) {
                        onsiteTimes.push(onsiteTime);
                    }
                }
            }
        }
        // Calculate averages in hours (rounded to 1 decimal place)
        const averageResolutionTimeHours = resolutionTimes.length > 0
            ? Math.round((resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length) / 60 * 10) / 10
            : 0;
        const averageTravelTimeHours = travelTimes.length > 0
            ? Math.round((travelTimes.reduce((sum, time) => sum + time, 0) / travelTimes.length) / 60 * 10) / 10
            : 0;
        const averageOnsiteTimeHours = onsiteTimes.length > 0
            ? Math.round((onsiteTimes.reduce((sum, time) => sum + time, 0) / onsiteTimes.length) / 60 * 10) / 10
            : 0;
        // Calculate performance score (0-100)
        // Factors: resolution rate (40%), speed (30%), efficiency (30%)
        const resolutionRate = totalTickets > 0 ? (ticketsResolved / totalTickets) * 100 : 0;
        // Speed score: inverse of resolution time (faster = better score)
        // Assume 4 hours as baseline good resolution time
        const speedScore = averageResolutionTimeHours > 0
            ? Math.max(0, Math.min(100, 100 - (averageResolutionTimeHours - 4) * 6))
            : 50;
        // Efficiency score: combination of travel and onsite time efficiency
        // Assume 1 hour travel + 2 hours onsite as baseline (3 hours total)
        const totalWorkTimeHours = averageTravelTimeHours + averageOnsiteTimeHours;
        const efficiencyScore = totalWorkTimeHours > 0
            ? Math.max(0, Math.min(100, 100 - (totalWorkTimeHours - 3) * 10))
            : 50;
        const performanceScore = Math.round((resolutionRate * 0.4) + (speedScore * 0.3) + (efficiencyScore * 0.3));
        return {
            totalTickets,
            ticketsResolved,
            averageResolutionTimeHours,
            averageTravelTimeHours,
            averageOnsiteTimeHours,
            performanceScore: Math.max(0, Math.min(100, performanceScore)),
        };
    }
    catch (error) {
        console.error('Error calculating service person ticket metrics:', error);
        return {
            totalTickets: 0,
            ticketsResolved: 0,
            averageResolutionTimeHours: 0,
            averageTravelTimeHours: 0,
            averageOnsiteTimeHours: 0,
            performanceScore: 0,
        };
    }
}
