"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateLocationJump = exports.reverseGeocode = void 0;
const geocoding_service_1 = require("../services/geocoding.service");
const location_validation_service_1 = require("../services/location-validation.service");
const logger_1 = require("../utils/logger");
const reverseGeocode = async (req, res) => {
    try {
        const { latitude, longitude, accuracy, source } = req.query;
        // Validate input
        if (!latitude || !longitude) {
            return res.status(400).json({
                success: false,
                message: 'Latitude and longitude are required'
            });
        }
        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);
        const acc = accuracy ? parseFloat(accuracy) : undefined;
        // Create location data for validation
        const locationData = {
            latitude: lat,
            longitude: lng,
            accuracy: acc,
            timestamp: Date.now(),
            source: source || 'gps'
        };
        // Validate location using enhanced validation service
        const validation = location_validation_service_1.LocationValidationService.validateLocation(locationData);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Location validation failed',
                errors: validation.errors,
                warnings: validation.warnings
            });
        }
        logger_1.logger.info(`Reverse geocoding request for coordinates: ${lat}, ${lng}`, {
            accuracy: acc,
            source: locationData.source,
            validationWarnings: validation.warnings
        });
        // Call the geocoding service
        const result = await geocoding_service_1.GeocodingService.reverseGeocode(lat, lng);
        // Get location quality assessment
        const quality = location_validation_service_1.LocationValidationService.getLocationQuality(locationData);
        // Log the result for debugging
        logger_1.logger.info('Geocoding result:', {
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
    }
    catch (error) {
        logger_1.logger.error('Geocoding controller error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reverse geocode coordinates'
        });
    }
};
exports.reverseGeocode = reverseGeocode;
const validateLocationJump = async (req, res) => {
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
        const prevLocationData = {
            latitude: parseFloat(previousLocation.latitude),
            longitude: parseFloat(previousLocation.longitude),
            accuracy: previousLocation.accuracy ? parseFloat(previousLocation.accuracy) : undefined,
            timestamp: previousLocation.timestamp || Date.now() - 60000, // Default to 1 minute ago
            source: previousLocation.source || 'gps'
        };
        const newLocationData = {
            latitude: parseFloat(newLocation.latitude),
            longitude: parseFloat(newLocation.longitude),
            accuracy: newLocation.accuracy ? parseFloat(newLocation.accuracy) : undefined,
            timestamp: newLocation.timestamp || Date.now(),
            source: newLocation.source || 'gps'
        };
        // Validate both locations
        const prevValidation = location_validation_service_1.LocationValidationService.validateLocation(prevLocationData);
        const newValidation = location_validation_service_1.LocationValidationService.validateLocation(newLocationData);
        if (!prevValidation.isValid || !newValidation.isValid) {
            return res.status(400).json({
                success: false,
                message: 'One or both locations are invalid',
                previousLocationErrors: prevValidation.errors,
                newLocationErrors: newValidation.errors
            });
        }
        // Detect location jump
        const jumpResult = location_validation_service_1.LocationValidationService.detectLocationJump(prevLocationData, newLocationData, maxSpeed ? parseFloat(maxSpeed) : undefined);
        logger_1.logger.info('Location jump validation:', {
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
                        quality: location_validation_service_1.LocationValidationService.getLocationQuality(prevLocationData)
                    },
                    newLocation: {
                        isValid: newValidation.isValid,
                        warnings: newValidation.warnings,
                        quality: location_validation_service_1.LocationValidationService.getLocationQuality(newLocationData)
                    }
                }
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Location jump validation error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to validate location jump'
        });
    }
};
exports.validateLocationJump = validateLocationJump;
