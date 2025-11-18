/**
 * NSM AI Speaker - Client-side Application
 * Handles text-to-speech functionality, audio controls, and history management
 */

// State management
const state = {
  audio: null,
  isPlaying: false,
  isRepeat: false,
  volume: 1,
  speed: 1,
  interval: 0,
  intervalTimer: null,
  currentAudioId: null,
  history: [],
  // WebSocket state
  ws: null,
  role: null,  // 'speaker' or 'controller'
  connected: false
};

// DOM Elements - populated on DOMContentLoaded
let elements = {};

// Constants
const MAX_TEXT_LENGTH = 5000;
const MAX_HISTORY_ITEMS = 10;
const TOAST_DURATION = 3000;
const HISTORY_STORAGE_KEY = 'nsm_speaker_history';

// Error messages
const ERROR_MESSAGES = {
  E001: '텍스트를 입력해주세요.',
  E002: '텍스트가 너무 깁니다. (최대 5000자)',
  E003: '음성 생성에 실패했습니다.',
  E004: '네트워크 오류가 발생했습니다.',
  E005: '오디오 재생에 실패했습니다.'
};

// ===== API Communication Functions =====

/**
 * Request speech synthesis from the server
 * @param {string} text - Text to convert to speech
 * @returns {Promise<{audioUrl: string, cacheKey: string}>}
 */
async function requestSpeech(text) {
  try {
    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        voice: 'ko-KR-Standard-A',
        speed: state.speed
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || ERROR_MESSAGES.E003);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error.name === 'TypeError' || error.message.includes('fetch')) {
      throw new Error(ERROR_MESSAGES.E004);
    }
    throw error;
  }
}

/**
 * Request speech synthesis and play on server speakers
 * @param {string} text - Text to convert to speech
 * @returns {Promise<{success: boolean, cacheKey: string}>}
 */
async function requestServerSpeak(text) {
  try {
    const response = await fetch('/api/speak', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: text,
        voice: 'ko-KR-Standard-A',
        speed: state.speed
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || ERROR_MESSAGES.E003);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error.name === 'TypeError' || error.message.includes('fetch')) {
      throw new Error(ERROR_MESSAGES.E004);
    }
    throw error;
  }
}

/**
 * Fetch cache statistics from the server
 * @returns {Promise<Object>}
 */
async function fetchHistory() {
  try {
    const response = await fetch('/api/cache/stats');
    if (!response.ok) {
      throw new Error('Failed to fetch cache stats');
    }
    return await response.json();
  } catch (error) {
    console.error('Failed to fetch history:', error);
    return null;
  }
}

/**
 * Delete a cached audio file
 * @param {string} cacheKey - The cache key to delete
 * @returns {Promise<boolean>}
 */
async function deleteCache(cacheKey) {
  try {
    const response = await fetch(`/api/cache/${encodeURIComponent(cacheKey)}`, {
      method: 'DELETE'
    });
    return response.ok;
  } catch (error) {
    console.error('Failed to delete cache:', error);
    return false;
  }
}

// ===== Audio Control Functions =====

/**
 * Load audio from URL
 * @param {string} audioUrl - URL of the audio file
 */
function loadAudio(audioUrl) {
  // Stop and cleanup previous audio
  if (state.audio) {
    state.audio.pause();
    state.audio.removeEventListener('ended', handleAudioEnded);
    state.audio.removeEventListener('timeupdate', handleTimeUpdate);
    state.audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    state.audio.removeEventListener('error', handleAudioError);
  }

  // Create new audio instance
  state.audio = new Audio(audioUrl);

  // Apply current settings
  state.audio.volume = state.volume;
  state.audio.playbackRate = state.speed;

  // Set up event listeners
  state.audio.addEventListener('ended', handleAudioEnded);
  state.audio.addEventListener('timeupdate', handleTimeUpdate);
  state.audio.addEventListener('loadedmetadata', handleLoadedMetadata);
  state.audio.addEventListener('error', handleAudioError);

  // Enable controls
  updateControlState(true);
}

/**
 * Play the current audio
 */
function playAudio() {
  if (!state.audio) return;

  state.audio.play()
    .then(() => {
      state.isPlaying = true;
      updatePlayPauseButton();
    })
    .catch(error => {
      console.error('Playback failed:', error);
      showToast(ERROR_MESSAGES.E005, 'error');
    });
}

/**
 * Pause the current audio
 */
