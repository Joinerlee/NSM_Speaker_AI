/**
 * NSM AI Speaker - Gemini TTS Service
 * Handles text-to-speech generation using Google's Gemini API
 */

const { GoogleGenAI } = require('@google/genai');

// Initialize Gemini API
let genAI = null;

/**
 * Add WAV header to raw PCM data
 * @param {Buffer} pcmData - Raw PCM audio data
 * @param {number} sampleRate - Sample rate (e.g., 24000)
 * @param {number} bitsPerSample - Bits per sample (e.g., 16)
 * @param {number} numChannels - Number of channels (1 for mono, 2 for stereo)
 * @returns {Buffer} WAV file buffer with header
 */
function addWavHeader(pcmData, sampleRate, bitsPerSample, numChannels) {
  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = pcmData.length;
  const fileSize = 36 + dataSize;

  const header = Buffer.alloc(44);

  // RIFF header
  header.write('RIFF', 0);
  header.writeUInt32LE(fileSize, 4);
  header.write('WAVE', 8);

  // fmt sub-chunk
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcmData]);
}

/**
 * Initialize Gemini API client
 * @returns {GoogleGenAI} Initialized client
 */
function getGeminiClient() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }

    genAI = new GoogleGenAI({ apiKey });
  }

  return genAI;
}

/**
 * Generate speech from text using Gemini TTS API
 *
 * @param {string} text - The text to convert to speech
 * @param {string} voice - The voice identifier (e.g., 'Kore')
 * @param {number} speed - Speech speed (0.5 to 2.0)
 * @returns {Promise<Buffer>} Audio buffer (WAV format)
 */
async function generateSpeech(text, voice = 'Kore', speed = 1.0) {
  try {
    const client = getGeminiClient();

    // Format text with speed instruction if needed
    let speechText = text;
    if (speed < 0.8) {
      speechText = `천천히 말해주세요: ${text}`;
    } else if (speed > 1.3) {
      speechText = `빠르게 말해주세요: ${text}`;
    }

    console.log('Generating speech for:', text.substring(0, 50) + '...');

    // Generate content with TTS model
    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text: speechText }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: mapVoiceToGemini(voice) },
          },
        },
      },
    });

    // Extract audio data from response
    const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!data) {
      throw new Error('No audio data received from Gemini API');
    }

    // Convert base64 to buffer (raw PCM data)
    const pcmBuffer = Buffer.from(data, 'base64');

    // Add WAV header to PCM data
    // Gemini TTS returns 24kHz, 16-bit mono PCM
    const wavBuffer = addWavHeader(pcmBuffer, 24000, 16, 1);

    console.log('Speech generated successfully, size:', wavBuffer.length);

    return wavBuffer;

  } catch (error) {
    console.error('Gemini TTS error:', error);

    // Handle specific error types
    if (error.message.includes('API key') || error.message.includes('apiKey')) {
      const apiError = new Error('Invalid or missing Gemini API key');
      apiError.code = 'E002';
      throw apiError;
    }

    if (error.message.includes('ENOTFOUND') || error.message.includes('network')) {
      const networkError = new Error('Failed to connect to Gemini API');
      networkError.code = 'E004';
      throw networkError;
    }

    if (error.message.includes('quota') || error.message.includes('rate') || error.message.includes('429')) {
      const quotaError = new Error('API quota exceeded. Please wait a moment and try again.');
      quotaError.code = 'E004';
      throw quotaError;
    }

    // Re-throw with appropriate error code
    const serviceError = new Error(error.message || 'TTS generation failed');
    serviceError.code = error.code || 'E004';
    throw serviceError;
  }
}

/**
 * Map voice identifier to Gemini-compatible voice name
 * @param {string} voice - Input voice identifier
 * @returns {string} Gemini voice name
 */
function mapVoiceToGemini(voice) {
  // Gemini supported voices
  const voiceMap = {
    // Korean voices
    'ko-KR-Standard-A': 'Kore',
    'ko-KR-Standard-B': 'Kore',

    // English voices
    'en-US-Standard-A': 'Aoede',
    'en-US-Standard-B': 'Charon',
    'en-US-Standard-C': 'Fenrir',
    'en-US-Standard-D': 'Puck',

    // Direct Gemini voice names
    'Aoede': 'Aoede',
    'Charon': 'Charon',
    'Fenrir': 'Fenrir',
    'Kore': 'Kore',
    'Puck': 'Puck'
  };

  return voiceMap[voice] || 'Kore'; // Default to Kore for Korean
}

/**
 * Check if Gemini API is properly configured
 * @returns {Promise<boolean>} True if API is available
 */
async function checkApiStatus() {
  try {
    getGeminiClient();
    return true;
  } catch (error) {
    console.error('Gemini API status check failed:', error);
    return false;
  }
}

/**
 * Get list of available voices
 * @returns {Array<Object>} List of voice options
 */
function getAvailableVoices() {
  return [
    {
      id: 'Kore',
      name: 'Kore',
      language: 'ko-KR',
      gender: 'Female',
      description: 'Korean female voice'
    },
    {
      id: 'Aoede',
      name: 'Aoede',
      language: 'en-US',
      gender: 'Female',
      description: 'English female voice'
    },
    {
      id: 'Charon',
      name: 'Charon',
      language: 'en-US',
      gender: 'Male',
      description: 'English male voice'
    },
    {
      id: 'Fenrir',
      name: 'Fenrir',
      language: 'en-US',
      gender: 'Male',
      description: 'English male voice'
    },
    {
      id: 'Puck',
      name: 'Puck',
      language: 'en-US',
      gender: 'Male',
      description: 'English male voice'
    }
  ];
}

module.exports = {
  generateSpeech,
  checkApiStatus,
  getAvailableVoices,
  mapVoiceToGemini
};
