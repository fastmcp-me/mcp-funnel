import { Hono } from 'hono';
import type { ServerStatus } from '../types/index.js';
import type { MCPProxy } from 'mcp-funnel';

type Variables = {
  mcpProxy: MCPProxy;
};

export const serversRoute = new Hono<{ Variables: Variables }>();

serversRoute.get('/', async (c) => {
  const mcpProxy = c.get('mcpProxy');

  // Get connected servers from MCP proxy
  const servers: ServerStatus[] = [];

  // This will need to be exposed from MCPProxy
  // For now, returning mock data structure
  for (const [name, _client] of mcpProxy.clients) {
    servers.push({
      name,
      status: 'connected',
      connectedAt: new Date().toISOString(),
    });
  }

  return c.json({ servers });
});

serversRoute.post('/:name/reconnect', async (c) => {
  const { name } = c.req.param();
  const _mcpProxy = c.get('mcpProxy');

  // TODO: Implement reconnection logic
  // This will need methods exposed from MCPProxy

  return c.json({
    success: true,
    message: `Reconnecting to ${name}...`,
  });
});

serversRoute.delete('/:name', async (c) => {
  const { name } = c.req.param();
  const _mcpProxy = c.get('mcpProxy');

  // TODO: Implement disconnection logic
  // This will need methods exposed from MCPProxy

  return c.json({
    success: true,
    message: `Disconnected from ${name}`,
  });
});