function pauseAudio() {
  if (!state.audio) return;

  state.audio.pause();
  state.isPlaying = false;
  updatePlayPauseButton();
}

/**
 * Stop and reset the current audio
 */
function stopAudio() {
  if (!state.audio) return;

  // Clear interval timer if exists
  if (state.intervalTimer) {
    clearTimeout(state.intervalTimer);
    state.intervalTimer = null;
  }

  state.audio.pause();
  state.audio.currentTime = 0;
  state.isPlaying = false;
  updatePlayPauseButton();
  updateProgressBar();
}

/**
 * Set audio volume
 * @param {number} value - Volume value (0-1)
 */
function setVolume(value) {
  state.volume = Math.max(0, Math.min(1, value));

  if (state.audio) {
    state.audio.volume = state.volume;
  }

  // Update UI
  const percentage = Math.round(state.volume * 100);
  elements.volumeSlider.value = percentage;
  elements.volumeValue.textContent = `${percentage}%`;
  elements.volumeSlider.setAttribute('aria-valuenow', percentage);
}

/**
 * Set playback speed
 * @param {number} value - Speed value (0.5-2)
 */
function setSpeed(value) {
  state.speed = Math.max(0.5, Math.min(2, value));

  if (state.audio) {
    state.audio.playbackRate = state.speed;
  }

  // Update UI
  const percentage = Math.round(state.speed * 100);
  elements.speedSlider.value = percentage;
  elements.speedValue.textContent = `${state.speed.toFixed(1)}x`;
  elements.speedSlider.setAttribute('aria-valuenow', state.speed);
}

/**
 * Set repeat interval
 * @param {number} value - Interval value in seconds (0-10)
 */
function setRepeatInterval(value) {
  state.interval = Math.max(0, Math.min(10, value));

  // Update UI
  elements.intervalSlider.value = state.interval;
  elements.intervalValue.textContent = `${state.interval}초`;
  elements.intervalSlider.setAttribute('aria-valuenow', state.interval);
}

/**
 * Toggle repeat mode
 */
function toggleRepeat() {
  state.isRepeat = !state.isRepeat;

  // Update UI
  elements.repeatBtn.setAttribute('data-active', state.isRepeat.toString());
  elements.repeatBtn.setAttribute('aria-pressed', state.isRepeat.toString());

  if (state.isRepeat) {
    elements.repeatBtn.classList.add('active');
  } else {
    elements.repeatBtn.classList.remove('active');
  }
}

// ===== Audio Event Handlers =====

/**
 * Handle audio ended event
 */
function handleAudioEnded() {
  if (state.isRepeat && state.audio) {
    state.audio.currentTime = 0;

    // Clear any existing interval timer
    if (state.intervalTimer) {
      clearTimeout(state.intervalTimer);
      state.intervalTimer = null;
    }

    // Apply interval delay before replaying
    if (state.interval > 0) {
      state.isPlaying = false;
      updatePlayPauseButton();

      state.intervalTimer = setTimeout(() => {
        state.intervalTimer = null;
        playAudio();
      }, state.interval * 1000);
    } else {
      playAudio();
    }
  } else {
    state.isPlaying = false;
    updatePlayPauseButton();
  }
}

/**
 * Handle audio time update event
 */
function handleTimeUpdate() {
  updateProgressBar();
}

/**
 * Handle audio loaded metadata event
 */
function handleLoadedMetadata() {
  if (state.audio) {
    elements.duration.textContent = formatTime(state.audio.duration);
    elements.progressBar.setAttribute('aria-valuemax', Math.floor(state.audio.duration));
  }
}

/**
 * Handle audio error event
 */
function handleAudioError() {
  showToast(ERROR_MESSAGES.E005, 'error');
  state.isPlaying = false;
  updatePlayPauseButton();
  updateControlState(false);
}

// ===== UI Update Functions =====

/**
 * Update progress bar and time display
 */
function updateProgressBar() {
  if (!state.audio || !state.audio.duration) return;

  const progress = (state.audio.currentTime / state.audio.duration) * 100;
  elements.progressFill.style.width = `${progress}%`;
  elements.currentTime.textContent = formatTime(state.audio.currentTime);
  elements.progressBar.setAttribute('aria-valuenow', Math.floor(state.audio.currentTime));
}

/**
 * Update character count display
 */
