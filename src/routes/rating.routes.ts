import { Router } from 'express';
import { RatingController } from '../controllers/rating.controller';

const router = Router();
const ratingController = new RatingController();

/**
 * @route POST /api/ratings
 * @desc Create a new rating
 * @access Private
 */
router.post('/', ratingController.createRating.bind(ratingController));

/**
 * @route GET /api/ratings/ticket/:ticketId
 * @desc Get rating by ticket ID
 * @access Private
 */
router.get('/ticket/:ticketId', ratingController.getRatingByTicketId.bind(ratingController));

/**
 * @route GET /api/ratings/customer/:customerId
 * @desc Get all ratings for a customer
 * @access Private
 */
router.get('/customer/:customerId', ratingController.getRatingsByCustomer.bind(ratingController));

/**
 * @route GET /api/ratings/stats
 * @desc Get rating statistics
 * @access Private
 */
router.get('/stats', ratingController.getRatingStats.bind(ratingController));

/**
 * @route GET /api/ratings/exists/:ticketId
 * @desc Check if rating exists for a ticket
 * @access Private
 */
router.get('/exists/:ticketId', ratingController.checkRatingExists.bind(ratingController));

export default router;
