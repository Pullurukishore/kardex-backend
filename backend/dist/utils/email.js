"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOTP = exports.sendEmail = void 0;
const nodemailer_1 = require("nodemailer");
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const handlebars_1 = __importDefault(require("handlebars"));
const transporter = (0, nodemailer_1.createTransport)({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
    },
});
const sendEmail = async (options) => {
    try {
        const templatePath = path_1.default.join(__dirname, '..', 'templates', 'emails', `${options.template}.hbs`);
        const templateContent = await promises_1.default.readFile(templatePath, 'utf-8');
        const template = handlebars_1.default.compile(templateContent);
        const html = template(options.context || {});
        await transporter.sendMail({
            from: `"${process.env.EMAIL_FROM_NAME || 'KardexCare'}" <${process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_USER}>`,
            to: options.to,
            subject: options.subject,
            html,
        });
    }
    catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Failed to send email');
    }
};
exports.sendEmail = sendEmail;
const sendOTP = async (email, otp) => {
    await (0, exports.sendEmail)({
        to: email,
        subject: 'Your OTP Code',
        template: 'otp',
        context: { otp },
    });
};
exports.sendOTP = sendOTP;
