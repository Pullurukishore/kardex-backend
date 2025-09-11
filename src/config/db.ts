import { PrismaClient } from '@prisma/client';

// Create a new Prisma Client instance
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'],
});

// Handle clean up on process exit
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

// Extend the PrismaClient type to include the Comment model
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Prisma {
    interface PrismaClient {
      $connect(): Promise<void>;
      $disconnect(): Promise<void>;
      $on(eventType: string, callback: (event: any) => void): void;
      $transaction<T>(fn: (prisma: PrismaClient) => Promise<T>): Promise<T>;
      Comment: {
        findMany: (args: any) => Promise<any[]>;
        create: (args: any) => Promise<any>;
        findUnique: (args: any) => Promise<any>;
        update: (args: any) => Promise<any>;
        delete: (args: any) => Promise<any>;
      };
    }
  }
}

export default prisma;