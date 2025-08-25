const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    console.log('Checking for existing users...');
    
    // Check if any users exist
    const existingUsers = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true
      }
    });

    console.log(`Found ${existingUsers.length} existing users:`);
    existingUsers.forEach(user => {
      console.log(`- ${user.email} (${user.role}) - ${user.isActive ? 'Active' : 'Inactive'}`);
    });

    if (existingUsers.length === 0) {
      console.log('\nNo users found. Creating test admin user...');
      
      // Hash password
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      // Create test admin user
      const testUser = await prisma.user.create({
        data: {
          email: 'admin@kardexcare.com',
          password: hashedPassword,
          role: 'ADMIN',
          isActive: true
        },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true
        }
      });

      console.log('\n✅ Test admin user created successfully!');
      console.log('Email: admin@kardexcare.com');
      console.log('Password: admin123');
      console.log('Role: ADMIN');
      console.log('\nYou can now use these credentials to login.');
    } else {
      console.log('\nUsers already exist in the database.');
      console.log('If you need to create a new user, you can:');
      console.log('1. Use the registration endpoint');
      console.log('2. Or manually create one in the database');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();
