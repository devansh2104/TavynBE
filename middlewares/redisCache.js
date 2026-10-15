const { createClient } = require('redis');

// Initialize Redis Client
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Graceful error handling so the server doesn't crash if Redis isn't installed locally
redisClient.on('error', (err) => {
  // Suppress verbose logging if simply not connected locally
  if (err.code !== 'ECONNREFUSED') {
    console.error('Redis Client Error:', err);
  }
});

// Attempt connection
(async () => {
  try {
    await redisClient.connect();
    console.log('✅ Connected to Redis successfully');
  } catch (err) {
    console.log('⚠️ Redis not running locally. Caching will gracefully be bypassed.');
  }
})();

/**
 * Express Middleware for API Caching
 * @param {string} keyPrefix - Prefix for the redis key (e.g., 'dashboard')
 * @param {number} ttlSeconds - Time to live in seconds
 */
const cache = (keyPrefix, ttlSeconds = 60) => {
  return async (req, res, next) => {
    // 1. Bypass if Redis is down
    if (!redisClient.isReady) return next();

    // 2. Construct a unique cache key based on the user ID and exact URL
    // e.g., "dashboard_user123_/api/v1/dashboard/overview"
    const userId = req.user?.id || 'public';
    const key = `${keyPrefix}_${userId}_${req.originalUrl}`;

    try {
      // 3. Check if we have a cached response
      const cachedData = await redisClient.get(key);
      if (cachedData) {
        console.log(`⚡ Serving from Redis Cache: ${key}`);
        return res.json(JSON.parse(cachedData));
      }

      // 4. If not cached, we intercept the original res.json function
      const originalJson = res.json.bind(res);
      res.json = (body) => {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          redisClient.setEx(key, ttlSeconds, JSON.stringify(body)).catch(console.error);
        }
        // Send the actual response back to the client
        originalJson(body);
      };

      next();
    } catch (error) {
      console.error('Redis Cache Middleware Error:', error);
      next();
    }
  };
};

module.exports = { redisClient, cache };
