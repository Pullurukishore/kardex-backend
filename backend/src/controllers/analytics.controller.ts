// import { Request, Response } from 'express';
// import { 
//   Prisma, 
//   TicketStatus, 
//   Priority,
//   User,
//   Ticket
// } from '@prisma/client';
// import { UserRole } from '../config/auth';

// // Map Prisma enums to string literals for type safety
// // Use the actual TicketStatus enum values from Prisma
// const ResolvedTicketStatuses = [
//   'CLOSED' as const
// ];
// import prisma from '../config/db';
// import { subDays, startOfDay, endOfDay, startOfMonth, endOfMonth, isAfter, isBefore } from 'date-fns';
// // Remove duplicate import of AuthenticatedRequest

// // Helper function to get user from request
// function getUserFromRequest(req: Request) {
//   return (req as any).user;
// }

// // Extended user type to include customerId when role is CUSTOMER_OWNER
// type AuthenticatedUser = User & {
//   customerId?: number;
//   serviceZones?: Array<{ id: number }>;
// };

// // Extended ticket type with resolved fields
// type ResolvedTicket = Ticket & {
//   updatedAt: Date;
//   resolutionTimeHours: number;
//   withinSla: boolean;
// };

// interface DateRange {
//   startDate: Date;
//   endDate: Date;
// }

// interface TicketStats {
//   status: TicketStatus;
//   count: number;
// }

// interface ServicePersonStats {
//   id: string;
//   name: string | null;
//   email: string;
//   ticketCount: number;
//   avgResolutionTime: number;
// }

// interface SlaMetrics {
//   priority: Priority;
//   total: number;
//   compliant: number;
//   avgResolutionTime: number;
//   tickets: ResolvedTicket[];
// }

// interface FeedbackItem {
//   id: number;
//   rating: number;
//   feedback: string | null;
//   createdAt: Date;
//   ticket: {
//     id: number;
//     title: string;
//     priority: Priority;
//     status: TicketStatus;
//     customer: {
//       id: number;
//       companyName: string;
//     };
//     assignedTo: {
//       id: string;
//       name: string | null;
//     } | null;
//   };
// }

// interface ServicePersonRating {
//   id: string;
//   name: string | null;
//   totalRatings: number;
//   totalScore: number;
//   avgRating: number;
// }

// // Helper to get date range based on period
// function getDateRange(period: string): DateRange {
//   const now = new Date();
  
//   switch (period) {
//     case 'today':
//       return {
//         startDate: startOfDay(now),
//         endDate: endOfDay(now)
//       };
//     case 'yesterday':
//       const yesterday = subDays(now, 1);
//       return {
//         startDate: startOfDay(yesterday),
//         endDate: endOfDay(yesterday)
//       };
//     case 'this_week':
//       return {
//         startDate: subDays(now, 7),
//         endDate: now
//       };
//     case 'this_month':
//       return {
//         startDate: startOfMonth(now),
//         endDate: now
//       };
//     case 'last_month':
//       const lastMonth = subDays(startOfMonth(now), 1);
//       return {
//         startDate: startOfMonth(lastMonth),
//         endDate: endOfMonth(lastMonth)
//       };
//     default:
//       return {
//         startDate: subDays(now, 30),
//         endDate: now
//       };
//   }
// }

// // Import the AuthUser type from express.d.ts
// import { AuthUser, AuthenticatedRequest } from '../types/express';

// // Extend the AuthenticatedRequest interface to include query parameters
// export interface AnalyticsRequest extends AuthenticatedRequest {
//   query: {
//     period?: string;
//     [key: string]: string | string[] | undefined;
//   };
// }

// // Get ticket statistics
// export const getTicketStats = async (req: Request, res: Response) => {
//   try {
//     const user = getUserFromRequest(req);
//     if (!user) {
//       return res.status(401).json({ error: 'Authentication required' });
//     }

//     const { period = '30d' } = req.query;
//     const dateRange = getDateRange(period as string);
    