function updateCharCount() {
  const length = elements.textInput.value.length;
  elements.charCount.textContent = length;

  // Add visual warning if near limit
  if (length > MAX_TEXT_LENGTH * 0.9) {
    elements.charCount.parentElement.classList.add('warning');
  } else {
    elements.charCount.parentElement.classList.remove('warning');
  }
}

/**
 * Render history list
 */
function renderHistory() {
  elements.historyList.innerHTML = '';

  if (state.history.length === 0) {
    const emptyItem = document.createElement('li');
    emptyItem.className = 'history-empty';
    emptyItem.textContent = '재생 기록이 없습니다.';
    elements.historyList.appendChild(emptyItem);
    return;
  }

  state.history.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.setAttribute('data-index', index);

    const textSpan = document.createElement('span');
    textSpan.className = 'history-text';
    textSpan.textContent = item.text;
    textSpan.title = item.fullText || item.text;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'history-time';
    timeSpan.textContent = formatTimestamp(item.timestamp);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'history-delete';
    deleteBtn.innerHTML = '&times;';
    deleteBtn.setAttribute('aria-label', '삭제');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleDeleteHistoryItem(index, item.cacheKey);
    });

    const infoContainer = document.createElement('div');
    infoContainer.className = 'history-info';
    infoContainer.appendChild(textSpan);
    infoContainer.appendChild(timeSpan);

    li.appendChild(infoContainer);
    li.appendChild(deleteBtn);

    // Click to play
    infoContainer.addEventListener('click', () => {
      if (item.audioUrl) {
        loadAudio(item.audioUrl);
        playAudio();
      }
    });

    elements.historyList.appendChild(li);
  });
}

/**
 * Show toast notification
 * @param {string} message - Message to display
 * @param {string} type - Type of toast ('info', 'success', 'error')
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.setAttribute('role', 'alert');

  elements.toastContainer.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });

  // Auto-hide after duration
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }, TOAST_DURATION);
}

/**
 * Enable/disable control buttons
 * @param {boolean} enabled - Whether controls should be enabled
 */
function updateControlState(enabled) {
  elements.playPauseBtn.disabled = !enabled;
  elements.stopBtn.disabled = !enabled;
}

/**
 * Update play/pause button icon visibility
 */
function updatePlayPauseButton() {
  const playIcon = elements.playPauseBtn.querySelector('.icon-play');
  const pauseIcon = elements.playPauseBtn.querySelector('.icon-pause');

  if (state.isPlaying) {
    playIcon.style.display = 'none';
    pauseIcon.style.display = 'inline';
  } else {
    playIcon.style.display = 'inline';
    pauseIcon.style.display = 'none';
  }
}

// ===== Event Handlers =====

/**
 * Handle speak button click
 */
async function handleSpeak() {
  const text = elements.textInput.value.trim();

  // Validate input
  if (!text) {
    showToast(ERROR_MESSAGES.E001, 'error');
    return;
  }

  if (text.length > MAX_TEXT_LENGTH) {
    showToast(ERROR_MESSAGES.E002, 'error');
    return;
  }

  // Check if server speaker mode is enabled
  const useServerSpeaker = elements.serverSpeakerCheckbox.checked;

  // Show loading state
  elements.speakBtn.disabled = true;
  elements.speakBtn.textContent = '생성 중...';

  try {
    if (useServerSpeaker) {
      // Play directly on server speakers (no browser needed on server)
      const result = await requestServerSpeak(text);

      if (result && result.success) {
        // Add to history
        addToHistory({
          id: result.cacheKey || Date.now().toString(),
          text: truncateText(text, 50),
          fullText: text,
          audioUrl: `/api/audio/${result.cacheKey}`,
          cacheKey: result.cacheKey,
          timestamp: Date.now()
        });

        showToast('서버 스피커로 재생 중...', 'success');
      } else {
        throw new Error(ERROR_MESSAGES.E003);
      }
    } else {
      // Play on local browser
      const result = await requestSpeech(text);

      if (result && result.audioUrl) {
        // Add to history
        addToHistory({
          id: result.cacheKey || Date.now().toString(),
          text: truncateText(text, 50),
          fullText: text,
          audioUrl: result.audioUrl,
          cacheKey: result.cacheKey,
          timestamp: Date.now()
        });

        loadAudio(result.audioUrl);
        playAudio();
        showToast('음성이 생성되었습니다.', 'success');
      } else {
        throw new Error(ERROR_MESSAGES.E003);
      }
    }
  } catch (error) {
    showToast(error.message || ERROR_MESSAGES.E003, 'error');
  } finally {
    // Reset button state
    elements.speakBtn.disabled = false;
    elements.speakBtn.textContent = '읽어주기';
  }
}

