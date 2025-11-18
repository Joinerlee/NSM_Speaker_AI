# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NSM AI Speaker - 과학관 방문객을 위한 음성 기반 AI 안내 서비스. Google Gemini API를 사용하여 텍스트를 음성으로 변환하고, 생성된 음성을 캐싱하여 재사용.

## Development Commands

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run production server
npm start

# Docker build and run
docker-compose build
docker-compose up -d

# Check host IP for network access
ipconfig
```

## Architecture

### Tech Stack
- **Backend**: Node.js + Express.js
- **Frontend**: Vanilla HTML/CSS/JavaScript
- **API**: Google Gemini API (TTS)
- **Deployment**: Docker (for network access from mobile devices)

### Directory Structure
```
server/
├── index.js          # Express server entry (binds to 0.0.0.0:3000)
├── routes/api.js     # API endpoints
├── services/
│   ├── gemini.js     # Gemini API integration
│   └── cache.js      # LRU cache management
└── utils/helpers.js  # Utility functions

public/
├── index.html        # Main UI
├── css/style.css     # Styles (mascot-based color palette)
├── js/app.js         # Client-side audio controls
└── images/mascot.png # Mascot image

cache/
├── audio/            # Cached audio files
└── metadata/         # Cache index (cache-index.json)
```

### Key API Endpoints
- `POST /api/speak` - Generate speech (checks cache first)
- `GET /api/audio/:id` - Stream cached audio
- `GET /api/history` - Get playback history
- `DELETE /api/cache/:id` - Delete specific cache
- `DELETE /api/cache` - Clear all cache

### Design System
Colors based on mascot characters:
- Primary (Yellow): #F5D547
- Secondary (Orange): #E88B5A
- Tertiary (Sky Blue): #7EB5D6

## Task Tracking Workflow

**Important**: After completing each task, update `plans.md` by checking off completed items. This ensures progress is tracked and visible.

## Network Access

The server binds to `0.0.0.0` to allow access from other devices on the same WiFi network. Access via `http://[host-ip]:3000` from mobile devices.
