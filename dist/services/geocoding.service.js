"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeocodingService = void 0;
const axios_1 = __importDefault(require("axios"));
class GeocodingService {
    static async reverseGeocode(latitude, longitude) {
        try {
            if (!this.API_KEY) {
                throw new Error('Missing LocationIQ API key. Please set LOCATIONIQ_KEY in .env');
            }
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
                timeout: 10000,
            });
            const address = this.formatAddress(data);
            return { address };
        }
        catch (error) {
            console.error('Reverse geocoding error:', error);
            return { address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` };
        }
    }
    static formatAddress(data) {
        if (!data)
            return null;
        const { address } = data;
        if (!address)
            return data.display_name || null;
        const components = [
            address.house_number,
            address.road,
            address.neighbourhood,
            address.suburb,
            address.village || address.town || address.city,
            address.state,
            address.postcode,
            address.country,
        ].filter(Boolean);
        return components.join(', ') || data.display_name || null;
    }
}
exports.GeocodingService = GeocodingService;
GeocodingService.API_KEY = process.env.LOCATIONIQ_KEY || ''; // ✅ use .env
GeocodingService.BASE_URL = 'https://us1.locationiq.com/v1/reverse.php';
