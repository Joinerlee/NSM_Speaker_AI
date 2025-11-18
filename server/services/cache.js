/**
 * NSM AI Speaker - Cache Service
 * Handles caching of TTS audio files with LRU eviction
 */

const fs = require('fs').promises;
const path = require('path');

// Cache directory paths
const CACHE_DIR = path.join(__dirname, '../../cache');
const AUDIO_DIR = path.join(CACHE_DIR, 'audio');
const METADATA_DIR = path.join(CACHE_DIR, 'metadata');
const METADATA_FILE = path.join(METADATA_DIR, 'cache-index.json');

// Cache configuration
const CACHE_MAX_SIZE = parseInt(process.env.CACHE_MAX_SIZE) || 500 * 1024 * 1024; // 500MB default

/**
 * Initialize cache directories and index file
 * @returns {Promise<void>}
 */
async function initCache() {
  try {
    // Create directories if they don't exist
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.mkdir(AUDIO_DIR, { recursive: true });
    await fs.mkdir(METADATA_DIR, { recursive: true });

    // Check if cache index exists, create if not
    try {
      await fs.access(METADATA_FILE);
    } catch {
      // File doesn't exist, create empty index
      await saveCacheIndex({});
    }

    console.log('Cache initialized successfully');
  } catch (error) {
    console.error('Failed to initialize cache:', error);
    throw error;
  }
}

/**
 * Read and return cache index
 * @returns {Promise<Object>} Cache index object
 */
