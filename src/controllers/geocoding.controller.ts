import { Request, Response } from 'express';
import { GeocodingService } from '../services/geocoding.service';
import { LocationValidationService, LocationData } from '../services/location-validation.service';
import { logger } from '../utils/logger';

export const reverseGeocode = async (req: Request, res: Response) => {
  try {
    const { latitude, longitude, accuracy, source } = req.query;

    // Validate input
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }

    const lat = parseFloat(latitude as string);
    const lng = parseFloat(longitude as string);
    const acc = accuracy ? parseFloat(accuracy as string) : undefined;

    // Create location data for validation
    const locationData: LocationData = {
      latitude: lat,
      longitude: lng,
      accuracy: acc,
      timestamp: Date.now(),
      source: (source as any) || 'gps'
    };

    // Validate location using enhanced validation service
    const validation = LocationValidationService.validateLocation(locationData);
    
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Location validation failed',
        errors: validation.errors,
        warnings: validation.warnings
      });
    }

    logger.info(`Reverse geocoding request for coordinates: ${lat}, ${lng}`, {
      accuracy: acc,
      source: locationData.source,
      validationWarnings: validation.warnings
    });

    // Call the geocoding service
    const result = await GeocodingService.reverseGeocode(lat, lng);
    
    // Get location quality assessment
    const quality = LocationValidationService.getLocationQuality(locationData);

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
        error: result.error,
        validation: {
          isValid: validation.isValid,
          warnings: validation.warnings,
          quality: quality
        },
        accuracy: acc,
        timestamp: locationData.timestamp
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

export const validateLocationJump = async (req: Request, res: Response) => {
  try {
    const { previousLocation, newLocation, maxSpeed } = req.body;

    // Validate input
    if (!previousLocation || !newLocation) {
      return res.status(400).json({
        success: false,
        message: 'Both previousLocation and newLocation are required'
      });
    }

    // Validate location data structure
    const requiredFields = ['latitude', 'longitude'];
    for (const field of requiredFields) {
      if (previousLocation[field] === undefined || newLocation[field] === undefined) {
        return res.status(400).json({
          success: false,
          message: `Missing required field: ${field}`
        });
      }
    }

    // Convert to LocationData format
    const prevLocationData: LocationData = {
      latitude: parseFloat(previousLocation.latitude),
      longitude: parseFloat(previousLocation.longitude),
      accuracy: previousLocation.accuracy ? parseFloat(previousLocation.accuracy) : undefined,
      timestamp: previousLocation.timestamp || Date.now() - 60000, // Default to 1 minute ago
      source: previousLocation.source || 'gps'
    };

    const newLocationData: LocationData = {
      latitude: parseFloat(newLocation.latitude),
      longitude: parseFloat(newLocation.longitude),
      accuracy: newLocation.accuracy ? parseFloat(newLocation.accuracy) : undefined,
      timestamp: newLocation.timestamp || Date.now(),
      source: newLocation.source || 'gps'
    };

    // Validate both locations
    const prevValidation = LocationValidationService.validateLocation(prevLocationData);
    const newValidation = LocationValidationService.validateLocation(newLocationData);

    if (!prevValidation.isValid || !newValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'One or both locations are invalid',
        previousLocationErrors: prevValidation.errors,
        newLocationErrors: newValidation.errors
      });
    }

    // Detect location jump
    const jumpResult = LocationValidationService.detectLocationJump(
      prevLocationData,
      newLocationData,
      maxSpeed ? parseFloat(maxSpeed) : undefined
    );

    logger.info('Location jump validation:', {
      previousLocation: prevLocationData,
      newLocation: newLocationData,
      jumpResult
    });

    res.json({
      success: true,
      data: {
        isUnrealisticJump: jumpResult.isUnrealistic,
        distance: jumpResult.distance,
        speed: jumpResult.speed,
        timeElapsed: jumpResult.timeElapsed,
        reason: jumpResult.reason,
        previousLocation: prevLocationData,
        newLocation: newLocationData,
        validation: {
          previousLocation: {
            isValid: prevValidation.isValid,
            warnings: prevValidation.warnings,
            quality: LocationValidationService.getLocationQuality(prevLocationData)
          },
          newLocation: {
            isValid: newValidation.isValid,
            warnings: newValidation.warnings,
            quality: LocationValidationService.getLocationQuality(newLocationData)
          }
        }
      }
    });

  } catch (error) {
    logger.error('Location jump validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to validate location jump'
    });
  }
};
