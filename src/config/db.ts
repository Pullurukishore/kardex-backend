import { PrismaClient } from '@prisma/client';

// Create a new Prisma Client instance
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' 
    ? ['warn', 'error'] // Only warnings and errors in development
    : ['error'], // Only errors in production
});

// Handle clean up on process exit
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;