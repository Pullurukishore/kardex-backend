const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Logging utility
const log = {
  info: (msg) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${new Date().toISOString()} - ${msg}`),
  warn: (msg) => console.log(`[WARN] ${new Date().toISOString()} - ${msg}`),
  error: (msg) => console.log(`[ERROR] ${new Date().toISOString()} - ${msg}`)
};

/**
 * Reset Database - Clear all data
 */
async function resetDatabase() {
  try {
    log.info('Starting database reset...');
    
    // Delete in correct order to respect foreign key constraints
    // First delete all dependent records
    log.info('Deleting Daily Activity Logs...');
    const deletedActivityLogs = await prisma.dailyActivityLog.deleteMany({});
    log.success(`Deleted ${deletedActivityLogs.count} daily activity logs`);
    
    log.info('Deleting Onsite Visit Logs...');
    const deletedOnsiteVisitLogs = await prisma.onsiteVisitLog.deleteMany({});
    log.success(`Deleted ${deletedOnsiteVisitLogs.count} onsite visit logs`);
    
    log.info('Deleting Ticket Reports...');
    const deletedTicketReports = await prisma.ticketReport.deleteMany({});
    log.success(`Deleted ${deletedTicketReports.count} ticket reports`);
    
    log.info('Deleting Ratings...');
    const deletedRatings = await prisma.rating.deleteMany({});
    log.success(`Deleted ${deletedRatings.count} ratings`);
    
    log.info('Deleting Ticket Feedbacks...');
    const deletedTicketFeedbacks = await prisma.ticketFeedback.deleteMany({});
    log.success(`Deleted ${deletedTicketFeedbacks.count} ticket feedbacks`);
    
    log.info('Deleting Comments...');
    const deletedComments = await prisma.comment.deleteMany({});
    log.success(`Deleted ${deletedComments.count} comments`);
    
    log.info('Deleting Ticket Status History...');
    const deletedStatusHistory = await prisma.ticketStatusHistory.deleteMany({});
    log.success(`Deleted ${deletedStatusHistory.count} ticket status history records`);
    
    log.info('Deleting Ticket Notes...');
    const deletedTicketNotes = await prisma.ticketNote.deleteMany({});
    log.success(`Deleted ${deletedTicketNotes.count} ticket notes`);
    
    log.info('Deleting Attachments...');
    const deletedAttachments = await prisma.attachment.deleteMany({});
    log.success(`Deleted ${deletedAttachments.count} attachments`);
    
    log.info('Deleting Call Logs...');
    const deletedCallLogs = await prisma.callLog.deleteMany({});
    log.success(`Deleted ${deletedCallLogs.count} call logs`);
    
    log.info('Deleting PO Requests...');
    const deletedPORequests = await prisma.pORequest.deleteMany({});
    log.success(`Deleted ${deletedPORequests.count} PO requests`);
    
    log.info('Deleting Service History...');
    const deletedServiceHistory = await prisma.serviceHistory.deleteMany({});
    log.success(`Deleted ${deletedServiceHistory.count} service history records`);
    
    log.info('Deleting Audit Logs...');
    const deletedAuditLogs = await prisma.auditLog.deleteMany({});
    log.success(`Deleted ${deletedAuditLogs.count} audit logs`);
    
    log.info('Deleting Tickets...');
    const deletedTickets = await prisma.ticket.deleteMany({});
    log.success(`Deleted ${deletedTickets.count} tickets`);
    
    log.info('Deleting Customer Contacts...');
    const deletedContacts = await prisma.contact.deleteMany({});
    log.success(`Deleted ${deletedContacts.count} contacts`);
    
    log.info('Deleting Assets...');
    const deletedAssets = await prisma.asset.deleteMany({});
    log.success(`Deleted ${deletedAssets.count} assets`);
    
    log.info('Deleting Customers...');
    const deletedCustomers = await prisma.customer.deleteMany({});
    log.success(`Deleted ${deletedCustomers.count} customers`);
    
    log.info('Deleting Service Person Zones...');
    const deletedServicePersonZones = await prisma.servicePersonZone.deleteMany({});
    log.success(`Deleted ${deletedServicePersonZones.count} service person zones`);
    
    log.info('Deleting Service Zones...');
    const deletedZones = await prisma.serviceZone.deleteMany({});
    log.success(`Deleted ${deletedZones.count} service zones`);
    
    log.info('Deleting Attendance Records...');
    const deletedAttendance = await prisma.attendance.deleteMany({});
    log.success(`Deleted ${deletedAttendance.count} attendance records`);
    
    log.info('Deleting Notifications...');
    const deletedNotifications = await prisma.notification.deleteMany({});
    log.success(`Deleted ${deletedNotifications.count} notifications`);
    
    log.info('Deleting Asset Validation Pending...');
    const deletedAssetValidations = await prisma.assetValidationPending.deleteMany({});
    log.success(`Deleted ${deletedAssetValidations.count} asset validation pending records`);
    
    log.info('Deleting SLA Policies...');
    const deletedSLAPolicies = await prisma.sLAPolicy.deleteMany({});
    log.success(`Deleted ${deletedSLAPolicies.count} SLA policies`);
    
    log.info('Deleting Users (except admin)...');
    const deletedUsers = await prisma.user.deleteMany({
      where: {
        role: {
          not: 'ADMIN'
        }
      }
    });
    log.success(`Deleted ${deletedUsers.count} users (kept admin users)`);
    
    log.success('Database reset completed successfully!');
    
    // Show final counts
    const finalCounts = await getFinalCounts();
    log.info('=== FINAL DATABASE STATE ===');
    log.info(`Users remaining: ${finalCounts.users} (admin users only)`);
    log.info(`Service Zones: ${finalCounts.serviceZones}`);
    log.info(`Customers: ${finalCounts.customers}`);
    log.info(`Assets: ${finalCounts.assets}`);
    log.info(`Contacts: ${finalCounts.contacts}`);
    log.info(`Tickets: ${finalCounts.tickets}`);
    log.info(`Daily Activity Logs: ${finalCounts.dailyActivityLogs}`);
    log.info('===============================');
    
  } catch (error) {
    log.error(`Database reset failed: ${error.message}`);
    throw error;
  }
}

/**
 * Get final counts after reset
 */
async function getFinalCounts() {
  const [users, serviceZones, customers, assets, contacts, tickets, dailyActivityLogs] = await Promise.all([
    prisma.user.count(),
    prisma.serviceZone.count(),
    prisma.customer.count(),
    prisma.asset.count(),
    prisma.contact.count(),
    prisma.ticket.count(),
    prisma.dailyActivityLog.count()
  ]);
  
  return {
    users,
    serviceZones,
    customers,
    assets,
    contacts,
    tickets,
    dailyActivityLogs
  };
}

/**
 * Main execution
 */
async function main() {
  try {
    await resetDatabase();
    log.success('Database is now ready for fresh import!');
    log.info('You can now run: npm run import:excel "path/to/your/excel/file.xlsx"');
    
  } catch (error) {
    log.error(`Script failed: ${error.message}`);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Handle script termination
process.on('SIGINT', async () => {
  log.warn('Script interrupted by user');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log.warn('Script terminated');
  await prisma.$disconnect();
  process.exit(0);
});

// Run the script
main();
