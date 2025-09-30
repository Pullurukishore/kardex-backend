"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WhatsAppService = void 0;
const twilio_1 = __importDefault(require("twilio"));
class WhatsAppService {
    constructor() {
        this.client = (0, twilio_1.default)(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        this.fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || '';
    }
    /**
     * Send a WhatsApp message
     */
    async sendMessage(message) {
        try {
            console.log('📱 WhatsAppService: sendMessage called with:', {
                to: message.to,
                bodyLength: message.body.length
            });
            // Format the phone number properly
            const formattedPhone = this.formatPhoneNumber(message.to);
            const formattedTo = message.to.startsWith('whatsapp:')
                ? `whatsapp:${this.formatPhoneNumber(message.to.replace('whatsapp:', ''))}`
                : `whatsapp:${formattedPhone}`;
            console.log('📱 WhatsAppService: Formatted phone number:', formattedTo);
            const messageOptions = {
                body: message.body,
                from: this.fromNumber,
                to: formattedTo,
            };
            console.log('📱 WhatsAppService: Message options:', {
                from: this.fromNumber,
                to: formattedTo,
                hasBody: !!message.body
            });
            if (message.mediaUrl && message.mediaUrl.length > 0) {
                messageOptions.mediaUrl = message.mediaUrl;
            }
            const result = await this.client.messages.create(messageOptions);
            console.log('✅ WhatsApp message sent successfully:', {
                sid: result.sid,
                to: formattedTo,
                status: result.status,
            });
            // Check message status after a delay
            setTimeout(async () => {
                try {
                    const messageStatus = await this.client.messages(result.sid).fetch();
                    console.log('📱 WhatsAppService: Message status update:', {
                        sid: result.sid,
                        status: messageStatus.status,
                        errorCode: messageStatus.errorCode,
                        errorMessage: messageStatus.errorMessage,
                        dateUpdated: messageStatus.dateUpdated
                    });
                }
                catch (statusError) {
                    console.error('❌ WhatsAppService: Failed to fetch message status:', statusError);
                }
            }, 3000); // Check after 3 seconds
        }
        catch (error) {
            console.error('❌ WhatsAppService: sendMessage failed:', error);
            throw error;
        }
    }
    /**
     * Send ticket status notification
     */
    async sendTicketNotification(data) {
        const message = this.generateTicketMessage(data);
        await this.sendMessage({
            to: data.customerPhone,
            body: message,
        });
    }
    /**
     * Send rating request for closed ticket
     */
    async sendRatingRequest(data) {
        const message = this.generateRatingMessage(data);
        await this.sendMessage({
            to: data.customerPhone,
            body: message,
        });
    }
    /**
     * Send ticket assignment notification to assigned person
     */
    async sendTicketAssignedNotification(data) {
        try {
            console.log('📱 WhatsAppService: Starting assignment notification...');
            console.log('📱 WhatsAppService: Assignment data:', {
                ticketId: data.ticketId,
                assignedToName: data.assignedToName,
                assignedToPhone: data.assignedToPhone,
                customerName: data.customerName
            });
            const message = this.generateAssignmentMessage(data);
            console.log('📱 WhatsAppService: Generated message length:', message.length);
            await this.sendMessage({
                to: data.assignedToPhone,
                body: message,
            });
            console.log('✅ WhatsAppService: Assignment notification sent successfully');
        }
        catch (error) {
            console.error('❌ WhatsAppService: Failed to send assignment notification:', error);
            throw error;
        }
    }
    /**
     * Generate personalized ticket assignment message
     */
    generateTicketMessage(data) {
        const { ticketId, ticketTitle, customerName, status, priority, assignedTo, estimatedResolution } = data;
        const greeting = `Hello ${customerName},`;
        let statusMessage = '';
        switch (status) {
            case 'OPENED':
                statusMessage = `Your ticket #${ticketId} "${ticketTitle}" has been successfully created and assigned to our team.`;
                if (priority && priority !== 'LOW') {
                    statusMessage += `\n\nPriority: ${priority}`;
                }
                if (assignedTo) {
                    statusMessage += `\nAssigned to: ${assignedTo}`;
                }
                if (estimatedResolution) {
                    statusMessage += `\nEstimated resolution: ${estimatedResolution.toLocaleDateString()}`;
                }
                statusMessage += '\n\nWe will keep you updated on the progress.';
                break;
            case 'CLOSED_PENDING':
                statusMessage = `Great news! Your ticket #${ticketId} "${ticketTitle}" has been resolved and is ready for closure.`;
                statusMessage += '\n\nWe hope our solution met your expectations. Your satisfaction is our priority!';
                statusMessage += '\n\n📝 We\'d love to hear your feedback:';
                statusMessage += '\n\n⭐ 1 - Needs Improvement\n⭐⭐ 2 - Fair\n⭐⭐⭐ 3 - Good\n⭐⭐⭐⭐ 4 - Very Good\n⭐⭐⭐⭐⭐ 5 - Excellent';
                statusMessage += '\n\nSimply reply with a number (1-5) to share your experience.';
                statusMessage += '\n\nYour valuable feedback helps us serve you better!';
                break;
        }
        const closing = '\n\nThank you for choosing KardexCare!\n\nBest regards,\nKardexCare Team';
        return `${greeting}\n\n${statusMessage}${closing}`;
    }
    /**
     * Generate rating request message
     */
    generateRatingMessage(data) {
        const { ticketId, ticketTitle, customerName } = data;
        return `Hello ${customerName},\n\nWe hope you're satisfied with the resolution of your ticket #${ticketId} "${ticketTitle}".\n\nPlease take a moment to rate your experience:\n\n🌟 1 - Poor\n🌟🌟 2 - Fair\n🌟🌟🌟 3 - Good\n🌟🌟🌟🌟 4 - Very Good\n🌟🌟🌟🌟🌟 5 - Excellent\n\nSimply reply with a number (1-5) to rate our service.\n\nYour feedback helps us improve! Thank you for choosing KardexCare.`;
    }
    /**
     * Generate ticket assignment message
     */
    generateAssignmentMessage(data) {
        const { ticketId, ticketTitle, customerName, assignedToName, priority, customerIssue, estimatedResolution } = data;
        const greeting = `Hello ${assignedToName},`;
        let assignmentMessage = `🎫 New ticket assigned to you!\n\nTicket #${ticketId}: "${ticketTitle}"`;
        assignmentMessage += `\n\n👤 Customer: ${customerName}`;
        if (customerIssue) {
            assignmentMessage += `\n\n📝 Issue: ${customerIssue}`;
        }
        if (priority && priority !== 'LOW') {
            assignmentMessage += `\n\n🚨 Priority: ${priority}`;
        }
        if (estimatedResolution) {
            assignmentMessage += `\n\n📅 Estimated resolution: ${estimatedResolution.toLocaleDateString()}`;
        }
        assignmentMessage += '\n\nPlease review and take necessary action to resolve this ticket.';
        assignmentMessage += '\n\nThank you for your prompt attention!';
        const closing = '\n\nBest regards,\nKardexCare Team';
        return `${greeting}\n\n${assignmentMessage}${closing}`;
    }
    /**
     * Format phone number for WhatsApp
     */
    formatPhoneNumber(phone) {
        console.log('📱 WhatsAppService: Raw phone number:', phone);
        // Remove all non-digit characters
        let cleaned = phone.replace(/\D/g, '');
        // If the number doesn't start with country code, add +91 (India)
        if (!cleaned.startsWith('91') && cleaned.length === 10) {
            cleaned = '91' + cleaned;
        }
        // Ensure it has the + prefix
        const formatted = '+' + cleaned;
        console.log('📱 WhatsAppService: Formatted phone number:', formatted);
        return formatted;
    }
    /**
     * Validate phone number format
     */
    validatePhoneNumber(phone) {
        const cleaned = phone.replace(/\D/g, '');
        return cleaned.length >= 10 && cleaned.length <= 15;
    }
}
exports.WhatsAppService = WhatsAppService;
