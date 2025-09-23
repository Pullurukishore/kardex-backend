import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export class CronService {
  private static instance: CronService;
  private jobs: Map<string, NodeJS.Timeout> = new Map();

  private constructor() {}

  public static getInstance(): CronService {
    if (!CronService.instance) {
      CronService.instance = new CronService();
    }
    return CronService.instance;
  }

  // Auto checkout at 7 PM every day
  public startAutoCheckoutJob(): void {
    // Calculate time until next 7 PM
    const scheduleNextCheckout = () => {
      const now = new Date();
      const next7PM = new Date();
      next7PM.setHours(19, 0, 0, 0); // 7 PM today
      
      // If it's already past 7 PM today, schedule for tomorrow
      if (now >= next7PM) {
        next7PM.setDate(next7PM.getDate() + 1);
      }
      
      const timeUntilNext = next7PM.getTime() - now.getTime();
      
      const timeout = setTimeout(async () => {
        logger.info('Running auto-checkout job at 7 PM...');
        try {
          await this.performAutoCheckout();
        } catch (error) {
          logger.error('Auto-checkout job failed:', error);
        }
        
        // Schedule the next day's checkout
        scheduleNextCheckout();
      }, timeUntilNext);
      
      this.jobs.set('auto-checkout', timeout);
      logger.info(`Auto-checkout job scheduled for ${next7PM.toLocaleString()}`);
    };
    
    scheduleNextCheckout();
  }

  private async performAutoCheckout(): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Find all users who are still checked in today
    const activeAttendances = await prisma.attendance.findMany({
      where: {
        checkInAt: {
          gte: today,
          lt: tomorrow,
        },
        status: 'CHECKED_IN',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const autoCheckoutTime = new Date();
    autoCheckoutTime.setHours(19, 0, 0, 0); // 7 PM

    let checkedOutCount = 0;

    for (const attendance of activeAttendances) {
      try {
        const checkInTime = new Date(attendance.checkInAt);
        const totalHours = (autoCheckoutTime.getTime() - checkInTime.getTime()) / (1000 * 60 * 60);

        await prisma.attendance.update({
          where: { id: attendance.id },
          data: {
            checkOutAt: autoCheckoutTime,
            totalHours: Math.round(totalHours * 100) / 100,
            status: 'CHECKED_OUT',
            notes: attendance.notes ? `${attendance.notes} | Auto-checkout at 7 PM` : 'Auto-checkout at 7 PM',
          },
        });

        checkedOutCount++;
        logger.info(`Auto-checked out user: ${attendance.user.name} (${attendance.user.email})`);
      } catch (error) {
        logger.error(`Failed to auto-checkout user ${attendance.user.name}:`, error);
      }
    }

    logger.info(`Auto-checkout completed for ${checkedOutCount} users`);
  }

  // Stop a specific job
  public stopJob(jobName: string): void {
    const job = this.jobs.get(jobName);
    if (job) {
      clearTimeout(job);
      this.jobs.delete(jobName);
      logger.info(`Stopped job: ${jobName}`);
    }
  }

  // Stop all jobs
  public stopAllJobs(): void {
    this.jobs.forEach((job, name) => {
      clearTimeout(job);
      logger.info(`Stopped job: ${name}`);
    });
    this.jobs.clear();
  }

  // Get job status
  public getJobStatus(jobName: string): boolean {
    return this.jobs.has(jobName);
  }

  // List all jobs
  public listJobs(): string[] {
    return Array.from(this.jobs.keys());
  }
}

// Export singleton instance
export const cronService = CronService.getInstance();
