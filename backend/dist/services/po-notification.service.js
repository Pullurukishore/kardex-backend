"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPOStatusNotification = exports.POStatus = void 0;
exports.getPONotificationRecipients = getPONotificationRecipients;
const websocket_service_1 = require("./websocket.service");
exports.POStatus = {
    PENDING: 'PENDING',
    APPROVED: 'APPROVED',
    REJECTED: 'REJECTED',
    ORDERED: 'ORDERED',
    RECEIVED: 'RECEIVED',
    CANCELLED: 'CANCELLED'
};
const sendPOStatusNotification = async (data, recipientIds) => {
    const { poId, poNumber, status, updatedBy, ticketId, ticketTitle, amount, notes } = data;
    let title = '';
    let message = '';
    const poUrl = `${process.env.FRONTEND_URL}/purchase-orders/${poId}`;
    // Map PO status to NotificationType
    const notificationType = `PO_${status}`;
    switch (status) {
        case 'PENDING':
            title = `PO #${poNumber} Requires Approval`;
            message = `A new purchase order #${poNumber} has been submitted for ${ticketTitle ? `ticket #${ticketId}` : 'a ticket'} and requires your approval.`;
            break;
        case 'APPROVED':
            title = `PO #${poNumber} Approved`;
            message = `Purchase order #${poNumber} has been approved by ${updatedBy}.`;
            break;
        case 'REJECTED':
            title = `PO #${poNumber} Rejected`;
            message = `Purchase order #${poNumber} has been rejected by ${updatedBy}.`;
            if (notes)
                message += ` Reason: ${notes}`;
            break;
        case 'ORDERED':
            title = `PO #${poNumber} Marked as Ordered`;
            message = `Purchase order #${poNumber} has been marked as ordered.`;
            break;
        case 'RECEIVED':
            title = `PO #${poNumber} Received`;
            message = `Purchase order #${poNumber} has been marked as received.`;
            break;
        case 'CANCELLED':
            title = `PO #${poNumber} Cancelled`;
            message = `Purchase order #${poNumber} has been cancelled by ${updatedBy}.`;
            if (notes)
                message += ` Reason: ${notes}`;
            break;
        default:
            title = `PO #${poNumber} Status Updated`;
            message = `The status of purchase order #${poNumber} has been updated to ${status}.`;
    }
    const notificationData = {
        title,
        message,
        type: notificationType,
        data: {
            poRequestId: data.poId,
            ticketId: data.ticketId,
            status: data.status,
            action: 'UPDATE',
            poNumber: data.poNumber,
            updatedBy: data.updatedBy,
            poUrl: poUrl
        }
    };
    await Promise.all(recipientIds.map(userId => websocket_service_1.webSocketService.sendNotification(userId, notificationData)));
    if (process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true') {
        await sendPOStatusEmail(recipientIds, {
            title,
            message,
            poNumber,
            status,
            updatedBy,
            poUrl,
            ticketId,
            ticketTitle,
            amount,
            notes
        }).catch(error => {
            console.error('Error sending PO status email:', error);
        });
    }
};
exports.sendPOStatusNotification = sendPOStatusNotification;
async function sendPOStatusEmail(recipientIds, data) {
    console.log(`Would send email to users ${recipientIds.join(', ')}`, data);
}
async function getPONotificationRecipients(poId, currentUserId) {
    return [currentUserId];
}
