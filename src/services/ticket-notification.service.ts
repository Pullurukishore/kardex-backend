import { WhatsAppService, TicketNotificationData, TicketAssignmentData } from './whatsapp.service';
import { RatingModel } from '../models/rating.model';

export class TicketNotificationService {
  private whatsappService: WhatsAppService;
  private ratingModel: RatingModel;

  constructor() {
    this.whatsappService = new WhatsAppService();
    this.ratingModel = new RatingModel();
  }

  /**
   * Send notification when ticket is created/opened
   */
  async sendTicketOpenedNotification(ticketData: {
    id: string;
    title: string;
    customerName: string;
    customerPhone: string;
    customerId: string;
    priority?: string;
    assignedTo?: string;
    estimatedResolution?: Date;
  }): Promise<void> {
    try {
      const notificationData: TicketNotificationData = {
        ticketId: ticketData.id,
        ticketTitle: ticketData.title,
        customerName: ticketData.customerName,
        customerPhone: ticketData.customerPhone,
        status: 'OPENED',
        priority: ticketData.priority as any,
        assignedTo: ticketData.assignedTo,
        estimatedResolution: ticketData.estimatedResolution,
      };

      await this.whatsappService.sendTicketNotification(notificationData);
      
      console.log(`Ticket opened notification sent for ticket ${ticketData.id}`);
    } catch (error) {
      console.error('Failed to send ticket opened notification:', error);
      // Don't throw error to avoid disrupting the main ticket creation flow
    }
  }

  /**
   * Send notification when ticket status changes to pending
   */
  async sendTicketPendingNotification(ticketData: {
    id: string;
    title: string;
    customerName: string;
    customerPhone: string;
    assignedTo?: string;
  }): Promise<void> {
    try {
      // Format phone number to ensure international format
      let formattedPhone = ticketData.customerPhone;
      if (formattedPhone && !formattedPhone.startsWith('+')) {
        // Add India country code as default
        formattedPhone = '+91' + formattedPhone.replace(/[^0-9]/g, '');
      }
      
      const notificationData: TicketNotificationData = {
        ticketId: ticketData.id,
        ticketTitle: ticketData.title,
        customerName: ticketData.customerName,
        customerPhone: formattedPhone,
        status: 'CLOSED_PENDING',
        assignedTo: ticketData.assignedTo,
      };

      await this.whatsappService.sendTicketNotification(notificationData);
      
      console.log(`Ticket pending notification sent for ticket ${ticketData.id}`);
    } catch (error) {
      console.error('Failed to send ticket pending notification:', error);
    }
  }

  /**
   * Send notification when ticket is closed and request rating
   */
  async sendTicketClosedNotification(ticketData: {
    id: string;
    title: string;
    customerName: string;
    customerPhone: string;
    customerId: string;
  }): Promise<void> {
    try {
      // Format phone number to ensure international format
      let formattedPhone = ticketData.customerPhone;
      if (formattedPhone && !formattedPhone.startsWith('+')) {
        // Add India country code as default
        formattedPhone = '+91' + formattedPhone.replace(/[^0-9]/g, '');
      }
      
      // Send ticket closed notification
      const notificationData: TicketNotificationData = {
        ticketId: ticketData.id,
        ticketTitle: ticketData.title,
        customerName: ticketData.customerName,
        customerPhone: formattedPhone,
        status: 'CLOSED_PENDING',
      };

      await this.whatsappService.sendTicketNotification(notificationData);

      // Check if rating already exists for this ticket
      const ratingExists = await this.ratingModel.ratingExists(ticketData.id);
      
      if (!ratingExists) {
        // Send rating request after a short delay
        setTimeout(async () => {
          try {
            await this.whatsappService.sendRatingRequest(notificationData);
            console.log(`Rating request sent for ticket ${ticketData.id}`);
          } catch (error) {
            console.error('Failed to send rating request:', error);
          }
        }, 5000); // 5 second delay
      }

      console.log(`Ticket closed notification sent for ticket ${ticketData.id}`);
    } catch (error) {
      console.error('Failed to send ticket closed notification:', error);
    }
  }