//     // Role-based filtering
//     let whereClause = Prisma.sql`WHERE createdAt BETWEEN ${dateRange.startDate} AND ${dateRange.endDate}`;
    
//     if (user.role === 'SERVICE_PERSON') {
//       whereClause = Prisma.sql`WHERE assignedToId = ${user.id} AND createdAt BETWEEN ${dateRange.startDate} AND ${dateRange.endDate}`;
//     } else if (user.role === 'CUSTOMER_OWNER' && user.customerId) {
//       whereClause = Prisma.sql`WHERE customerId = ${user.customerId} AND createdAt BETWEEN ${dateRange.startDate} AND ${dateRange.endDate}`;
//     }

//     const statusCounts = await prisma.ticket.groupBy({
//       by: ['status'],
//       _count: { id: true },
//       where: {
//         createdAt: {
//           gte: dateRange.startDate,
//           lte: dateRange.endDate
//         }
//       }
//     });
    
//     // Define the type for resolved tickets
//     interface ResolvedTicket {
//       createdAt: Date;
//       updatedAt: Date | null;
//     }

//     const resolvedTickets = await prisma.ticket.findMany({
//       where: {
//         ...whereClause,
//         status: { in: ResolvedTicketStatuses as any },
//         updatedAt: { not: undefined }
//       },
//       select: {
//         id: true,
//         createdAt: true,
//         updatedAt: true,
//         status: true
//       }
//     }) as ResolvedTicket[];
    
//     // Calculate resolution times in hours
//     const resolutionTimes = resolvedTickets
//       .filter((ticket): ticket is { createdAt: Date; updatedAt: Date } => {
//         return ticket.updatedAt !== null;
//       })
//       .map(ticket => {
//         const diffMs = ticket.updatedAt.getTime() - ticket.createdAt.getTime();
//         return diffMs / (1000 * 60 * 60); // Convert to hours
//       });
    
//     // Calculate average resolution time
//     const avgResolutionTime = resolutionTimes.length > 0 
//       ? resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length 
//       : 0;
    
//     const ticketTrends = await prisma.$queryRaw<Array<{ date: Date; count: number }>>`
//       SELECT 
//         DATE(createdAt) as date,
//         COUNT(*) as count
//       FROM Ticket
//       WHERE createdAt BETWEEN ${dateRange.startDate} AND ${dateRange.endDate}
//       ${user.role === UserRole.CUSTOMER_OWNER ? Prisma.sql`AND customerId = ${user.customerId}` : Prisma.empty}
//       ${user.role === UserRole.SERVICE_PERSON ? Prisma.sql`AND (assignedToId = ${user.id} OR assignedToId IN (
//         SELECT userId FROM ServiceZoneUser WHERE userId = ${user.id}
//       ))` : Prisma.empty}
//       GROUP BY DATE(createdAt)
//       ORDER BY date ASC
//     `;
    
//     let topCustomers: Array<{
//       id: number;
//       companyName: string;
//       _count: { tickets: number };
//     }> = [];
//     if (user.role === UserRole.ADMIN) {
//       topCustomers = await prisma.customer.findMany({
//         take: 5,
//         orderBy: {
//           tickets: {
//             _count: 'desc'
//           }
//         },
//         select: {
//           id: true,
//           companyName: true,
//           _count: {
//             select: { tickets: true }
//           }
//         },
//         where: {
//           tickets: {
//             some: {
//               createdAt: {
//                 gte: dateRange.startDate,
//                 lte: dateRange.endDate
//               }
//             }
//           }
//         }
//       });
//     }
    
//     // Define the service person stats type
//     interface ServicePersonStat {
//       id: string;
//       email: string;
//       totalTickets: number;
//       resolvedTickets: number;
//       avgResolutionTime: number;
//     }
    
//     let servicePersonStats: ServicePersonStat[] = [];
    
//     if (user.role === UserRole.ADMIN) {
//       // First get all service persons with their ticket counts
//       const servicePersons = await prisma.user.findMany({
//         where: {
//           role: UserRole.SERVICE_PERSON,
//           isActive: true
//         },
//         select: {
//           id: true,
//           email: true
//         }
//       });

