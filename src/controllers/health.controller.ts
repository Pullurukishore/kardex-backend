import { Request, Response } from 'express';
import prisma from '../config/db';

export const healthCheck = async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    // Test database connection
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbTime = Date.now() - dbStart;
    
    // Get basic stats
    const customerCount = await prisma.customer.count();
    
    const totalTime = Date.now() - startTime;
    
    console.log(`🏥 [HEALTH] Health check completed in ${totalTime}ms (DB: ${dbTime}ms)`);
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        responseTime: `${dbTime}ms`
      },
      stats: {
        customers: customerCount
      },
      responseTime: `${totalTime}ms`
    });
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`❌ [HEALTH] Health check failed after ${totalTime}ms:`, error);
    
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed',
      responseTime: `${totalTime}ms`
    });
  }
};
