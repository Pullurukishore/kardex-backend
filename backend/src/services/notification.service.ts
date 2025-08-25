import { TicketStatus } from '@prisma/client';
import { sendEmail } from './email.service';

/**
 * Send ticket update notification to user
 */
export const sendTicketUpdateNotification = async (
  to: string,
  ticketId: string,
  ticketTitle: string,
  status: TicketStatus,
  updatedBy: string,
  comments?: string
): Promise<boolean> => {
  try {
    const ticketUrl = `${process.env.FRONTEND_URL}/tickets/${ticketId}`;
    const subject = `Ticket #${ticketId} - Status Updated to ${status}`;
    
    return await sendEmail({
      to,
      subject,
      template: 'ticketUpdate',
      context: {
        ticketId,
        ticketTitle,
        status,
        updatedBy,
        comments,
        ticketUrl,
        currentYear: new Date().getFullYear()
      }
    });
  } catch (error) {
    console.error('Error sending ticket update notification:', error);
    return false;
  }
};

/**
 * Send purchase order status update notification
 */
export const sendPOStatusUpdateNotification = async (
  to: string,
  poNumber: string,
  status: string,
  updatedBy: string,
  notes?: string
): Promise<boolean> => {
  try {
    const poUrl = `${process.env.FRONTEND_URL}/purchase-orders/${poNumber}`;
    const subject = `Purchase Order #${poNumber} - Status Updated to ${status}`;
    
    return await sendEmail({
      to,
      subject,
      template: 'poStatusUpdate',
      context: {
        poNumber,
        status,
        updatedBy,
        notes,
        poUrl,
        currentYear: new Date().getFullYear()
      }
    });
  } catch (error) {
    console.error('Error sending PO status update notification:', error);
    return false;
  }
};

/**
 * Send general notification email
 */
export const sendGeneralNotification = async (
  to: string,
  subject: string,
  message: string,
  actionUrl?: string,
  actionText?: string
): Promise<boolean> => {
  try {
    return await sendEmail({
      to,
      subject,
      template: 'notification',
      context: {
        subject,
        message,
        actionUrl,
        actionText,
        currentYear: new Date().getFullYear()
      }
    });
  } catch (error) {
    console.error('Error sending general notification:', error);
    return false;
  }
};
