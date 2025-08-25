"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendGeneralNotification = exports.sendPOStatusUpdateNotification = exports.sendTicketUpdateNotification = void 0;
const email_service_1 = require("./email.service");
/**
 * Send ticket update notification to user
 */
const sendTicketUpdateNotification = async (to, ticketId, ticketTitle, status, updatedBy, comments) => {
    try {
        const ticketUrl = `${process.env.FRONTEND_URL}/tickets/${ticketId}`;
        const subject = `Ticket #${ticketId} - Status Updated to ${status}`;
        return await (0, email_service_1.sendEmail)({
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
    }
    catch (error) {
        console.error('Error sending ticket update notification:', error);
        return false;
    }
};
exports.sendTicketUpdateNotification = sendTicketUpdateNotification;
/**
 * Send purchase order status update notification
 */
const sendPOStatusUpdateNotification = async (to, poNumber, status, updatedBy, notes) => {
    try {
        const poUrl = `${process.env.FRONTEND_URL}/purchase-orders/${poNumber}`;
        const subject = `Purchase Order #${poNumber} - Status Updated to ${status}`;
        return await (0, email_service_1.sendEmail)({
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
    }
    catch (error) {
        console.error('Error sending PO status update notification:', error);
        return false;
    }
};
exports.sendPOStatusUpdateNotification = sendPOStatusUpdateNotification;
/**
 * Send general notification email
 */
const sendGeneralNotification = async (to, subject, message, actionUrl, actionText) => {
    try {
        return await (0, email_service_1.sendEmail)({
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
    }
    catch (error) {
        console.error('Error sending general notification:', error);
        return false;
    }
};
exports.sendGeneralNotification = sendGeneralNotification;