//       // Get ticket counts for each service person
//       const ticketCounts = await Promise.all(
//         servicePersons.map(async (person) => {
//           const [totalTickets, resolvedTickets] = await Promise.all([
//             prisma.ticket.count({
//               where: {
//                 assignedToId: person.id,
//                 createdAt: { gte: dateRange.startDate, lte: dateRange.endDate }
//               }
//             }),
//             prisma.ticket.count({
//               where: {
//                 assignedToId: person.id,
//                 status: 'CLOSED' as TicketStatus,
//                 updatedAt: { not: undefined },
//                 createdAt: { gte: dateRange.startDate, lte: dateRange.endDate }
//               }
//             })
//           ]);

//           // Get resolution times for closed tickets
//           const resolvedTicketsData = await prisma.ticket.findMany({
//             where: {
//               assignedToId: person.id,
//               status: 'CLOSED' as TicketStatus,
//               updatedAt: { not: undefined },
//               createdAt: { gte: dateRange.startDate, lte: dateRange.endDate }
//             },
//             select: {
//               createdAt: true,
//               updatedAt: true
//             }
//           });

//           // Calculate average resolution time
//           let avgResolutionTime = 0;
//           if (resolvedTicketsData.length > 0) {
//             const totalHours = resolvedTicketsData.reduce((sum, ticket) => {
//               if (ticket.updatedAt) {
//                 const hours = (ticket.updatedAt.getTime() - ticket.createdAt.getTime()) / (1000 * 60 * 60);
//                 return sum + hours;
//               }
//               return sum;
//             }, 0);
//             avgResolutionTime = totalHours / resolvedTicketsData.length;
//           }

//           return {
//             id: person.id.toString(),
//             email: person.email,
//             totalTickets,
//             resolvedTickets,
//             avgResolutionTime: Math.round(avgResolutionTime * 10) / 10
//           };
//         })
//       );

//       // Sort by resolved tickets
//       servicePersonStats = ticketCounts.sort((a, b) => b.resolvedTickets - a.resolvedTickets);
//     }
    
//     const statusCountsMap = statusCounts.reduce((acc: Record<string, number>, { status, _count }) => ({
//       ...acc,
//       [status.toLowerCase()]: _count.id
//     }), {});
    
//     const totalTickets = statusCounts.reduce((sum, { _count }) => sum + _count.id, 0);
//     const openTickets = statusCounts
//       .filter(({ status }) => [
//         'OPEN' as TicketStatus, 
//         'IN_PROGRESS' as TicketStatus, 
//         'WAITING_FOR_RESPONSE' as TicketStatus,
//         'SPARE_NEEDED' as TicketStatus,
//         'WAITING_FOR_PO' as TicketStatus
//       ].includes(status))
//       .reduce((sum, { _count }) => sum + _count.id, 0);
    
//     return res.json({
//       period: { startDate: dateRange.startDate, endDate: dateRange.endDate },
//       summary: {
//         totalTickets,
//         openTickets,
//         resolvedTickets: statusCountsMap['fixed_pending_closure'] || 0,
//         closedTickets: statusCountsMap['closed'] || 0,
//         avgResolutionTime: Math.round(avgResolutionTime * 10) / 10
//       },
//       statusDistribution: statusCountsMap,
//       trends: ticketTrends,
//       ...(user.role === UserRole.ADMIN && {
//         topCustomers,
//         servicePersonStats
//       })
//     });
//   } catch (error) {
//     console.error('Error getting ticket stats:', error);
//     return res.status(500).json({ error: 'Failed to get ticket statistics' });
//   }
// };

// // Get SLA metrics
// export const getSlaMetrics = async (req: AnalyticsRequest, res: Response) => {
//   try {
//     const { period = '30d' } = req.query;
//     const user = req.user;
    
//     if (!user) {
//       return res.status(401).json({ error: 'Unauthorized' });
//     }
    
//     const { startDate, endDate } = getDateRange(period as string);
    
