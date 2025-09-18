import prisma from '../config/db';

export interface RatingData {
  ticketId: string;
  customerId: string;
  rating: number;
  feedback?: string;
  customerPhone: string;
  source?: string;
}

export class RatingModel {
  /**
   * Create a new rating record
   */
  async createRating(data: RatingData) {
    try {
      const rating = await prisma.rating.create({
        data: {
          ticketId: parseInt(data.ticketId),
          customerId: parseInt(data.customerId),
          rating: data.rating,
          feedback: data.feedback,
          customerPhone: data.customerPhone,
          source: data.source || 'WEB',
          createdAt: new Date(),
        },
      });

      return rating;
    } catch (error) {
      console.error('Error creating rating:', error);
      throw new Error('Failed to create rating record');
    }
  }

  /**
   * Get rating by ticket ID
   */
  async getRatingByTicketId(ticketId: string) {
    try {
      return await prisma.rating.findUnique({
        where: { ticketId: parseInt(ticketId) },
        include: {
          customer: {
            select: {
              companyName: true,
            },
          },
          ticket: {
            select: {
              title: true,
              status: true,
              createdAt: true,
            },
          },
        },
      });
    } catch (error) {
      console.error('Error fetching rating:', error);
      throw new Error('Failed to fetch rating');
    }
  }

  /**
   * Get all ratings for a customer
   */
  async getRatingsByCustomer(customerId: string) {
    try {
      return await prisma.rating.findMany({
        where: { customerId: parseInt(customerId) },
        include: {
          ticket: {
            select: {
              title: true,
              status: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      console.error('Error fetching customer ratings:', error);
      throw new Error('Failed to fetch customer ratings');
    }
  }

  /**
   * Get rating statistics
   */
  async getRatingStats() {
    try {
      const stats = await prisma.rating.aggregate({
        _count: {
          _all: true,
        },
        _avg: {
          rating: true,
        },
        _min: {
          rating: true,
        },
        _max: {
          rating: true,
        },
      });

      const ratingDistribution = await prisma.rating.groupBy({
        by: ['rating'],
        _count: {
          rating: true,
        },
        orderBy: {
          rating: 'asc',
        },
      });

      return {
        totalRatings: stats._count._all,
        averageRating: stats._avg.rating,
        minRating: stats._min.rating,
        maxRating: stats._max.rating,
        distribution: ratingDistribution.map((item: any) => ({
          rating: item.rating,
          count: item._count.rating,
        })),
      };
    } catch (error) {
      console.error('Error fetching rating stats:', error);
      throw new Error('Failed to fetch rating statistics');
    }
  }

  /**
   * Check if rating already exists for ticket
   */
  async ratingExists(ticketId: string): Promise<boolean> {
    try {
      const rating = await prisma.rating.findUnique({
        where: { ticketId: parseInt(ticketId) },
      });
      return !!rating;
    } catch (error) {
      console.error('Error checking rating existence:', error);
      throw new Error('Failed to check rating existence');
    }
  }
}
