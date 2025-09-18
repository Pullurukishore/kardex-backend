import { Router } from 'express';
import { WhatsAppController } from '../controllers/whatsapp.controller';

const router = Router();
const whatsappController = new WhatsAppController();

/**
 * @route POST /api/whatsapp/notify
 * @desc Send ticket status notification via WhatsApp
 * @access Private
 */
router.post('/notify', whatsappController.sendTicketNotification.bind(whatsappController));

/**
 * @route POST /api/whatsapp/rating
 * @desc Send rating request for closed ticket
 * @access Private
 */
router.post('/rating', whatsappController.sendRatingRequest.bind(whatsappController));

/**
 * @route POST /api/whatsapp/webhook
 * @desc Handle incoming WhatsApp messages (for rating responses)
 * @access Public
 */
router.post('/webhook', whatsappController.handleIncomingMessage.bind(whatsappController));

/**
 * @route GET /api/whatsapp/webhook
 * @desc Verify webhook for Twilio
 * @access Public
 */
router.get('/webhook', whatsappController.verifyWebhook.bind(whatsappController));

export default router;
