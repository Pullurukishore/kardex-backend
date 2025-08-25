import { OTP_CONFIG } from '../config/auth';

export const generateOtp = (): string => {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < OTP_CONFIG.length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
};

export const verifyOtp = (storedOtp: string, inputOtp: string): boolean => {
  return storedOtp === inputOtp;
};
