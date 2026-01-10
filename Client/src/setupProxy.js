const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  const target = process.env.REACT_APP_API_URL || 'http://localhost:3044';
  
  app.use(
    '/api',
    createProxyMiddleware({
      target: target,
      changeOrigin: true,
    })
  );
  
  // Also proxy socket.io for WebSocket connections
  app.use(
    '/socket.io',
    createProxyMiddleware({
      target: target,
      changeOrigin: true,
      ws: true,
    })
  );
};
