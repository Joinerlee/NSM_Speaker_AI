/**
 * NSM AI Speaker - Express Server
 * Main entry point for the backend application
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const http = require('http');
const WebSocket = require('ws');

// Import routes
const apiRoutes = require('./routes/api');

// Initialize Express app
const app = express();

// Create HTTP server for both Express and WebSocket
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ server });

// Store connected clients by role
const clients = {
  speakers: new Set(),    // PC browsers that play audio
  controllers: new Set()  // Mobile browsers that control
};

// WebSocket connection handler
wss.on('connection', (ws) => {
  console.log('New WebSocket connection');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      // Handle role registration
      if (data.type === 'register') {
        if (data.role === 'speaker') {
          clients.speakers.add(ws);
          ws.role = 'speaker';
          console.log('Speaker registered. Total speakers:', clients.speakers.size);
        } else if (data.role === 'controller') {
          clients.controllers.add(ws);
          ws.role = 'controller';
          console.log('Controller registered. Total controllers:', clients.controllers.size);
        }
        return;
      }

      // Forward commands from controllers to speakers
      if (ws.role === 'controller') {
        clients.speakers.forEach(speaker => {
          if (speaker.readyState === WebSocket.OPEN) {
            speaker.send(JSON.stringify(data));
          }
        });
      }

      // Forward status updates from speakers to controllers
      if (ws.role === 'speaker' && data.type === 'status') {
        clients.controllers.forEach(controller => {
          if (controller.readyState === WebSocket.OPEN) {
            controller.send(JSON.stringify(data));
          }
        });
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });

  ws.on('close', () => {
    if (ws.role === 'speaker') {
      clients.speakers.delete(ws);
      console.log('Speaker disconnected. Total speakers:', clients.speakers.size);
    } else if (ws.role === 'controller') {
      clients.controllers.delete(ws);
      console.log('Controller disconnected. Total controllers:', clients.controllers.size);
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Port configuration
const PORT = process.env.PORT || 3000;

// Middleware setup
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files from public folder
app.use(express.static(path.join(__dirname, '../public')));

// API routes
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: true,
    code: 'E001',
    message: 'API endpoint not found'
  });
});

// Serve index.html for all other routes (SPA support)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: true,
    code: 'E005',
    message: 'Internal server error'
  });
});

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Start server (using HTTP server for WebSocket support)
server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();

  console.log('');
  console.log('========================================');
  console.log('   NSM AI Speaker Server Started');
  console.log('========================================');
  console.log('');
  console.log(`  Local:    http://localhost:${PORT}`);
  console.log(`  Network:  http://${localIP}:${PORT}`);
  console.log('');
  console.log('  WebSocket: enabled');
  console.log('  Environment:', process.env.NODE_ENV || 'development');
  console.log('========================================');
  console.log('');
});

module.exports = { app, server, wss };
