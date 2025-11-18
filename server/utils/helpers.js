/**
 * NSM AI Speaker - Helper Utilities
 * Common utility functions for the backend
 */

const crypto = require('crypto');

/**
 * Generate a cache key from TTS parameters
 * @param {string} text - The text to be converted to speech
 * @param {string} voice - The voice identifier
 * @param {number} speed - The speech speed
 * @returns {string} MD5 hash of the combined parameters
 */
function generateCacheKey(text, voice, speed) {
  const combined = `${text}|${voice}|${speed}`;
  return crypto.createHash('md5').update(combined, 'utf8').digest('hex');
}

/**
 * Sanitize and validate input text
 * @param {string} text - The input text to sanitize
 * @returns {string} Sanitized text
 * @throws {Error} If text is invalid or exceeds maximum length
 */
function sanitizeInput(text) {
  // Check if text is provided
  if (!text || typeof text !== 'string') {
    throw new Error('Text input is required and must be a string');
  }

  // Trim whitespace
  let sanitized = text.trim();

  // Check for empty text after trimming
  if (sanitized.length === 0) {
    throw new Error('Text input cannot be empty');
  }

  // Check maximum length (5000 characters)
  const MAX_LENGTH = 5000;
  if (sanitized.length > MAX_LENGTH) {
    throw new Error(`Text exceeds maximum length of ${MAX_LENGTH} characters`);
  }

  // Escape HTML entities to prevent XSS
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');

  return sanitized;
}

/**
 * Format error response object
 * Error codes:
 * - E001: Invalid request (bad parameters, missing fields)
 * - E002: Authentication error (invalid API key)
 * - E003: Resource not found (cache miss, file not found)
 * - E004: External service error (TTS API failure)
 * - E005: Internal server error
 *
 * @param {string} code - Error code (E001-E005)
 * @param {string} message - Error message
 * @returns {Object} Formatted error response object
 */
function formatError(code, message) {
  const validCodes = ['E001', 'E002', 'E003', 'E004', 'E005'];

  // Default to E005 if invalid code
  if (!validCodes.includes(code)) {
    code = 'E005';
  }

  return {
    error: true,
    code: code,
    message: message,
    timestamp: new Date().toISOString()
  };
}

/**
 * Validate voice parameter
 * @param {string} voice - Voice identifier to validate
 * @returns {boolean} True if valid
 */
function isValidVoice(voice) {
  if (!voice || typeof voice !== 'string') {
    return false;
  }
  // Basic validation - voice should be non-empty string
  // More specific validation can be added based on supported voices
  return voice.trim().length > 0;
}

/**
 * Validate speed parameter
 * @param {number} speed - Speed value to validate
 * @returns {boolean} True if valid (between 0.25 and 4.0)
 */
function isValidSpeed(speed) {
  const numSpeed = parseFloat(speed);
  return !isNaN(numSpeed) && numSpeed >= 0.25 && numSpeed <= 4.0;
}

module.exports = {
  generateCacheKey,
  sanitizeInput,
  formatError,
  isValidVoice,
  isValidSpeed
};
