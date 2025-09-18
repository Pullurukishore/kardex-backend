import { Request, Response } from 'express';
import { WhatsAppService } from '../services/whatsapp.service';
import { RatingController } from './rating.controller';
import { TicketNotificationData } from '../services/whatsapp.service';
import prisma from '../config/db';

export class WhatsAppController {
  private whatsappService: WhatsAppService;
  private ratingController: RatingController;

  constructor() {
    this.whatsappService = new WhatsAppService();
    this.ratingController = new RatingController();
  }

  /**
   * Send ticket status notification
   */
  async sendTicketNotification(req: Request, res: Response): Promise<void> {
    try {
      const notificationData: TicketNotificationData = req.body;

      // Validate required fields
      const requiredFields: (keyof TicketNotificationData)[] = ['ticketId', 'ticketTitle', 'customerName', 'customerPhone', 'status'];
      const missingFields = requiredFields.filter(field => !notificationData[field]);

      if (missingFields.length > 0) {
        res.status(400).json({
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`,
        });
        return;
      }

      // Validate phone number
      if (!this.whatsappService.validatePhoneNumber(notificationData.customerPhone)) {
        res.status(400).json({
          success: false,
          message: 'Invalid phone number format',
        });
        return;
      }

      // Validate status
      const validStatuses = ['OPENED', 'CLOSED', 'PENDING'];
      if (!validStatuses.includes(notificationData.status)) {
        res.status(400).json({
          success: false,
          message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        });
        return;
      }

      await this.whatsappService.sendTicketNotification(notificationData);

      res.status(200).json({
        success: true,
        message: 'WhatsApp notification sent successfully',
        data: {
          ticketId: notificationData.ticketId,
          status: notificationData.status,
          customerPhone: notificationData.customerPhone,
        },
      });
    } catch (error) {
      console.error('Error sending WhatsApp notification:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send WhatsApp notification',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Send rating request for closed ticket
   */
  async sendRatingRequest(req: Request, res: Response): Promise<void> {
    try {
      const { ticketId, ticketTitle, customerName, customerPhone } = req.body;

      // Validate required fields
      const requiredFields = ['ticketId', 'ticketTitle', 'customerName', 'customerPhone'];
      const missingFields = requiredFields.filter(field => !req.body[field]);

      if (missingFields.length > 0) {
        res.status(400).json({
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`,
        });
        return;
      }

      // Validate phone number
      if (!this.whatsappService.validatePhoneNumber(customerPhone)) {
        res.status(400).json({
          success: false,
          message: 'Invalid phone number format',
        });
        return;
      }

      const ratingData: TicketNotificationData = {
        ticketId,
        ticketTitle,
        customerName,
        customerPhone,
        status: 'CLOSED_PENDING',
      };

      await this.whatsappService.sendRatingRequest(ratingData);

      res.status(200).json({
        success: true,
        message: 'Rating request sent successfully',
        data: {
          ticketId,
          customerPhone,
        },
      });
    } catch (error) {
      console.error('Error sending rating request:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to send rating request',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle incoming WhatsApp messages (for rating responses)
   */
  async handleIncomingMessage(req: Request, res: Response): Promise<void> {
    try {
      const { Body, From, To } = req.body;
      
      console.log('📱 [WHATSAPP WEBHOOK] Received message:', { 
        timestamp: new Date().toISOString(),
        from: From, 
        body: Body,
        to: To,
        headers: req.headers
      });

      // Extract rating from message body
      const ratingValue = parseInt(Body.trim());
      console.log('📱 [WHATSAPP WEBHOOK] Parsed rating value:', { ratingValue, originalBody: Body });
      
      if (isNaN(ratingValue) || ratingValue < 1 || ratingValue > 5) {
        console.log('📱 [WHATSAPP WEBHOOK] Invalid rating detected:', { ratingValue, isValid: false });
        // Send invalid rating response
        await this.whatsappService.sendMessage({
          to: From,
          body: 'Please reply with a number between 1 and 5 to rate your experience.',
        });
        
        res.status(200).json({
          success: true,
          message: 'Invalid rating response handled',
        });
        return;
      }

      // Find the most recent ticket for this customer based on phone number
      console.log('📱 [WHATSAPP WEBHOOK] Starting ticket lookup for phone:', From);
      const ticketInfo = await this.findTicketByPhoneNumber(From);
      console.log('📱 [WHATSAPP WEBHOOK] Ticket lookup result:', { ticketInfo, phone: From });
      
      if (!ticketInfo) {
        // Send error message if no ticket found
        await this.whatsappService.sendMessage({
          to: From,
          body: 'Sorry, we could not find your recent ticket. Please contact our support team for assistance.',
        });
        
        res.status(200).json({
          success: true,
          message: 'No ticket found for phone number',
        });
        return;
      }

      // Create rating using the rating controller
      try {
        const mockRequest = {
          body: {
            ticketId: ticketInfo.ticketId,
            customerId: ticketInfo.customerId,
            rating: ratingValue,
            customerPhone: From,
            source: 'WHATSAPP',
          },
        } as Request;
        
        // Create a proper mock response object
        const mockResponse = {
          statusCode: 200,
          status: function(code: number) {
            this.statusCode = code;
            return this;
          },
          json: function(data: any) {
            console.log('Rating controller response:', data);
            // Handle the case where rating already exists
            if (this.statusCode === 400 && data.message && data.message.includes('Rating already exists')) {
              console.log('Rating already exists for this ticket - treating as success');
              this.statusCode = 200; // Treat as success since user already rated
            } else if (this.statusCode !== 201 && this.statusCode !== 200) {
              throw new Error(`Rating creation failed with status ${this.statusCode}: ${JSON.stringify(data)}`);
            }
            return this;
          },
          send: function(data: any) {
            console.log('Rating controller response:', data);
            return this;
          },
          sendStatus: function(code: number) {
            this.statusCode = code;
            console.log('Rating controller status:', code);
            return this;
          },
        } as any;
        
        try {
          console.log('📱 [WHATSAPP WEBHOOK] Creating rating:', { 
            ticketId: ticketInfo.ticketId, 
            customerId: ticketInfo.customerId, 
            rating: ratingValue,
            phone: From,
            source: 'WHATSAPP'
          });
          
          // Check if rating already exists before attempting to create
          const ratingExists = await this.ratingController['ratingModel'].ratingExists(ticketInfo.ticketId);
          if (ratingExists) {
            console.log('📱 [WHATSAPP WEBHOOK] Rating already exists for ticket:', ticketInfo.ticketId);
            // Send message to user indicating they already rated
            await this.whatsappService.sendMessage({
              to: From,
              body: `We see you've already rated this ticket. Thank you for your feedback! Your previous rating has been recorded.`,
            });
          } else {
            await this.ratingController.createRating(mockRequest, mockResponse as Response);
            console.log('📱 [WHATSAPP WEBHOOK] Rating created successfully for ticket:', ticketInfo.ticketId);
          }
        } catch (ratingError: any) {
          // Check if the error is because rating already exists
          if (ratingError.message && (ratingError.message.includes('Rating already exists') || ratingError.message.includes('Unique constraint'))) {
            console.log('Rating already exists for this ticket - sending appropriate response');
            // Send message to user indicating they already rated
            await this.whatsappService.sendMessage({
              to: From,
              body: `We see you've already rated this ticket. Thank you for your feedback! Your previous rating has been recorded.`,
            });
          } else {
            console.error('Error creating rating:', ratingError);
            // Send error message to user
            await this.whatsappService.sendMessage({
              to: From,
              body: 'Sorry, there was an error saving your rating. Our team has been notified.',
            });
            
            res.status(500).json({
              success: false,
              message: 'Failed to create rating',
              error: ratingError instanceof Error ? ratingError.message : 'Unknown error',
            });
            return;
          }
        }

        // Send thank you message
        console.log('📱 [WHATSAPP WEBHOOK] Sending thank you message for rating:', ratingValue);
        await this.whatsappService.sendMessage({
          to: From,
          body: `Thank you for rating your experience ${ratingValue} out of 5! We appreciate your feedback and will use it to improve our service.`,
        });

        console.log('📱 [WHATSAPP WEBHOOK] Webhook processing completed successfully');
        res.status(200).json({
          success: true,
          message: 'Rating processed successfully',
          data: {
            rating: ratingValue,
            ticketId: ticketInfo.ticketId,
            customerId: ticketInfo.customerId,
            from: From,
          },
        });
      } catch (error) {
        console.error('Error handling incoming WhatsApp message:', error);
        res.status(500).json({
          success: false,
          message: 'Failed to handle incoming message',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } catch (error) {
      console.error('Error handling incoming WhatsApp message:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to handle incoming message',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Webhook verification for Twilio
   */
  async verifyWebhook(req: Request, res: Response): Promise<void> {
    // Twilio sends a challenge token for webhook verification
    const challenge = req.query.challenge;
    
    if (challenge) {
      res.status(200).send(challenge);
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Webhook verified',
    });
  }

  /**
   * Find the most recent ticket for a customer based on phone number
   */
  private async findTicketByPhoneNumber(phoneNumber: string): Promise<{ ticketId: string; customerId: string } | null> {
    try {
      // Remove 'whatsapp:' prefix if present
      const cleanPhone = phoneNumber.replace('whatsapp:', '');
      const digitsOnly = cleanPhone.replace(/[^0-9]/g, '');
      
      // Try different phone number formats
      const phoneFormats = [
        digitsOnly, // Full number with country code: 918639224022
        digitsOnly.slice(2), // Without country code: 8639224022
        digitsOnly.slice(-10), // Last 10 digits: 8639224022
        `+${digitsOnly}`, // With + prefix: +918639224022
        `whatsapp:${digitsOnly}`, // WhatsApp format: whatsapp:918639224022
      ];
      
      console.log('📱 [PHONE DEBUG] Searching for phone number:', { 
        original: phoneNumber, 
        cleanPhone, 
        digitsOnly, 
        phoneFormats,
        timestamp: new Date().toISOString()
      });
      
      // Find contacts with this phone number
      const contacts = await prisma.contact.findMany({
        where: {
          OR: phoneFormats.map(format => ({
            phone: {
              contains: format,
            },
          })),
        },
        include: {
          customer: {
            include: {
              tickets: {
                where: {
                  status: {
                    in: ['CLOSED', 'RESOLVED', 'PENDING', 'CLOSED_PENDING'], // Include all relevant statuses for rating
                  },
                },
                orderBy: {
                  updatedAt: 'desc', // Get most recent ticket
                },
                take: 1, // Only get the most recent one
              },
            },
          },
        },
      });

      console.log('📱 [PHONE DEBUG] Found contacts:', contacts.length);
      console.log('📱 [PHONE DEBUG] Contact details:', contacts.map(c => ({ 
        id: c.id, 
        phone: c.phone, 
        customer: c.customer ? { 
          id: c.customer.id, 
          tickets: c.customer.tickets.length,
          ticketStatuses: c.customer.tickets.map(t => t.status)
        } : null 
      })));
      console.log('📱 [PHONE DEBUG] All phone formats tried:', phoneFormats);

      // Look for the most recent ticket across all contacts with this phone number
      let mostRecentTicket = null;
      let customerId = null;
      
      for (const contact of contacts) {
        if (contact.customer.tickets.length > 0) {
          const ticket = contact.customer.tickets[0];
          if (!mostRecentTicket || ticket.updatedAt > mostRecentTicket.updatedAt) {
            mostRecentTicket = ticket;
            customerId = contact.customer.id.toString();
          }
        }
      }

      if (mostRecentTicket) {
        return {
          ticketId: mostRecentTicket.id.toString(),
          customerId: customerId!,
        };
      }

      return null;
    } catch (error) {
      console.error('Error finding ticket by phone number:', error);
      return null;
    }
  }
}
