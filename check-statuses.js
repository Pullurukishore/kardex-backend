const { PrismaClient } = require('@prisma/client');

async function checkTicketStatuses() {
  const prisma = new PrismaClient();
  
  try {
    // Get all unique ticket statuses currently in use
    const statusCounts = await prisma.ticket.groupBy({
      by: ['status'],
      _count: {
        status: true
      }
    });
    
    console.log('Current ticket statuses in database:');
    statusCounts.forEach(item => {
      console.log(`${item.status}: ${item._count.status} tickets`);
    });
    
    // Check specifically for the statuses we want to remove
    const problematicStatuses = ['PENDING', 'IN_PROGRESS', 'ON_HOLD', 'ESCALATED', 'CANCELLED', 'RESOLVED'];
    const found = statusCounts.filter(item => problematicStatuses.includes(item.status));
    
    if (found.length > 0) {
      console.log('\n⚠️  Found tickets with statuses that need to be updated:');
      found.forEach(item => {
        console.log(`${item.status}: ${item._count.status} tickets`);
      });
    } else {
      console.log('\n✅ No problematic statuses found!');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkTicketStatuses();
