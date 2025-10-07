"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationValidationService = void 0;
const logger_1 = require("../utils/logger");
class LocationValidationService {
    /**
     * Validate location data for accuracy and reasonableness
     */
    static validateLocation(location) {
        const errors = [];
        const warnings = [];
        // Basic coordinate validation
        if (!this.isValidCoordinate(location.latitude, location.longitude)) {
            errors.push('Invalid GPS coordinates');
        }
        // Check if coordinates are within reasonable bounds (India)
        if (!this.isWithinIndiaBounds(location.latitude, location.longitude)) {
            warnings.push('Location appears to be outside India');
        }
        // GPS accuracy validation
        if (location.accuracy && location.source === 'gps') {
            if (location.accuracy > this.MAX_GPS_ACCURACY) {
                errors.push(`GPS accuracy too poor: ±${location.accuracy}m (max: ±${this.MAX_GPS_ACCURACY}m)`);
            }
            else if (location.accuracy > 200) {
                warnings.push(`GPS accuracy is fair: ±${location.accuracy}m`);
            }
        }
        // Timestamp validation
        if (location.timestamp) {
            const now = Date.now();
            const timeDiff = Math.abs(now - location.timestamp);
            const maxAge = 5 * 60 * 1000; // 5 minutes
            if (timeDiff > maxAge) {
                warnings.push('Location timestamp is more than 5 minutes old');
            }
        }
        // Normalize location data
        const normalizedLocation = {
            latitude: Number(location.latitude.toFixed(6)),
            longitude: Number(location.longitude.toFixed(6)),
            accuracy: location.accuracy || (location.source === 'manual' ? 5 : undefined),
            timestamp: location.timestamp || Date.now(),
            source: location.source || 'gps'
        };
        const result = {
            isValid: errors.length === 0,
            errors,
            warnings,
            normalizedLocation
        };
        // Log validation result
        if (errors.length > 0) {
            logger_1.logger.warn('Location validation failed:', {
                location,
                errors,
                warnings
            });
        }
        else if (warnings.length > 0) {
            logger_1.logger.info('Location validation passed with warnings:', {
                location,
                warnings
            });
        }
        else {
            logger_1.logger.info('Location validation passed:', { location });
        }
        return result;
    }
    /**
     * Detect unrealistic location jumps
     */
    static detectLocationJump(previousLocation, newLocation, maxSpeedKmh = this.MAX_REASONABLE_SPEED) {
        // Calculate distance between locations
        const distance = this.calculateDistance(previousLocation.latitude, previousLocation.longitude, newLocation.latitude, newLocation.longitude);
        // Calculate time elapsed
        const prevTime = previousLocation.timestamp || 0;
        const newTime = newLocation.timestamp || Date.now();
        const timeElapsedMs = Math.abs(newTime - prevTime);
        const timeElapsedHours = timeElapsedMs / (1000 * 60 * 60);
        // If very little time has passed, be more lenient
        if (timeElapsedMs < this.MIN_TIME_BETWEEN_LOCATIONS * 1000) {
            return {
                isUnrealistic: false,
                distance,
                speed: 0,
                timeElapsed: timeElapsedHours,
                reason: 'Insufficient time elapsed for jump detection'
            };
        }
        // Calculate speed
        const speed = distance / timeElapsedHours;
        // Determine if jump is unrealistic
        let isUnrealistic = false;
        let reason;
        if (speed > maxSpeedKmh) {
            isUnrealistic = true;
            reason = `Speed too high: ${speed.toFixed(1)} km/h (max: ${maxSpeedKmh} km/h)`;
        }
        // Additional checks for very large distances
        if (distance > 500) { // 500km
            isUnrealistic = true;
            reason = `Distance too large: ${distance.toFixed(1)} km`;
        }
        const result = {
            isUnrealistic,
            distance,
            speed,
            timeElapsed: timeElapsedHours,
            reason
        };
        // Log jump detection
        if (isUnrealistic) {
            logger_1.logger.warn('Unrealistic location jump detected:', {
                previousLocation,
                newLocation,
                result
            });
        }
        else {
            logger_1.logger.info('Location jump validation passed:', {
                distance: distance.toFixed(2),
                speed: speed.toFixed(1),
                timeElapsed: timeElapsedHours.toFixed(2)
            });
        }
        return result;
    }
    /**
     * Validate coordinates are within valid ranges
     */
    static isValidCoordinate(lat, lng) {
        return (!isNaN(lat) && !isNaN(lng) &&
            isFinite(lat) && isFinite(lng) &&
            lat >= -90 && lat <= 90 &&
            lng >= -180 && lng <= 180);
    }
    /**
     * Check if coordinates are within India bounds (approximate)
     */
    static isWithinIndiaBounds(lat, lng) {
        return (lat >= this.INDIA_BOUNDS.minLat && lat <= this.INDIA_BOUNDS.maxLat &&
            lng >= this.INDIA_BOUNDS.minLng && lng <= this.INDIA_BOUNDS.maxLng);
    }
    /**
     * Calculate distance between two GPS points using Haversine formula
     */
    static calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.toRadians(lat2 - lat1);
        const dLng = this.toRadians(lng2 - lng1);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c; // Distance in kilometers
    }
    /**
     * Convert degrees to radians
     */
    static toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }
    /**
     * Get location quality assessment
     */
    static getLocationQuality(location) {
        let score = 100;
        let level = 'excellent';
        let description = 'Excellent location quality';
        // Manual locations get high scores
        if (location.source === 'manual') {
            return {
                score: 95,
                level: 'excellent',
                description: 'Manually selected location'
            };
        }
        // GPS accuracy scoring (updated for field service)
        if (location.accuracy) {
            if (location.accuracy <= 10) {
                score = 100;
                level = 'excellent';
                description = 'Excellent GPS accuracy';
            }
            else if (location.accuracy <= 50) {
                score = 90;
                level = 'excellent';
                description = 'Excellent GPS accuracy';
            }
            else if (location.accuracy <= 200) {
                score = 80;
                level = 'good';
                description = 'Good GPS accuracy';
            }
            else if (location.accuracy <= 500) {
                score = 70;
                level = 'fair';
                description = 'Fair GPS accuracy (suitable for field service)';
            }
            else if (location.accuracy <= 1000) {
                score = 60;
                level = 'fair';
                description = 'Acceptable GPS accuracy for field service';
            }
            else {
                score = 10;
                level = 'unacceptable';
                description = 'Unacceptable GPS accuracy';
            }
        }
        // Age penalty
        if (location.timestamp) {
            const age = Date.now() - location.timestamp;
            const ageMinutes = age / (1000 * 60);
            if (ageMinutes > 10) {
                score -= Math.min(20, ageMinutes - 10);
                description += ` (${ageMinutes.toFixed(0)}min old)`;
            }
        }
        // Bounds check
        if (!this.isWithinIndiaBounds(location.latitude, location.longitude)) {
            score -= 30;
            description += ' (outside expected region)';
        }
        return {
            score: Math.max(0, Math.round(score)),
            level,
            description
        };
    }
    /**
     * Sanitize location data for storage
     */
    static sanitizeLocationData(location) {
        return {
            latitude: Number(Number(location.latitude).toFixed(6)),
            longitude: Number(Number(location.longitude).toFixed(6)),
            accuracy: location.accuracy ? Math.round(location.accuracy) : undefined,
            timestamp: location.timestamp || Date.now(),
            source: location.source || 'gps'
        };
    }
}
exports.LocationValidationService = LocationValidationService;
// Validation thresholds
LocationValidationService.MAX_GPS_ACCURACY = 1000; // meters
LocationValidationService.MAX_REASONABLE_SPEED = 200; // km/h
LocationValidationService.MIN_TIME_BETWEEN_LOCATIONS = 10; // seconds
// Coordinate bounds for India (approximate)
LocationValidationService.INDIA_BOUNDS = {
    minLat: 6.0,
    maxLat: 37.0,
    minLng: 68.0,
    maxLng: 97.0
};
