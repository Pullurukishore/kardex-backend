import axios from 'axios';

export type ReverseGeocodeResult = {
  address: string | null;
};

export class GeocodingService {
  private static readonly API_KEY = process.env.LOCATIONIQ_KEY || ''; // ✅ use .env
  private static readonly BASE_URL = 'https://us1.locationiq.com/v1/reverse.php';

  static async reverseGeocode(latitude: number, longitude: number): Promise<ReverseGeocodeResult> {
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

      const { data } = await axios.get(this.BASE_URL, { 
        params, 
        headers, 
        timeout: 10000,
      });

      const address = this.formatAddress(data);
      return { address };
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return { address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}` };
    }
  }

  private static formatAddress(data: any): string | null {
    if (!data) return null;
    
    const { address } = data;
    if (!address) return data.display_name || null;

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