async function getCacheIndex() {
  try {
    const data = await fs.readFile(METADATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist or is corrupted, return empty object
    if (error.code === 'ENOENT') {
      return {};
    }
    console.error('Failed to read cache index:', error);
    return {};
  }
}

/**
 * Save cache index to file
 * @param {Object} index - Cache index object
 * @returns {Promise<void>}
 */
async function saveCacheIndex(index) {
  try {
    await fs.writeFile(METADATA_FILE, JSON.stringify(index, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save cache index:', error);
    throw error;
  }
}

/**
 * Check if audio file exists for given cache key
 * @param {string} cacheKey - The cache key to check
 * @returns {Promise<boolean>} True if cache hit, false otherwise
 */
async function checkCache(cacheKey) {
  try {
    const index = await getCacheIndex();

    if (!index[cacheKey]) {
      return false;
    }

    // Verify the audio file actually exists
    const audioPath = path.join(AUDIO_DIR, `${cacheKey}.wav`);
    try {
      await fs.access(audioPath);
      return true;
    } catch {
      // File doesn't exist, remove from index
      delete index[cacheKey];
      await saveCacheIndex(index);
      return false;
    }
  } catch (error) {
    console.error('Failed to check cache:', error);
    return false;
  }
}

/**
 * Save audio file to cache and update index
 * @param {string} cacheKey - The cache key
 * @param {Buffer} audioBuffer - The audio data
 * @param {Object} metadata - Metadata (text, voice, speed)
 * @returns {Promise<string>} Path to saved audio file
 */
async function saveToCache(cacheKey, audioBuffer, metadata) {
  try {
    const audioPath = path.join(AUDIO_DIR, `${cacheKey}.wav`);

    // Save audio file
    await fs.writeFile(audioPath, audioBuffer);

    // Get file size
    const stats = await fs.stat(audioPath);

    // Update cache index
    const index = await getCacheIndex();
    index[cacheKey] = {
      text: metadata.text,
      voice: metadata.voice,
      speed: metadata.speed,
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      accessCount: 1,
      fileSize: stats.size
    };

    await saveCacheIndex(index);

    // Enforce cache size limit
    await enforceCacheLimit();

    return audioPath;
  } catch (error) {
    console.error('Failed to save to cache:', error);
    throw error;
  }
}

/**
 * Get audio file path and update access time
 * @param {string} cacheKey - The cache key
 * @returns {Promise<string|null>} Path to audio file or null if not found
 */
async function getFromCache(cacheKey) {
  try {
    const exists = await checkCache(cacheKey);
    if (!exists) {
      return null;
    }

    // Update access time and count
    await updateAccessTime(cacheKey);

    return path.join(AUDIO_DIR, `${cacheKey}.wav`);
  } catch (error) {
    console.error('Failed to get from cache:', error);
    return null;
  }
}

/**
 * Delete specific cache entry
 * @param {string} cacheKey - The cache key to delete
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
async function deleteFromCache(cacheKey) {
  try {
    const index = await getCacheIndex();

    if (!index[cacheKey]) {
      return false;
    }

    // Delete audio file
    const audioPath = path.join(AUDIO_DIR, `${cacheKey}.wav`);
    try {
      await fs.unlink(audioPath);
    } catch (error) {
      // File might already be deleted
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    // Remove from index
    delete index[cacheKey];
    await saveCacheIndex(index);

    return true;
  } catch (error) {
    console.error('Failed to delete from cache:', error);
    throw error;
  }
}

/**
 * Delete all cached audio files
 * @returns {Promise<number>} Number of files deleted
 */
async function clearAllCache() {
  try {
    const index = await getCacheIndex();
    const keys = Object.keys(index);
    let deletedCount = 0;

    for (const key of keys) {
      try {
        const audioPath = path.join(AUDIO_DIR, `${key}.wav`);
        await fs.unlink(audioPath);
        deletedCount++;
      } catch (error) {
        // Continue even if file doesn't exist
        if (error.code !== 'ENOENT') {
          console.error(`Failed to delete ${key}:`, error);
        }
      }
    }

    // Clear index
    await saveCacheIndex({});

    console.log(`Cleared ${deletedCount} cached files`);
    return deletedCount;
  } catch (error) {
    console.error('Failed to clear cache:', error);
    throw error;
  }
}

/**
 * Update lastAccessed and accessCount for a cache entry
 * @param {string} cacheKey - The cache key to update
 * @returns {Promise<void>}
 */
async function updateAccessTime(cacheKey) {
  try {
    const index = await getCacheIndex();

    if (index[cacheKey]) {
      index[cacheKey].lastAccessed = new Date().toISOString();
      index[cacheKey].accessCount = (index[cacheKey].accessCount || 0) + 1;
      await saveCacheIndex(index);
    }
  } catch (error) {
    console.error('Failed to update access time:', error);
    // Don't throw - this is not critical
  }
}

/**
 * Remove oldest entries if total size exceeds CACHE_MAX_SIZE (LRU)
 * @returns {Promise<number>} Number of entries removed
 */
async function enforceCacheLimit() {
  try {
    const index = await getCacheIndex();
    const entries = Object.entries(index);

    // Calculate total size
    let totalSize = entries.reduce((sum, [, meta]) => sum + (meta.fileSize || 0), 0);

    if (totalSize <= CACHE_MAX_SIZE) {
      return 0;
    }

    // Sort by lastAccessed (oldest first) - LRU strategy
    entries.sort((a, b) => {
      const dateA = new Date(a[1].lastAccessed || a[1].createdAt);
      const dateB = new Date(b[1].lastAccessed || b[1].createdAt);
      return dateA - dateB;
    });

    let removedCount = 0;

    // Remove oldest entries until under limit
    for (const [key, meta] of entries) {
      if (totalSize <= CACHE_MAX_SIZE) {
        break;
      }

      await deleteFromCache(key);
      totalSize -= meta.fileSize || 0;
      removedCount++;
    }

    console.log(`Cache limit enforced: removed ${removedCount} entries`);
    return removedCount;
  } catch (error) {
    console.error('Failed to enforce cache limit:', error);
    return 0;
  }
}

/**
 * Get cache statistics
 * @returns {Promise<Object>} Cache statistics
 */
async function getCacheStats() {
  try {
    const index = await getCacheIndex();
    const entries = Object.entries(index);

    const totalSize = entries.reduce((sum, [, meta]) => sum + (meta.fileSize || 0), 0);
    const totalAccessCount = entries.reduce((sum, [, meta]) => sum + (meta.accessCount || 0), 0);

    // Find oldest and newest entries
    let oldestDate = null;
    let newestDate = null;

    for (const [, meta] of entries) {
      const created = new Date(meta.createdAt);
      if (!oldestDate || created < oldestDate) {
        oldestDate = created;
      }
      if (!newestDate || created > newestDate) {
        newestDate = created;
      }
    }

    return {
      totalEntries: entries.length,
      totalSize: totalSize,
      totalSizeFormatted: formatBytes(totalSize),
      maxSize: CACHE_MAX_SIZE,
      maxSizeFormatted: formatBytes(CACHE_MAX_SIZE),
      usagePercent: ((totalSize / CACHE_MAX_SIZE) * 100).toFixed(2),
      totalAccessCount: totalAccessCount,
      oldestEntry: oldestDate ? oldestDate.toISOString() : null,
      newestEntry: newestDate ? newestDate.toISOString() : null
    };
  } catch (error) {
    console.error('Failed to get cache stats:', error);
    throw error;
  }
}

/**
 * Format bytes to human readable string
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

module.exports = {
  initCache,
  getCacheIndex,
  saveCacheIndex,
  checkCache,
  saveToCache,
  getFromCache,
  deleteFromCache,
  clearAllCache,
  updateAccessTime,
  enforceCacheLimit,
  getCacheStats,
  CACHE_DIR,
  AUDIO_DIR,
  METADATA_FILE
};