/**
 * Handle progress bar click to seek
 * @param {MouseEvent} event - Click event
 */
function handleProgressClick(event) {
  if (!state.audio || !state.audio.duration) return;

  const rect = elements.progressBar.getBoundingClientRect();
  const clickX = event.clientX - rect.left;
  const percentage = clickX / rect.width;
  const seekTime = percentage * state.audio.duration;

  state.audio.currentTime = Math.max(0, Math.min(seekTime, state.audio.duration));
  updateProgressBar();
}

/**
 * Handle play/pause button click
 */
function handlePlayPause() {
  if (state.role === 'controller') {
    // Send command to speaker
    sendCommand(state.isPlaying ? 'pause' : 'play');
  } else {
    // Local playback
    if (state.isPlaying) {
      pauseAudio();
    } else {
      playAudio();
    }
  }
}

/**
 * Handle volume slider change
 * @param {Event} event - Input event
 */
function handleVolumeChange(event) {
  const value = parseInt(event.target.value, 10) / 100;
  setVolume(value);

  if (state.role === 'controller') {
    sendCommand('setVolume', { value });
  }
}

/**
 * Handle speed slider change
 * @param {Event} event - Input event
 */
function handleSpeedChange(event) {
  const value = parseInt(event.target.value, 10) / 100;
  setSpeed(value);

  if (state.role === 'controller') {
    sendCommand('setSpeed', { value });
  }
}

/**
 * Handle interval slider change
 * @param {Event} event - Input event
 */
function handleIntervalChange(event) {
  const value = parseFloat(event.target.value);
  setRepeatInterval(value);

  if (state.role === 'controller') {
    sendCommand('setInterval', { value });
  }
}

/**
 * Handle stop button click
 */
function handleStop() {
  if (state.role === 'controller') {
    sendCommand('stop');
  } else {
    stopAudio();
  }
}

/**
 * Handle repeat button click
 */
function handleRepeat() {
  toggleRepeat();

  if (state.role === 'controller') {
    sendCommand('setRepeat', { value: state.isRepeat });
  }
}

/**
 * Handle deleting a history item
 * @param {number} index - Index of item to delete
 * @param {string} cacheKey - Cache key to delete from server
 */
async function handleDeleteHistoryItem(index, cacheKey) {
  // Remove from local history
  state.history.splice(index, 1);
  saveHistory();
  renderHistory();

  // Delete from server cache if cacheKey exists
  if (cacheKey) {
    await deleteCache(cacheKey);
  }

  showToast('기록이 삭제되었습니다.', 'info');
}

// ===== History Management =====

/**
 * Add item to history
 * @param {Object} item - History item
 */
function addToHistory(item) {
  // Add to beginning of array
  state.history.unshift(item);

  // Limit to max items
  if (state.history.length > MAX_HISTORY_ITEMS) {
    state.history = state.history.slice(0, MAX_HISTORY_ITEMS);
  }

  // Save and render
  saveHistory();
  renderHistory();
}

/**
 * Save history to localStorage
 */
function saveHistory() {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(state.history));
  } catch (error) {
    console.error('Failed to save history:', error);
  }
}

/**
 * Load history from localStorage
 */
function loadHistory() {
  try {
    const saved = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (saved) {
      state.history = JSON.parse(saved);
    }
  } catch (error) {
    console.error('Failed to load history:', error);
    state.history = [];
  }
}

// ===== Utility Functions =====

/**
 * Format seconds to M:SS format
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted time
 */
function formatTime(seconds) {
  if (isNaN(seconds) || !isFinite(seconds)) return '0:00';

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format timestamp to relative time
 * @param {number} timestamp - Unix timestamp
 * @returns {string} Formatted relative time
 */
function formatTimestamp(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7) return `${days}일 전`;

  return new Date(timestamp).toLocaleDateString('ko-KR');
}

