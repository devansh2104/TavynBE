const http = require('http');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const { init } = require('./utils/socket');

dotenv.config();
const app = express();
const prisma = new PrismaClient();

// ==========================================
// 1. SECURITY & PERFORMANCE MIDDLEWARE
// ==========================================
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

// ==========================================
// 2. RATE LIMITING
// ==========================================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { message: 'Too many requests from this IP' }
});
app.use('/api/', apiLimiter);

// ==========================================
// 3. MOUNT CORE APIS
// ==========================================
app.use('/api/v1/auth', require('./routes/auth').router);
app.use('/api/v1/hostels', require('./routes/hostels'));
app.use('/api/v1/floors', require('./routes/floors'));
app.use('/api/v1/rooms', require('./routes/rooms'));
app.use('/api/v1/beds', require('./routes/beds'));
app.use('/api/v1/tenants', require('./routes/tenants'));
app.use('/api/v1/documents', require('./routes/documents'));
app.use('/api/v1/finance', require('./routes/finance'));
app.use('/api/v1/electricity', require('./routes/electricity'));
app.use('/api/v1/receipts', require('./routes/receipts'));
app.use('/api/v1/dashboard', require('./routes/dashboard'));
app.use('/api/v1/monthly', require('./routes/monthly'));
app.use('/api/v1/staff', require('./routes/staff'));
app.use('/api/v1/access-control', require('./routes/accessControl'));

// ==========================================
// 4. ROBUST ERROR HANDLING
// ==========================================
app.use((req, res, next) => {
  res.status(404).json({ message: `Route not found: ${req.originalUrl}` });
});

app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});

// ==========================================
// 5. SERVER INITIALIZATION & WEBSOCKETS
// ==========================================
const PORT = process.env.PORT || 5000;
const httpServer = http.createServer(app);

// Initialize WebSockets
const io = init(httpServer);
io.on('connection', (socket) => {
  console.log('🔌 New WebSocket client connected: ' + socket.id);

  // Allow clients to request a real-time broadcast / test ping
  socket.on('ping_dashboard', (payload) => {
    console.log('📡 WebSocket ping received, broadcasting dashboard_update...');
    io.emit('dashboard_update', {
      type: payload?.type || 'LIVE_SYNC',
      message: payload?.message || 'Real-time sync triggered via WebSocket',
      timestamp: new Date().toISOString(),
      ...payload
    });
  });

  socket.on('disconnect', () => console.log('🔌 WebSocket client disconnected: ' + socket.id));
});

const server = httpServer.listen(PORT, () => {
  console.log(`🚀 Secure Production-Ready Server running on port ${PORT}`);
});

// Graceful Shutdown
const shutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...');
  if(require('./middlewares/redisCache').redisClient.isReady) {
    await require('./middlewares/redisCache').redisClient.quit();
  }
  await prisma.$disconnect();
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
