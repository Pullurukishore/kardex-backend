"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RatingModel = void 0;
const db_1 = __importDefault(require("../config/db"));
class RatingModel {
    /**
     * Create a new rating record
     */
    async createRating(data) {
        try {
            const rating = await db_1.default.rating.create({
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
        }
        catch (error) {
            console.error('Error creating rating:', error);
            throw new Error('Failed to create rating record');
        }
    }
    /**
     * Get rating by ticket ID
     */
    async getRatingByTicketId(ticketId) {
        try {
            return await db_1.default.rating.findUnique({
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
        }
        catch (error) {
            console.error('Error fetching rating:', error);
            throw new Error('Failed to fetch rating');
        }
    }
    /**
     * Get all ratings for a customer
     */
    async getRatingsByCustomer(customerId) {
        try {
            return await db_1.default.rating.findMany({
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
        }
        catch (error) {
            console.error('Error fetching customer ratings:', error);
            throw new Error('Failed to fetch customer ratings');
        }
    }
    /**
     * Get rating statistics
     */
    async getRatingStats() {
        try {
            const stats = await db_1.default.rating.aggregate({
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
            const ratingDistribution = await db_1.default.rating.groupBy({
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
                distribution: ratingDistribution.map((item) => ({
                    rating: item.rating,
                    count: item._count.rating,
                })),
            };
        }
        catch (error) {
            console.error('Error fetching rating stats:', error);
            throw new Error('Failed to fetch rating statistics');
        }
    }
    /**
     * Check if rating already exists for ticket
     */
    async ratingExists(ticketId) {
        try {
            const rating = await db_1.default.rating.findUnique({
                where: { ticketId: parseInt(ticketId) },
            });
            return !!rating;
        }
        catch (error) {
            console.error('Error checking rating existence:', error);
            throw new Error('Failed to check rating existence');
        }
    }
}
exports.RatingModel = RatingModel;
