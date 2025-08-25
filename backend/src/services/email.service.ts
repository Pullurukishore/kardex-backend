import nodemailer from 'nodemailer';
import { compile } from 'handlebars';
import fs from 'fs';
import path from 'path';

// Configure nodemailer with your email service
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Read email templates
const readTemplate = (templateName: string) => {
  const templatePath = path.join(__dirname, `../templates/emails/${templateName}.hbs`);
  return fs.readFileSync(templatePath, 'utf-8');
};

// Compile email templates
const templates = {
  otp: compile(readTemplate('otp')),
  passwordReset: compile(readTemplate('password-reset')),
  notification: compile(readTemplate('notification')),
  ticketUpdate: compile(readTemplate('ticket-update')),
  poStatusUpdate: compile(readTemplate('po-status-update')),
};

/**
 * Send OTP to user's email
 * @param {string} to - Recipient email
 * @param {string} otp - 6-digit OTP
 * @returns {Promise<boolean>} - True if email was sent successfully
 */
interface EmailOptions {
  to: string;
  subject: string;
  template: keyof typeof templates;
  context: Record<string, any>;
  attachments?: Array<{
    filename: string;
    path: string;
    cid?: string;
  }>;
}

/**
 * Send email using a template
 */
export const sendEmail = async (options: EmailOptions): Promise<boolean> => {
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
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
};

/**
 * Send OTP to user's email
 */
export const sendOTP = async (to: string, otp: string): Promise<boolean> => {
  try {
    // In development, log the OTP instead of sending an email
    if (process.env.NODE_ENV === 'development') {
      console.log(`OTP for ${to}: ${otp}`);
      return true;
    }

    return sendEmail({
      to,
      subject: 'Your OTP for KardexCare',
      template: 'otp',
      context: { otp }
    });
  } catch (error) {
    console.error('Error sending OTP email:', error);
    return false;
  }
};

/**
 * Send password reset email
 * @param {string} to - Recipient email
 * @param {string} resetToken - Password reset token
 * @returns {Promise<boolean>} - True if email was sent successfully
 */
export const sendPasswordResetEmail = async (to: string, resetToken: string): Promise<boolean> => {
  try {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    
    // In development, log the reset link instead of sending an email
    if (process.env.NODE_ENV === 'development') {
      console.log(`Password reset link for ${to}: ${resetUrl}`);
      return true;
    }

    return sendEmail({
      to,
      subject: 'Password Reset Request',
      template: 'passwordReset',
      context: { resetUrl }
    });
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return false;
  }
};
