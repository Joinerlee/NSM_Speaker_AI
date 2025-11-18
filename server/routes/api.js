/**
 * NSM AI Speaker - API Routes
 * Main API router for TTS and cache management
 */

const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const path = require('path');

const { generateSpeech, getAvailableVoices, checkApiStatus } = require('../services/gemini');
const {
  initCache,
  checkCache,
  saveToCache,
  getFromCache,
  deleteFromCache,
  clearAllCache,
  getCacheStats
} = require('../services/cache');
const {
  generateCacheKey,
  sanitizeInput,
  formatError,
  isValidVoice,
  isValidSpeed
} = require('../utils/helpers');

// Initialize cache on startup
initCache().catch(err => {
  console.error('Failed to initialize cache:', err);
});

/**
 * POST /api/tts
 * Generate speech from text
 */
router.post('/tts', async (req, res) => {
  try {
    const { text, voice = 'Kore', speed = 1.0 } = req.body;

    // Validate input
    if (!text) {
      return res.status(400).json(formatError('E001', 'Text is required'));
    }

    // Sanitize text
    let sanitizedText;
    try {
      sanitizedText = sanitizeInput(text);
    } catch (error) {
      return res.status(400).json(formatError('E001', error.message));
    }

    // Validate voice
    if (!isValidVoice(voice)) {
      return res.status(400).json(formatError('E001', 'Invalid voice parameter'));
    }

    // Validate speed
    if (!isValidSpeed(speed)) {
      return res.status(400).json(formatError('E001', 'Speed must be between 0.25 and 4.0'));
    }

    // Generate cache key
    const cacheKey = generateCacheKey(sanitizedText, voice, speed);

    // Check cache first
    const cachedPath = await getFromCache(cacheKey);
    if (cachedPath) {
      console.log(`Cache hit for key: ${cacheKey}`);
      return res.json({
        success: true,
        audioUrl: `/api/audio/${cacheKey}`,
        cacheKey: cacheKey,
        cached: true
      });
    }

    // Generate speech using Gemini
    console.log(`Generating speech for: ${sanitizedText.substring(0, 50)}...`);
    const audioBuffer = await generateSpeech(sanitizedText, voice, parseFloat(speed));

    // Save to cache
    const audioPath = await saveToCache(cacheKey, audioBuffer, {
      text: sanitizedText,
      voice,
      speed: parseFloat(speed)
    });

    // Return JSON with audio URL
    res.json({
      success: true,
      audioUrl: `/api/audio/${cacheKey}`,
      cacheKey: cacheKey,
      cached: false
    });

  } catch (error) {
    console.error('TTS error:', error);
    const errorCode = error.code || 'E005';
    const status = errorCode === 'E002' ? 401 : errorCode === 'E004' ? 502 : 500;
    res.status(status).json(formatError(errorCode, error.message));
  }
});

/**
 * GET /api/voices
 * Get list of available voices
 */
router.get('/voices', (req, res) => {
  const voices = getAvailableVoices();
  res.json({
    success: true,
    voices
  });
});

/**
 * GET /api/audio/:key
 * Stream cached audio file
 */
router.get('/audio/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const audioPath = await getFromCache(key);

    if (audioPath) {
      res.setHeader('Content-Type', 'audio/wav');
      res.sendFile(audioPath);
    } else {
      res.status(404).json(formatError('E003', 'Audio not found'));
    }
  } catch (error) {
    console.error('Audio stream error:', error);
    res.status(500).json(formatError('E005', 'Failed to stream audio'));
  }
});

/**
 * GET /api/cache/stats
 * Get cache statistics
 */
router.get('/cache/stats', async (req, res) => {
  try {
    const stats = await getCacheStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Cache stats error:', error);
    res.status(500).json(formatError('E005', 'Failed to get cache statistics'));
  }
});

/**
 * DELETE /api/cache/:key
 * Delete specific cache entry
 */
router.delete('/cache/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const deleted = await deleteFromCache(key);

    if (deleted) {
      res.json({
        success: true,
        message: 'Cache entry deleted'
      });
    } else {
      res.status(404).json(formatError('E003', 'Cache entry not found'));
    }
  } catch (error) {
    console.error('Cache delete error:', error);
    res.status(500).json(formatError('E005', 'Failed to delete cache entry'));
  }
});

/**
 * DELETE /api/cache
 * Clear all cache entries
 */
router.delete('/cache', async (req, res) => {
  try {
    const deletedCount = await clearAllCache();
    res.json({
      success: true,
      message: `Cleared ${deletedCount} cache entries`
    });
  } catch (error) {
    console.error('Cache clear error:', error);
    res.status(500).json(formatError('E005', 'Failed to clear cache'));
  }
});

/**
 * POST /api/speak
 * Generate speech and play on server speakers
 */
router.post('/speak', async (req, res) => {
  try {
    const { text, voice = 'Kore', speed = 1.0 } = req.body;

    // Validate input
    if (!text) {
      return res.status(400).json(formatError('E001', 'Text is required'));
    }

    // Sanitize text
    let sanitizedText;
    try {
      sanitizedText = sanitizeInput(text);
    } catch (error) {
      return res.status(400).json(formatError('E001', error.message));
    }

    // Validate voice and speed
    if (!isValidVoice(voice)) {
      return res.status(400).json(formatError('E001', 'Invalid voice parameter'));
    }
    if (!isValidSpeed(speed)) {
      return res.status(400).json(formatError('E001', 'Speed must be between 0.25 and 4.0'));
    }

    // Generate cache key
    const cacheKey = generateCacheKey(sanitizedText, voice, speed);

    // Check cache first
    let audioPath = await getFromCache(cacheKey);

    if (!audioPath) {
      // Generate speech using Gemini
      console.log(`Generating speech for server playback: ${sanitizedText.substring(0, 50)}...`);
      const audioBuffer = await generateSpeech(sanitizedText, voice, parseFloat(speed));

      // Save to cache
      audioPath = await saveToCache(cacheKey, audioBuffer, {
        text: sanitizedText,
        voice,
        speed: parseFloat(speed)
      });
    } else {
      console.log(`Cache hit for server playback: ${cacheKey}`);
    }

    // Play audio on server using PowerShell (Windows)
    console.log('Playing audio file:', audioPath);
    const psCommand = `powershell -Command "(New-Object Media.SoundPlayer '${audioPath}').PlaySync()"`;

    exec(psCommand, (error, stdout, stderr) => {
      if (error) {
        console.error('Audio playback error:', error);
        console.error('stderr:', stderr);
      } else {
        console.log('Audio playback completed');
      }
    });

    res.json({
      success: true,
      message: 'Playing on server speakers',
      cacheKey: cacheKey
    });

  } catch (error) {
    console.error('Speak error:', error);
    const errorCode = error.code || 'E005';
    const status = errorCode === 'E002' ? 401 : errorCode === 'E004' ? 502 : 500;
    res.status(status).json(formatError(errorCode, error.message));
  }
});

/**
 * GET /api/status
 * Get API status including Gemini connection
 */
router.get('/status', async (req, res) => {
  try {
    const geminiStatus = await checkApiStatus();
    const cacheStats = await getCacheStats();

    res.json({
      success: true,
      status: {
        server: 'running',
        gemini: geminiStatus ? 'connected' : 'disconnected',
        cache: {
          entries: cacheStats.totalEntries,
          size: cacheStats.totalSizeFormatted
        }
      }
    });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json(formatError('E005', 'Failed to get status'));
  }
});

module.exports = router;
