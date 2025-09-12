// Custom type definitions to replace problematic Prisma imports
type ServiceZone = {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type User = {
  id: number;
  email: string;
  password: string;
  role: string;
  name: string | null;
  phone: string | null;
  zoneId: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  isActive: boolean;
  refreshToken: string | null;
  refreshTokenExpires: Date | null;
  tokenVersion: string;
  customerId: number | null;
  otp: string | null;
  otpExpiresAt: Date | null;
  failedLoginAttempts: number;
  accountLockedUntil: Date | null;
  lastFailedLogin: Date | null;
  lastPasswordChange: Date | null;
  passwordResetToken: string | null;
  passwordResetExpires: Date | null;
  lastActiveAt: Date | null;
  ipAddress: string | null;
  userAgent: string | null;
};

type Ticket = {
  id: number;
  title: string;
  description: string;
  status: string;
  priority: string;
  slaDueAt: Date | null;
  slaStatus: string | null;
  customerId: number;
  contactId: number;
  assetId: number;
  ownerId: number;
  subOwnerId: number | null;
  createdById: number;
  createdAt: Date;
  updatedAt: Date;
  assignedToId: number | null;
  zoneId: number;
  dueDate: Date | null;
  estimatedResolutionTime: number | null;
  actualResolutionTime: number | null;
  resolutionSummary: string | null;
  isCritical: boolean;
  isEscalated: boolean;
  escalatedAt: Date | null;
  escalatedBy: number | null;
  escalatedReason: string | null;
  lastStatusChange: Date | null;
  timeInStatus: number | null;
  totalTimeOpen: number | null;
  relatedMachineIds: string | null;
  errorDetails: string | null;
  proofImages: string | null;
  visitPlannedDate: Date | null;
  visitCompletedDate: Date | null;
  sparePartsDetails: string | null;
  poNumber: string | null;
  poApprovedAt: Date | null;
  poApprovedById: number | null;
};

type TicketStatus = 'OPEN' | 'ASSIGNED' | 'IN_PROCESS' | 'WAITING_CUSTOMER' | 'ONSITE_VISIT' | 'ONSITE_VISIT_PLANNED' | 'PO_NEEDED' | 'PO_RECEIVED' | 'SPARE_PARTS_NEEDED' | 'SPARE_PARTS_BOOKED' | 'SPARE_PARTS_DELIVERED' | 'CLOSED_PENDING' | 'CLOSED' | 'CANCELLED' | 'REOPENED' | 'IN_PROGRESS' | 'ON_HOLD' | 'ESCALATED' | 'RESOLVED' | 'PENDING';

type ServicePersonZone = {
  userId: number;
  serviceZoneId: number;
};

type Customer = {
  id: number;
  companyName: string;
  address: string | null;
  industry: string | null;
  timezone: string;
  serviceZoneId: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  createdById: number;
  updatedById: number;
};

type Asset = {
  id: number;
  machineId: string;
  model: string | null;
  serialNo: string | null;
  purchaseDate: Date | null;
  warrantyEnd: Date | null;
  amcEnd: Date | null;
  location: string | null;
  status: string;
  customerId: number;
  createdAt: Date;
  updatedAt: Date;
  warrantyStart: Date | null;
};

type AuditLog = {
  id: number;
  action: string;
  details: any;
  entityType: string | null;
  entityId: number | null;
  userId: number | null;
  ipAddress: string | null;
  userAgent: string | null;
  status: string | null;
  metadata: any;
  oldValue: any;
  newValue: any;
  ticketId: number | null;
  performedById: number | null;
  performedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type TicketFeedback = {
  id: number;
  ticketId: number;
  rating: number;
  feedback: string | null;
  submittedById: number;
  submittedAt: Date;
  updatedAt: Date;
};

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
  metrics: TechnicianMetrics & {
    ticketsInProgress: number;
    avgResolutionTime: number;
    slaCompliance: number;
    customerSatisfaction: number;
    firstTimeFixRate: number;
    utilization: number;
    efficiencyScore: number;
    recentPerformance: Array<{ date: string; value: number }>;
  };
  zoneStats?: Array<{
    zoneId: number;
    zoneName: string;
    ticketCount: number;
    ticketsResolved: number;
    avgResolutionTime: number;
  }>;
  recentTickets?: RecentTicket[];
  commonIssues?: Array<{
    issueType: string;
    count: number;
    avgResolutionTime: number;
  }>;
  role?: string;
  phone?: string | null;
  lastActiveAt?: Date | null;
  isActive?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
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
