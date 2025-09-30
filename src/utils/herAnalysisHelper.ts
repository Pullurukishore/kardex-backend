import { PrismaClient } from '@prisma/client';
import { differenceInMinutes } from 'date-fns';

const prisma = new PrismaClient();

// Business hours configuration
const BUSINESS_START_HOUR = 9; // 9:00 AM
const BUSINESS_END_HOUR = 17; // 5:00 PM (17:00)
const BUSINESS_END_MINUTE = 30; // 5:30 PM
const WORKING_DAYS = [1, 2, 3, 4, 5, 6]; // Monday to Saturday (0 = Sunday)

// SLA hours by priority (in business hours)
const SLA_HOURS_BY_PRIORITY: Record<string, number> = {
  'CRITICAL': 4,   // 4 business hours
  'HIGH': 8,       // 8 business hours  
  'MEDIUM': 24,    // 24 business hours (3 business days)
  'LOW': 48        // 48 business hours (6 business days)
};

// Helper function to calculate business hours between two dates
function calculateBusinessHours(startDate: Date, endDate: Date): number {
  let businessHours = 0;
  let currentDate = new Date(startDate);
  
  while (currentDate < endDate) {
    const dayOfWeek = currentDate.getDay();
    
    // Skip Sundays (0)
    if (WORKING_DAYS.includes(dayOfWeek)) {
      const dayStart = new Date(currentDate);
      dayStart.setHours(BUSINESS_START_HOUR, 0, 0, 0);
      
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(BUSINESS_END_HOUR, BUSINESS_END_MINUTE, 0, 0);
      
      // Calculate overlap with business hours for this day
      const periodStart = new Date(Math.max(currentDate.getTime(), dayStart.getTime()));
      const periodEnd = new Date(Math.min(endDate.getTime(), dayEnd.getTime()));
      
      if (periodStart < periodEnd) {
        const hoursThisDay = (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60);
        businessHours += hoursThisDay;
      }
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
    currentDate.setHours(0, 0, 0, 0);
  }
  
  return businessHours;
}

// Helper function to calculate HER deadline from ticket creation
function calculateHerDeadline(createdAt: Date, priority: string): Date {
  const slaHours = SLA_HOURS_BY_PRIORITY[priority] || SLA_HOURS_BY_PRIORITY['LOW'];
  let remainingHours = slaHours;
  let currentDate = new Date(createdAt);
  
  // If ticket created outside business hours, start from next business day
  const dayOfWeek = currentDate.getDay();
  const hour = currentDate.getHours();
  const minute = currentDate.getMinutes();
  
  if (!WORKING_DAYS.includes(dayOfWeek) || 
      hour < BUSINESS_START_HOUR || 
      (hour > BUSINESS_END_HOUR) || 
      (hour === BUSINESS_END_HOUR && minute > BUSINESS_END_MINUTE)) {
    // Move to next business day at 9 AM
    do {
      currentDate.setDate(currentDate.getDate() + 1);
      currentDate.setHours(BUSINESS_START_HOUR, 0, 0, 0);
    } while (!WORKING_DAYS.includes(currentDate.getDay()));
  }
  
  // Add business hours to find deadline
  while (remainingHours > 0) {
    const dayOfWeek = currentDate.getDay();
    
    if (WORKING_DAYS.includes(dayOfWeek)) {
      const dayStart = new Date(currentDate);
      dayStart.setHours(BUSINESS_START_HOUR, 0, 0, 0);
      
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(BUSINESS_END_HOUR, BUSINESS_END_MINUTE, 0, 0);
      
      const availableHoursToday = Math.max(0, (dayEnd.getTime() - Math.max(currentDate.getTime(), dayStart.getTime())) / (1000 * 60 * 60));
      
      if (remainingHours <= availableHoursToday) {
        // Deadline is today
        currentDate.setTime(currentDate.getTime() + (remainingHours * 60 * 60 * 1000));
        break;
      } else {
        // Use all available hours today and continue tomorrow
        remainingHours -= availableHoursToday;
      }
    }
    
    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
    currentDate.setHours(BUSINESS_START_HOUR, 0, 0, 0);
  }
  
  return currentDate;
}

export async function getHerAnalysisData(whereClause: any, startDate: Date, endDate: Date) {
  // Get all tickets in the date range
  const tickets = await prisma.ticket.findMany({
    where: whereClause,
    include: {
      customer: true,
      assignedTo: true,
      zone: true,
      asset: true
    }
  });

  // Process each ticket for HER analysis
  const herTickets = tickets.map((ticket: any) => {
    const priority = ticket.priority || 'LOW';
    const herHours = SLA_HOURS_BY_PRIORITY[priority] || SLA_HOURS_BY_PRIORITY['LOW'];
    const herDeadline = calculateHerDeadline(ticket.createdAt, priority);
    
    let actualResolutionHours: number | undefined;
    let businessHoursUsed = 0;
    let isHerBreached = false;
    
    if (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') {
      // Calculate actual resolution time in business hours
      businessHoursUsed = calculateBusinessHours(ticket.createdAt, ticket.updatedAt);
      actualResolutionHours = businessHoursUsed;
      isHerBreached = businessHoursUsed > herHours;
    } else {
      // For open tickets, calculate time used so far
      businessHoursUsed = calculateBusinessHours(ticket.createdAt, new Date());
      isHerBreached = new Date() > herDeadline;
    }
    
    return {
      id: ticket.id,
      title: ticket.title,
      priority: ticket.priority,
      status: ticket.status,
      createdAt: ticket.createdAt.toISOString(),
      resolvedAt: (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') ? ticket.updatedAt.toISOString() : undefined,
      slaDueAt: herDeadline.toISOString(),
      herHours,
      actualResolutionHours,
      isHerBreached,
      businessHoursUsed: Math.round(businessHoursUsed * 100) / 100,
      customer: ticket.customer?.companyName || 'Unknown',
      assignedTo: ticket.assignedTo?.name || 'Unassigned',
      zone: ticket.zone?.name || 'No Zone'
    };
  });

  // Calculate summary statistics
  const totalTickets = herTickets.length;
  const herCompliantTickets = herTickets.filter(t => !t.isHerBreached).length;
  const herBreachedTickets = herTickets.filter(t => t.isHerBreached).length;
  const complianceRate = totalTickets > 0 ? (herCompliantTickets / totalTickets) * 100 : 100;
  
  const averageHerHours = totalTickets > 0 
    ? herTickets.reduce((sum, t) => sum + t.herHours, 0) / totalTickets 
    : 0;
  
  const resolvedTickets = herTickets.filter(t => t.actualResolutionHours !== undefined);
  const averageActualHours = resolvedTickets.length > 0
    ? resolvedTickets.reduce((sum, t) => sum + (t.actualResolutionHours || 0), 0) / resolvedTickets.length
    : 0;

  // Calculate priority breakdown
  const priorityBreakdown: Record<string, any> = {};
  Object.keys(SLA_HOURS_BY_PRIORITY).forEach(priority => {
    const priorityTickets = herTickets.filter(t => t.priority === priority);
    const priorityCompliant = priorityTickets.filter(t => !t.isHerBreached);
    const priorityBreached = priorityTickets.filter(t => t.isHerBreached);
    
    priorityBreakdown[priority] = {
      total: priorityTickets.length,
      compliant: priorityCompliant.length,
      breached: priorityBreached.length,
      complianceRate: priorityTickets.length > 0 ? (priorityCompliant.length / priorityTickets.length) * 100 : 100
    };
  });

  return {
    tickets: herTickets,
    summary: {
      totalTickets,
      herCompliantTickets,
      herBreachedTickets,
      complianceRate: Math.round(complianceRate * 100) / 100,
      averageHerHours: Math.round(averageHerHours * 100) / 100,
      averageActualHours: Math.round(averageActualHours * 100) / 100
    },
    priorityBreakdown
  };
}
