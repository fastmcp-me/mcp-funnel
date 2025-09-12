import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { serversRoute } from './api/servers.js';
import { toolsRoute } from './api/tools.js';
import { configRoute } from './api/config.js';
import { WebSocketManager } from './ws/manager.js';
import type { MCPProxy } from 'mcp-funnel';

export interface ServerOptions {
  port?: number;
  host?: string;
  staticPath?: string;
}

type Variables = {
  mcpProxy: MCPProxy;
};

export async function startWebServer(
  mcpProxy: MCPProxy,
  options: ServerOptions = {},
) {
  const { port = 3456, host = 'localhost', staticPath } = options;

  const app = new Hono<{ Variables: Variables }>();

  // Middleware
  app.use('*', cors());
  app.use('*', logger());

  // Store MCP proxy instance in context
  app.use('*', async (c, next) => {
    c.set('mcpProxy', mcpProxy);
    await next();
  });

  // API routes
  app.route('/api/servers', serversRoute);
  app.route('/api/tools', toolsRoute);
  app.route('/api/config', configRoute);

  // Health check
  app.get('/api/health', (c) => {
    return c.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '0.0.1',
    });
  });

  // Serve static files in production
  if (staticPath) {
    const { serveStatic } = await import('@hono/node-server/serve-static');
    app.use('/*', serveStatic({ root: staticPath }));
  }

  // Create HTTP server with Hono
  const server = serve({
    fetch: app.fetch,
    port,
    hostname: host,
    createServer,
  });

  // Setup WebSocket server
  const wss = new WebSocketServer({ noServer: true });
  const wsManager = new WebSocketManager(mcpProxy);

  server.on('upgrade', (request, socket, head) => {
    if (request.url === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    wsManager.handleConnection(ws);
  });

  // Start server
  return new Promise<void>((resolve) => {
    server.listen(port, host, () => {
      console.info(`🚀 Web UI server running at http://${host}:${port}`);
      resolve();
    });
  });
}

// Type augmentation for Hono context
declare module 'hono' {
  interface ContextVariableMap {
    mcpProxy: MCPProxy;
  }
}
