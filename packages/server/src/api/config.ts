import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { ConfigUpdateSchema } from '../types/index.js';

export const configRoute = new Hono();

configRoute.get('/', async (c) => {
  const mcpProxy = c.get('mcpProxy');
  
  return c.json({
    config: {
      servers: mcpProxy.config.servers.map(s => ({
        name: s.name,
        command: s.command,
        args: s.args
      })),
      hideTools: mcpProxy.config.hideTools || [],
      exposeTools: mcpProxy.config.exposeTools || [],
      enableDynamicDiscovery: mcpProxy.config.enableDynamicDiscovery || false,
      hackyDiscovery: mcpProxy.config.hackyDiscovery || false
    }
  });
});

configRoute.patch(
  '/',
  zValidator('json', ConfigUpdateSchema),
  async (c) => {
    const updates = c.req.valid('json');
    const mcpProxy = c.get('mcpProxy');
    
    // Update configuration
    if (updates.hideTools !== undefined) {
      mcpProxy.config.hideTools = updates.hideTools;
    }
    if (updates.exposeTools !== undefined) {
      mcpProxy.config.exposeTools = updates.exposeTools;
    }
    if (updates.enableDynamicDiscovery !== undefined) {
      mcpProxy.config.enableDynamicDiscovery = updates.enableDynamicDiscovery;
    }
    if (updates.hackyDiscovery !== undefined) {
      mcpProxy.config.hackyDiscovery = updates.hackyDiscovery;
    }
    
    // Notify about configuration change
    mcpProxy.server.sendToolListChanged();
    
    return c.json({
      success: true,
      config: {
        hideTools: mcpProxy.config.hideTools,
        exposeTools: mcpProxy.config.exposeTools,
        enableDynamicDiscovery: mcpProxy.config.enableDynamicDiscovery,
        hackyDiscovery: mcpProxy.config.hackyDiscovery
      }
    });
  }
);