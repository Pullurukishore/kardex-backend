import { ServiceZone, User, Ticket, TicketStatus, ServicePersonZone, Customer, Asset, AuditLog, TicketFeedback } from '@prisma/client';

export interface ZoneAnalytics extends ServiceZone {
  metrics: {
    totalTickets: number;
    openTickets: number;
    resolvedTickets: number;
    avgResolutionTime: number;
    slaCompliance: number;
    customerSatisfaction: number;
    firstTimeFixRate: number;
    technicianCount: number;
    activeCustomers: number;
    revenue: number;
    cost: number;
    efficiencyScore: number;
    ticketTrend: Array<{ date: string; count: number }>;
    ticketTypeDistribution: Array<{ type: string; count: number }>;
  };
  topTechnicians: Array<{
    id: number;
    name: string;
    efficiency: number;
    ticketsResolved: number;
    avgRating: number;
  }>;
  recentActivities: Array<{
    id: number;
    type: 'ticket' | 'service' | 'maintenance';
    title: string;
    status: string;
    date: Date;
  }>;
}

export interface RecentTicket {
  id: number;
  title: string;
  status: string;
  updatedAt: Date;
  customer: {
    name: string | null;
    serviceZone?: {
      id: number;
      name: string;
    } | null;
  };
  priority?: string;
  type?: string;
  statusHistories?: Array<{
    status: string;
    changedAt: Date;
  }>;
  createdAt: Date;
  assignedTo?: {
    id: number;
    name: string | null;
    email: string;
  } | null;
}

export interface TechnicianMetrics {
  totalTickets: number;
  resolvedTickets: number;
  openTickets: number;
  avgResolutionTime: number;
  satisfaction: number;
}

export interface TechnicianAnalytics {
  id: number;
  name: string | null;
  email: string;
  metrics: TechnicianMetrics;
  zoneStats?: {
    zoneId: number;
    zoneName: string;
    ticketCount: number;
  }[];
  recentTickets?: RecentTicket[];
  commonIssues?: string[];
  role?: string;
  phone?: string | null;
  lastActiveAt?: Date | null;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}
    ticketsInProgress: number;
    avgResolutionTime: number;
    slaCompliance: number;
    customerSatisfaction: number;
    firstTimeFixRate: number;
    utilization: number;
    efficiencyScore: number;
    recentPerformance: Array<{ date: string; value: number }>;
  };
  zoneStats: Array<{
    zoneId: number;
    zoneName: string;
    ticketsResolved: number;
    avgResolutionTime: number;
  }>;
  recentTickets: RecentTicket[];
  commonIssues: Array<{
    issueType: string;
    count: number;
    avgResolutionTime: number;
  }>;
}

export interface ServiceZoneWithMetrics extends ServiceZone {
  tickets: Ticket[];
  servicePersons: Array<{
    user: User & {
      assignedTickets: Ticket[];
    };
  }>;
  customers: Customer[];
  totalTickets: number;
  openTickets: number;
  resolvedTickets: number;
  avgResolutionTime: number;
  slaCompliance: number;
  customerSatisfaction: number;
  firstTimeFixRate: number;
  technicianCount: number;
  activeCustomers: number;
  revenue: number;
  cost: number;
  efficiencyScore: number;
}

export interface TechnicianEfficiency extends Omit<User, 'zoneId'> {
  assignedTickets: Ticket[];
  serviceZones: Array<{
    serviceZone: ServiceZone;
  }>;
  resolvedCount: number;
  avgResolutionTime: number;
  slaCompliance: number;
  customerSatisfaction: number;
  firstTimeFixRate: number;
  utilization: number;
  zoneName: string;
  ticketsResolved: number;
  customerRating: number;
  travelTime: number;
  partsAvailability: number;
}

export interface DateFilter {
  createdAt?: {
    gte?: Date;
    lte?: Date;
  };
  AND?: Array<{
    createdAt: {
      gte?: Date;
      lte?: Date;
    };
  }>;
}

export interface ActivityItem {
  id: number;
  type: string;
  title: string;
  status: string;
  date: Date;
  zoneName: string;
  user?: {
    id: number | null;
    name: string | null;
    email: string | null;
  };
  details?: Record<string, any>;
}

export interface TicketTrendItem {
  date: string;
  count: number;
  resolved?: number;
  open?: number;
}

export interface OverviewAnalytics {
  summary: {
    totalZones: number;
    totalTechnicians: number;
    totalTickets: number;
    resolvedTickets: number;
    openTickets: number;
    overallSlaCompliance: number;
    overallCustomerSatisfaction: number;
    avgResolutionTime: number;
  };
  topZones: Array<{
    id: number;
    name: string;
    description: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    metrics: {
      totalTickets: number;
      resolvedTickets: number;
      openTickets: number;
      avgResolutionTime: number;
    };
  }>;
  topTechnicians: TechnicianAnalytics[];
  recentActivities: ActivityItem[];
  ticketTrend: TicketTrendItem[];
}
