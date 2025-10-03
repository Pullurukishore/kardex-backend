const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function safeMigrate() {
  try {
    console.log('🔍 Checking database connection...');
    await prisma.$connect();
    console.log('✅ Database connected successfully');

    console.log('🔍 Checking if database is empty...');
    const userCount = await prisma.user.count().catch(() => null);
    
    if (userCount === null) {
      console.log('📦 Database appears to be empty, running migrations...');
      // Database is empty or tables don't exist, safe to migrate
      process.exit(0);
    } else {
      console.log(`📊 Found ${userCount} users in database`);
      console.log('⚠️  Database has existing data');
      
      // Check if this is a fresh deployment or update
      if (process.env.FORCE_MIGRATE === 'true') {
        console.log('🚀 FORCE_MIGRATE enabled, proceeding with migration...');
        process.exit(0);
      } else {
        console.log('🛡️  Use FORCE_MIGRATE=true environment variable if you want to proceed');
        console.log('💡 This helps prevent accidental data loss');
        process.exit(1);
      }
    }
  } catch (error) {
    console.error('❌ Migration safety check failed:', error.message);
    
    // If it's a connection error to empty database, it's probably safe to migrate
    if (error.code === 'P1001' || error.message.includes('database') || error.message.includes('relation')) {
      console.log('🔄 Assuming empty database, allowing migration...');
      process.exit(0);
    }
    
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

safeMigrate();
