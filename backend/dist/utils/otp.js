"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyOtp = exports.generateOtp = void 0;
const auth_1 = require("../config/auth");
const generateOtp = () => {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < auth_1.OTP_CONFIG.length; i++) {
        otp += digits[Math.floor(Math.random() * 10)];
    }
    return otp;
};
exports.generateOtp = generateOtp;
const verifyOtp = (storedOtp, inputOtp) => {
    return storedOtp === inputOtp;
};
exports.verifyOtp = verifyOtp;
