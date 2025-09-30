import { Request, Response } from 'express';
import { GeocodingService } from '../services/geocoding.service';
import { logger } from '../utils/logger';

export const reverseGeocode = async (req: Request, res: Response) => {
  try {
    const { latitude, longitude } = req.query;

    // Validate input
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const lat = parseFloat(latitude as string);
    const lng = parseFloat(longitude as string);

    // Validate coordinate ranges
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return res.status(400).json({
        success: false,
        message: 'Invalid latitude or longitude values'
      });
    }

    logger.info(`Reverse geocoding request for coordinates: ${lat}, ${lng}`);

    // Call the geocoding service
    const result = await GeocodingService.reverseGeocode(lat, lng);

    // Log the result for debugging
    logger.info('Geocoding result:', {
      address: result.address,
      source: result.source,
      error: result.error,
      coordinates: `${lat}, ${lng}`
    });

    res.json({
      success: true,
      data: {
        latitude: lat,
        longitude: lng,
        address: result.address,
        coordinates: `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
        source: result.source,
        error: result.error
      }
    });

  } catch (error) {
    logger.error('Geocoding controller error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reverse geocode coordinates'
    });
  }
};