/**
 * Truncate text to specified length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// ===== WebSocket Functions =====

/**
 * Initialize WebSocket connection
 */
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  state.ws = new WebSocket(wsUrl);

  state.ws.onopen = () => {
    state.connected = true;
    console.log('WebSocket connected');

    // Register role based on checkbox state
    updateRole();
  };

  state.ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    } catch (error) {
      console.error('WebSocket message parse error:', error);
    }
  };

  state.ws.onclose = () => {
    state.connected = false;
    console.log('WebSocket disconnected');

    // Attempt to reconnect after 3 seconds
    setTimeout(initWebSocket, 3000);
  };

  state.ws.onerror = (error) => {
    console.error('WebSocket error:', error);
  };
}

/**
 * Update role based on checkbox state
 */
function updateRole() {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;

  const useServerSpeaker = elements.serverSpeakerCheckbox.checked;
  const newRole = useServerSpeaker ? 'controller' : 'speaker';

  if (state.role !== newRole) {
    state.role = newRole;
    state.ws.send(JSON.stringify({
      type: 'register',
      role: newRole
    }));
    console.log('Registered as:', newRole);
  }
}

/**
 * Handle incoming WebSocket messages
 */
function handleWebSocketMessage(data) {
  // Only speakers handle commands
  if (state.role !== 'speaker') return;

  switch (data.type) {
    case 'play':
      if (data.audioUrl) {
        loadAudio(data.audioUrl);
        playAudio();
      }
      break;

    case 'pause':
      pauseAudio();
      break;

    case 'stop':
      stopAudio();
      break;

    case 'setVolume':
      setVolume(data.value);
      break;

    case 'setSpeed':
      setSpeed(data.value);
      break;

    case 'setRepeat':
      if (state.isRepeat !== data.value) {
        toggleRepeat();
      }
      break;

    case 'setInterval':
      setRepeatInterval(data.value);
      break;
  }
}

/**
 * Send command to speakers via WebSocket
 */
function sendCommand(type, payload = {}) {
  if (!state.ws || state.ws.readyState !== WebSocket.OPEN) return;
  if (state.role !== 'controller') return;

  state.ws.send(JSON.stringify({
    type,
    ...payload
  }));
}

// ===== Initialization =====

document.addEventListener('DOMContentLoaded', () => {
  // Get DOM references
  elements = {
    textInput: document.getElementById('textInput'),
    charCount: document.getElementById('charCount'),
    speakBtn: document.getElementById('speakBtn'),
    serverSpeakerCheckbox: document.getElementById('serverSpeakerCheckbox'),
    playPauseBtn: document.getElementById('playPauseBtn'),
    stopBtn: document.getElementById('stopBtn'),
    repeatBtn: document.getElementById('repeatBtn'),
    volumeSlider: document.getElementById('volumeSlider'),
    volumeValue: document.getElementById('volumeValue'),
    speedSlider: document.getElementById('speedSlider'),
    speedValue: document.getElementById('speedValue'),
    intervalSlider: document.getElementById('intervalSlider'),
    intervalValue: document.getElementById('intervalValue'),
    progressBar: document.getElementById('progressBar'),
    progressFill: document.getElementById('progressFill'),
    currentTime: document.getElementById('currentTime'),
    duration: document.getElementById('duration'),
    historyList: document.getElementById('historyList'),
    toastContainer: document.getElementById('toastContainer')
  };

  // Set up event listeners
  elements.textInput.addEventListener('input', updateCharCount);
  elements.speakBtn.addEventListener('click', handleSpeak);
  elements.playPauseBtn.addEventListener('click', handlePlayPause);
  elements.stopBtn.addEventListener('click', handleStop);
  elements.repeatBtn.addEventListener('click', handleRepeat);
  elements.volumeSlider.addEventListener('input', handleVolumeChange);
  elements.speedSlider.addEventListener('input', handleSpeedChange);
  elements.intervalSlider.addEventListener('input', handleIntervalChange);
  elements.progressBar.addEventListener('click', handleProgressClick);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to speak
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSpeak();
    }
    // Space to play/pause (when not in textarea)
    if (e.key === ' ' && document.activeElement !== elements.textInput) {
      e.preventDefault();
      handlePlayPause();
    }
  });

  // Load saved history
  loadHistory();
  renderHistory();

  // Initialize slider displays
  setVolume(state.volume);
  setSpeed(state.speed);
  setRepeatInterval(state.interval);

  // Initial character count
  updateCharCount();

  // Initialize controls as disabled until audio is loaded
  updateControlState(false);

  // Initialize WebSocket connection
  initWebSocket();

  // Listen for checkbox changes to update role
  elements.serverSpeakerCheckbox.addEventListener('change', updateRole);
});
