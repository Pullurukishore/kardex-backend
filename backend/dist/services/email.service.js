"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPasswordResetEmail = exports.sendOTP = exports.sendEmail = void 0;
const nodemailer_1 = __importDefault(require("nodemailer"));
const handlebars_1 = require("handlebars");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Configure nodemailer with your email service
const transporter = nodemailer_1.default.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});
// Read email templates
const readTemplate = (templateName) => {
    const templatePath = path_1.default.join(__dirname, `../templates/emails/${templateName}.hbs`);
    return fs_1.default.readFileSync(templatePath, 'utf-8');
};
// Compile email templates
const templates = {
    otp: (0, handlebars_1.compile)(readTemplate('otp')),
    passwordReset: (0, handlebars_1.compile)(readTemplate('password-reset')),
    notification: (0, handlebars_1.compile)(readTemplate('notification')),
    ticketUpdate: (0, handlebars_1.compile)(readTemplate('ticket-update')),
    poStatusUpdate: (0, handlebars_1.compile)(readTemplate('po-status-update')),
};
/**
 * Send email using a template
 */
const sendEmail = async (options) => {
    try {
        const { to, subject, template, context, attachments } = options;
        const html = templates[template](context);
        await transporter.sendMail({
            from: `"${process.env.EMAIL_FROM_NAME || 'KardexCare'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
            to,
            subject,
            html,
            attachments,
        });
        return true;
    }
    catch (error) {
        console.error('Error sending email:', error);
        return false;
    }
};
exports.sendEmail = sendEmail;
/**
 * Send OTP to user's email
 */
const sendOTP = async (to, otp) => {
    try {
        // In development, log the OTP instead of sending an email
        if (process.env.NODE_ENV === 'development') {
            console.log(`OTP for ${to}: ${otp}`);
            return true;
        }
        return (0, exports.sendEmail)({
            to,
            subject: 'Your OTP for KardexCare',
            template: 'otp',
            context: { otp }
        });
    }
    catch (error) {
        console.error('Error sending OTP email:', error);
        return false;
    }
};
exports.sendOTP = sendOTP;
/**
 * Send password reset email
 * @param {string} to - Recipient email
 * @param {string} resetToken - Password reset token
 * @returns {Promise<boolean>} - True if email was sent successfully
 */
const sendPasswordResetEmail = async (to, resetToken) => {
    try {
        const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
        // In development, log the reset link instead of sending an email
        if (process.env.NODE_ENV === 'development') {
            console.log(`Password reset link for ${to}: ${resetUrl}`);
            return true;
        }
        return (0, exports.sendEmail)({
            to,
            subject: 'Password Reset Request',
            template: 'passwordReset',
            context: { resetUrl }
        });
    }
    catch (error) {
        console.error('Error sending password reset email:', error);
        return false;
    }
};
exports.sendPasswordResetEmail = sendPasswordResetEmail;
