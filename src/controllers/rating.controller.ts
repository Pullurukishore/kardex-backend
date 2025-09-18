import { Request, Response } from 'express';
import { RatingModel } from '../models/rating.model';

export class RatingController {
  private ratingModel: RatingModel;

  constructor() {
    this.ratingModel = new RatingModel();
  }

  /**
   * Create a new rating
   */
  async createRating(req: Request, res: Response): Promise<void> {
    try {
      const { ticketId, customerId, rating, feedback, customerPhone } = req.body;

      // Validate required fields
      if (!ticketId || !customerId || !rating || !customerPhone) {
        res.status(400).json({
          success: false,
          message: 'Missing required fields: ticketId, customerId, rating, customerPhone',
        });
        return;
      }

      // Validate rating value
      if (rating < 1 || rating > 5) {
        res.status(400).json({
          success: false,
          message: 'Rating must be between 1 and 5',
        });
        return;
      }

      // Check if rating already exists for this ticket
      const ratingExists = await this.ratingModel.ratingExists(ticketId);
      
      if (ratingExists) {
        res.status(400).json({
          success: false,
          message: 'Rating already exists for this ticket',
        });
        return;
      }

      // Create rating
      const newRating = await this.ratingModel.createRating({
        ticketId,
        customerId,
        rating,
        feedback,
        customerPhone,
      });

      res.status(201).json({
        success: true,
        message: 'Rating created successfully',
        data: newRating,
      });
    } catch (error) {
      console.error('Error creating rating:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create rating',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get rating by ticket ID
   */
  async getRatingByTicketId(req: Request, res: Response): Promise<void> {
    try {
      const { ticketId } = req.params;

      if (!ticketId) {
        res.status(400).json({
          success: false,
          message: 'Ticket ID is required',
        });
        return;
      }

      const rating = await this.ratingModel.getRatingByTicketId(ticketId);

      if (!rating) {
        res.status(404).json({
          success: false,
          message: 'Rating not found for this ticket',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: rating,
      });
    } catch (error) {
      console.error('Error fetching rating:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch rating',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get all ratings for a customer
   */
  async getRatingsByCustomer(req: Request, res: Response): Promise<void> {
    try {
      const { customerId } = req.params;

      if (!customerId) {
        res.status(400).json({
          success: false,
          message: 'Customer ID is required',
        });
        return;
      }

      const ratings = await this.ratingModel.getRatingsByCustomer(customerId);

      res.status(200).json({
        success: true,
        data: ratings,
      });
    } catch (error) {
      console.error('Error fetching customer ratings:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch customer ratings',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get rating statistics
   */
  async getRatingStats(req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.ratingModel.getRatingStats();

      res.status(200).json({
        success: true,
        data: stats,
      });
    } catch (error) {
      console.error('Error fetching rating statistics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch rating statistics',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Check if rating exists for a ticket
   */
  async checkRatingExists(req: Request, res: Response): Promise<void> {
    try {
      const { ticketId } = req.params;

      if (!ticketId) {
        res.status(400).json({
          success: false,
          message: 'Ticket ID is required',
        });
        return;
      }

      const exists = await this.ratingModel.ratingExists(ticketId);

      res.status(200).json({
        success: true,
        data: {
          exists,
        },
      });
    } catch (error) {
      console.error('Error checking rating existence:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check rating existence',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
