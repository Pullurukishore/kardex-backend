"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
// Create a new Prisma Client instance
const prisma = new client_1.PrismaClient({
    log: process.env.NODE_ENV === 'development'
        ? ['warn', 'error'] // Only warnings and errors in development
        : ['error'], // Only errors in production
});
// Handle clean up on process exit
process.on('beforeExit', async () => {
    await prisma.$disconnect();
});
exports.default = prisma;
