import axios from 'axios';
import { logger } from '../utils/logger';

export type ReverseGeocodeResult = {
  address: string | null;
  source?: 'locationiq' | 'fallback';
  error?: string;
};

export class GeocodingService {
  private static readonly API_KEY = process.env.LOCATIONIQ_KEY || ''; // ✅ use .env
  private static readonly BASE_URL = 'https://us1.locationiq.com/v1/reverse.php';
  

  static async reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
    try {
      if (!this.API_KEY) {
        const errorMsg = 'Missing LocationIQ API key. Please set LOCATIONIQ_KEY in .env';
        logger.error(errorMsg);
        return { 
          address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, 
          source: 'fallback',
          error: errorMsg
        };
      }

      logger.info(`Attempting reverse geocoding for coordinates: ${latitude}, ${longitude}`);

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

      const { data } = await axios.get(this.BASE_URL, { 
        params, 
        headers, 
        timeout: 15000, // Increased timeout
      });

      logger.info('LocationIQ API response received:', { hasData: !!data, displayName: data?.display_name });

      const address = this.formatAddress(data);
      
      if (address && address !== `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`) {
        logger.info(`Reverse geocoding successful: ${address}`);
        return { address, source: 'locationiq' };
      } else {
        logger.warn('LocationIQ returned no valid address, using coordinates');
        return { 
          address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, 
          source: 'fallback',
          error: 'No valid address found in LocationIQ response'
        };
      }
    } catch (error: any) {
      logger.error('Reverse geocoding error:', {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        coordinates: `${latitude}, ${longitude}`
      });
      
      let errorMessage = 'Unknown geocoding error';
      if (error.code === 'ENOTFOUND') {
        errorMessage = 'Network error: Unable to reach LocationIQ service';
      } else if (error.response?.status === 401) {
        errorMessage = 'Invalid LocationIQ API key';
      } else if (error.response?.status === 429) {
        errorMessage = 'LocationIQ API rate limit exceeded';
      } else if (error.response?.status >= 500) {
        errorMessage = 'LocationIQ service temporarily unavailable';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Request timeout - LocationIQ service too slow';
      }
      
      return { 
        address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`, 
        source: 'fallback',
        error: errorMessage
      };
    }
  }

  private static formatAddress(data: any): string | null {
    if (!data) {
      logger.warn('No data provided to formatAddress');
      return null;
    }
    
    // Try display_name first (most complete address)
    if (data.display_name && typeof data.display_name === 'string') {
      logger.info('Using display_name for address');
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
        logger.info(`Built address from components: ${formattedAddress}`);
        return formattedAddress;
      }
    }
    
    logger.warn('Unable to format address from data:', data);
    return null;
  }
}
