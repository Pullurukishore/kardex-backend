"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeocodingService = void 0;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../utils/logger");
class GeocodingService {
    static async reverseGeocode(latitude, longitude) {
        try {
            if (!this.API_KEY) {
                const errorMsg = 'Missing LocationIQ API key. Please set LOCATIONIQ_KEY in .env';
                logger_1.logger.error(errorMsg);
                return {
                    address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
                    source: 'fallback',
                    error: errorMsg
                };
            }
            logger_1.logger.info(`Attempting reverse geocoding for coordinates: ${latitude}, ${longitude}`);
            const params = {
                key: this.API_KEY,
                lat: latitude,
                lon: longitude,
                format: 'json',
                'accept-language': 'en',
                addressdetails: 1,
                zoom: 18,
            };
            const headers = {
                'Accept': 'application/json',
                'User-Agent': 'KardexCare/1.0 (support@kardexcare.local)',
            };
            const { data } = await axios_1.default.get(this.BASE_URL, {
                params,
                headers,
                timeout: 15000, // Increased timeout
            });
            logger_1.logger.info('LocationIQ API response received:', { hasData: !!data, displayName: data?.display_name });
            const address = this.formatAddress(data);
            if (address && address !== `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`) {
                logger_1.logger.info(`Reverse geocoding successful: ${address}`);
                return { address, source: 'locationiq' };
            }
            else {
                logger_1.logger.warn('LocationIQ returned no valid address, using coordinates');
                return {
                    address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
                    source: 'fallback',
                    error: 'No valid address found in LocationIQ response'
                };
            }
        }
        catch (error) {
            logger_1.logger.error('Reverse geocoding error:', {
                message: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                coordinates: `${latitude}, ${longitude}`
            });
            let errorMessage = 'Unknown geocoding error';
            if (error.code === 'ENOTFOUND') {
                errorMessage = 'Network error: Unable to reach LocationIQ service';
            }
            else if (error.response?.status === 401) {
                errorMessage = 'Invalid LocationIQ API key';
            }
            else if (error.response?.status === 429) {
                errorMessage = 'LocationIQ API rate limit exceeded';
            }
            else if (error.response?.status >= 500) {
                errorMessage = 'LocationIQ service temporarily unavailable';
            }
            else if (error.code === 'ECONNABORTED') {
                errorMessage = 'Request timeout - LocationIQ service too slow';
            }
            return {
                address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
                source: 'fallback',
                error: errorMessage
            };
        }
    }
    static formatAddress(data) {
        if (!data) {
            logger_1.logger.warn('No data provided to formatAddress');
            return null;
        }
        // Try display_name first (most complete address)
        if (data.display_name && typeof data.display_name === 'string') {
            logger_1.logger.info('Using display_name for address');
            return data.display_name;
        }
        // Try to build address from components
        const { address } = data;
        if (address && typeof address === 'object') {
            const components = [
                address.house_number,
                address.road,
                address.neighbourhood,
                address.suburb,
                address.village || address.town || address.city,
                address.state,
                address.postcode,
                address.country,
            ].filter(component => component && typeof component === 'string');
            if (components.length > 0) {
                const formattedAddress = components.join(', ');
                logger_1.logger.info(`Built address from components: ${formattedAddress}`);
                return formattedAddress;
            }
        }
        logger_1.logger.warn('Unable to format address from data:', data);
        return null;
    }
}
exports.GeocodingService = GeocodingService;
GeocodingService.API_KEY = process.env.LOCATIONIQ_KEY || ''; // ✅ use .env
GeocodingService.BASE_URL = 'https://us1.locationiq.com/v1/reverse.php';
