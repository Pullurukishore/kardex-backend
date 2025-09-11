import nodemailer from 'nodemailer';
import { createTransport } from 'nodemailer';
import path from 'path';
import fs from 'fs/promises';
import handlebars from 'handlebars';

const transporter = createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export interface EmailOptions {
  to: string;
  subject: string;
  template: string;
  context?: Record<string, any>;
}

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  try {
    const templatePath = path.join(
      __dirname,
      '..',
      'templates',
      'emails',
      `${options.template}.hbs`
    );

    const templateContent = await fs.readFile(templatePath, 'utf-8');
    const template = handlebars.compile(templateContent);
    const html = template(options.context || {});

    await transporter.sendMail({
      from: `"${process.env.EMAIL_FROM_NAME || 'KardexCare'}" <${process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      html,
    });
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Failed to send email');
  }
};

export const sendOTP = async (email: string, otp: string): Promise<void> => {
  await sendEmail({
    to: email,
    subject: 'Your OTP Code',
    template: 'otp',
    context: { otp },
  });
};