//     const where: Prisma.TicketWhereInput = {
//       createdAt: {
//         gte: startDate,
//         lte: endDate
//       },
//       status: { in: ['CLOSED' as TicketStatus] },
//       updatedAt: { not: undefined }
//     };
    
//     if (user.role === UserRole.CUSTOMER_OWNER || user.role === UserRole.CUSTOMER_CONTACT) {
//       where.customerId = user.customerId;
//     } else if (user.role === UserRole.SERVICE_PERSON) {
//       where.OR = [
//         { assignedToId: user.id },
//         { assignedTo: { serviceZones: { some: { userId: user.id } } } }
//       ];
//     }
    
//     const resolvedTickets = await prisma.ticket.findMany({
//       where,
//       select: {
//         id: true,
//         priority: true,
//         createdAt: true,
//         updatedAt: true,
//         customer: {
//           select: {
//             id: true,
//             companyName: true
//           }
//         },
//         assignedTo: {
//           select: {
//             id: true,
//             // Remove name as it's not in UserSelect
//           }
//         }
//       },
//       orderBy: {
//         updatedAt: 'desc'
//       }
//     });
    
//     const slaMetrics = resolvedTickets.map(ticket => {
//       const resolutionTimeHours = ((ticket.updatedAt as Date).getTime() - ticket.createdAt.getTime()) / (1000 * 60 * 60);
      
//       const slaThresholds: Record<string, number> = {
//         'URGENT': 4,
//         'HIGH': 8,
//         'MEDIUM': 24,
//         'LOW': 72
//       };
      
//       const threshold = slaThresholds[ticket.priority] || 24;
//       const withinSla = resolutionTimeHours <= threshold;
      
//       return {
//         ...ticket,
//         resolutionTimeHours: Math.round(resolutionTimeHours * 10) / 10,
//         slaThreshold: threshold,
//         withinSla
//       };
//     });
    
//     const totalResolved = slaMetrics.length;
//     const compliantTickets = slaMetrics.filter(ticket => ticket.withinSla).length;
//     const complianceRate = totalResolved > 0 
//       ? Math.round((compliantTickets / totalResolved) * 100) 
//       : 0;
    
//     const priorityMetrics = slaMetrics.reduce((acc: Record<string, {
//       total: number;
//       compliant: number;
//       avgResolutionTime: number;
//       tickets: any[];
//     }>, ticket) => {
//       if (!acc[ticket.priority]) {
//         acc[ticket.priority] = {
//           total: 0,
//           compliant: 0,
//           avgResolutionTime: 0,
//           tickets: []
//         };
//       }
      
//       acc[ticket.priority].total++;
//       if (ticket.withinSla) acc[ticket.priority].compliant++;
//       acc[ticket.priority].tickets.push(ticket);
      
//       return acc;
//     }, {});
    
//     Object.entries(priorityMetrics).forEach(([priority, data]) => {
//       const totalTime = data.tickets.reduce((sum: number, t: any) => sum + t.resolutionTimeHours, 0);
//       priorityMetrics[priority].avgResolutionTime = data.tickets.length > 0 
//         ? Math.round((totalTime / data.tickets.length) * 10) / 10 
//         : 0;
//     });
    
//     return res.json({
//       period: { startDate, endDate },
//       summary: {
//         totalResolved,
//         compliantTickets,
//         complianceRate,
//         avgResolutionTime: Math.round(
//           slaMetrics.reduce((sum: number, t: any) => sum + t.resolutionTimeHours, 0) / (totalResolved || 1) * 10
//         ) / 10
//       },
//       byPriority: priorityMetrics,
//       tickets: slaMetrics
//     });
//   } catch (error) {
//     console.error('Error getting SLA metrics:', error);
//     return res.status(500).json({ error: 'Failed to get SLA metrics' });
//   }
// };

// // Get customer satisfaction metrics
// export const getCustomerSatisfaction = async (req: AuthenticatedRequest, res: Response) => {
//   try {
//     const { period = '30d' } = req.query as { period?: string };
//     const user = req.user as AuthenticatedUser;
    