  /**
   * Handle ticket status changes and send appropriate notifications
   */
  async handleTicketStatusChange(ticketData: {
    id: string;
    title: string;
    customerName: string;
    customerPhone: string;
    customerId: string;
    oldStatus: string;
    newStatus: string;
    priority?: string;
    assignedTo?: string;
    estimatedResolution?: Date;
  }): Promise<void> {
    try {
      // Only send notifications for specific status changes
      switch (ticketData.newStatus) {
        case 'OPEN':
        case 'REOPENED':
          await this.sendTicketOpenedNotification({
            id: ticketData.id,
            title: ticketData.title,
            customerName: ticketData.customerName,
            customerPhone: ticketData.customerPhone,
            customerId: ticketData.customerId,
            priority: ticketData.priority,
            assignedTo: ticketData.assignedTo,
            estimatedResolution: ticketData.estimatedResolution,
          });
          break;

        case 'PENDING':
        case 'WAITING_CUSTOMER':
        case 'ON_HOLD':
          await this.sendTicketPendingNotification({
            id: ticketData.id,
            title: ticketData.title,
            customerName: ticketData.customerName,
            customerPhone: ticketData.customerPhone,
            assignedTo: ticketData.assignedTo,
          });
          break;

        case 'CLOSED':
        case 'RESOLVED':
          await this.sendTicketClosedNotification({
            id: ticketData.id,
            title: ticketData.title,
            customerName: ticketData.customerName,
            customerPhone: ticketData.customerPhone,
            customerId: ticketData.customerId,
          });
          break;

        default:
          // Don't send notifications for other status changes
          break;
      }
    } catch (error) {
      console.error('Failed to handle ticket status change notification:', error);
    }
  }

  /**
   * Send notification when ticket is assigned to a zone user or service person
   */
  async sendTicketAssignedNotification(ticketData: {
    id: string;
    title: string;
    customerName: string;
    assignedToName: string;
    assignedToPhone: string;
    priority?: string;
    customerIssue?: string;
    estimatedResolution?: Date;
  }): Promise<void> {
    try {
      console.log(`🔔 Sending ticket assignment notification to ${ticketData.assignedToName} (${ticketData.assignedToPhone}) for ticket ${ticketData.id}`);
      
      await this.whatsappService.sendTicketAssignedNotification({
        ticketId: ticketData.id,
        ticketTitle: ticketData.title,
        customerName: ticketData.customerName,
        assignedToPhone: ticketData.assignedToPhone,
        assignedToName: ticketData.assignedToName,
        priority: ticketData.priority as any,
        customerIssue: ticketData.customerIssue,
        estimatedResolution: ticketData.estimatedResolution,
      });
      
      console.log(`✅ Ticket assigned notification sent successfully to ${ticketData.assignedToName}`);
    } catch (error) {
      console.error('❌ Failed to send ticket assigned notification:', error);
      // Don't throw error to avoid disrupting the main ticket assignment flow
    }
  }

  /**
   * Process incoming rating response from WhatsApp
   */
  async processRatingResponse(data: {
    ticketId: string;
    customerId: string;
    customerPhone: string;
    rating: number;
    feedback?: string;
  }): Promise<void> {
    try {
      // Check if rating already exists
      const ratingExists = await this.ratingModel.ratingExists(data.ticketId);
      
      if (ratingExists) {
        console.log(`Rating already exists for ticket ${data.ticketId}`);
        return;
      }

      // Create rating record
      await this.ratingModel.createRating({
        ticketId: data.ticketId,
        customerId: data.customerId,
        rating: data.rating,
        feedback: data.feedback,
        customerPhone: data.customerPhone,
      });

      console.log(`Rating ${data.rating} recorded for ticket ${data.ticketId}`);

      // Send thank you message via WhatsApp
      await this.whatsappService.sendMessage({
        to: data.customerPhone,
        body: `Thank you for rating our service ${data.rating} star${data.rating !== 1 ? 's' : ''}! We appreciate your feedback and will use it to improve our service.`,
      });
    } catch (error) {
      console.error('Failed to process rating response:', error);
    }
  }
}