//     if (!user) {
//       return res.status(401).json({ error: 'Unauthorized' });
//     }

//     // Since we don't have a feedback model, we'll return empty data for now
//     // In a real implementation, you would need to:
//     // 1. Create a feedback model in the Prisma schema
//     // 2. Implement feedback collection in your application
//     // 3. Update this function to query the actual feedback data
    
//     const { startDate, endDate } = getDateRange(period as string);
    
//     // Mock data structure - replace with actual implementation when feedback model is available
//     const feedbackData: Array<{
//       id: number;
//       rating: number;
//       feedback: string | null;
//       createdAt: Date;
//       ticket: {
//         id: number;
//         title: string;
//         priority: Priority;
//         status: TicketStatus;
//         customer: {
//           id: number;
//           companyName: string;
//         };
//         assignedTo: {
//           id: string;
//           name: string | null;
//         } | null;
//       };
//     }> = [];

//     const totalRatings = feedbackData.length;
//     const totalScore = feedbackData.reduce((sum, { rating }) => sum + rating, 0);
//     const avgRating = totalRatings > 0 ? Math.round((totalScore / totalRatings) * 10) / 10 : 0;
    
//     // Initialize rating distribution with all possible ratings (1-5)
//     const ratingDistribution = feedbackData.reduce<Record<number, number>>((acc, { rating }) => {
//       // Ensure rating is between 1 and 5
//       const validRating = Math.min(5, Math.max(1, Math.round(rating)));
//       acc[validRating] = (acc[validRating] || 0) + 1;
//       return acc;
//     }, { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
    
//     const promoters = feedbackData.filter(f => f.rating >= 4).length;
//     const detractors = feedbackData.filter(f => f.rating <= 2).length;
//     const nps = totalRatings > 0 
//       ? Math.round(((promoters - detractors) / totalRatings) * 100) 
//       : 0;
    
//     // Calculate service person ratings from feedback data
//     const servicePersonRatings = feedbackData
//       .filter(feedback => feedback.ticket.assignedTo)
//       .reduce<Record<string, {
//         totalRatings: number;
//         totalScore: number;
//         avgRating: number;
//       }>>((acc, { rating, ticket }) => {
//         if (!ticket.assignedTo) return acc;
        
//         const { id } = ticket.assignedTo;
//         if (!acc[id]) {
//           acc[id] = {
//             totalRatings: 0,
//             totalScore: 0,
//             avgRating: 0
//           };
//         }
        
//         acc[id].totalRatings += 1;
//         acc[id].totalScore += rating;
//         acc[id].avgRating = acc[id].totalScore / acc[id].totalRatings;
        
//         return acc;
//       }, {});
    
//     // Convert to array and format
//     const servicePersonRatingsArray: ServicePersonRating[] = [];
    
//     for (const [id, data] of Object.entries(servicePersonRatings)) {
//       // Find the corresponding service person to get their name
//       const servicePerson = feedbackData.find(f => f.ticket.assignedTo?.id === id)?.ticket.assignedTo;
      
//       if (servicePerson) {
//         servicePersonRatingsArray.push({
//           id,
//           name: servicePerson.name,
//           totalRatings: data.totalRatings,
//           totalScore: data.totalScore,
//           avgRating: parseFloat(data.avgRating.toFixed(1))
//         });
//       }
//     }

//     return res.json({
//       period: { startDate, endDate },
//       summary: {
//         totalRatings,
//         avgRating,
//         nps,
//         ratingDistribution,
//         feedbackCount: feedbackData.length
//       },
//       ...(user.role === UserRole.ADMIN && { servicePersonRatings: servicePersonRatingsArray }),
//       feedback: feedbackData
//     });
//   } catch (error) {
//     console.error('Error getting customer satisfaction metrics:', error);
//     return res.status(500).json({ 
//       error: 'Customer satisfaction metrics are not yet implemented. Please implement a feedback system first.' 
//     });
//   }
// };