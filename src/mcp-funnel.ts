import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  type Tool,
  type CallToolResult,
  type Notification,
} from '@modelcontextprotocol/sdk/types.js';
import { ProxyConfig } from './config.js';
import * as readline from 'readline';
import { spawn, ChildProcess } from 'child_process';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { ICoreTool, CoreToolContext } from './tools/core-tool.interface.js';
import { DiscoverToolsByWords } from './tools/discover-tools-by-words/index.js';
import { GetToolSchema } from './tools/get-tool-schema/index.js';
import { BridgeToolRequest } from './tools/bridge-tool-request/index.js';
import { LoadToolset } from './tools/load-toolset/index.js';

import Package from '../package.json';

interface TransportOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

// Custom transport that prefixes server stderr logs
export class PrefixedStdioClientTransport {
  private readonly serverName: string;
  private process?: ChildProcess;
  private messageHandlers: ((message: JSONRPCMessage) => void)[] = [];
  private errorHandlers: ((error: Error) => void)[] = [];
  private closeHandlers: (() => void)[] = [];

  constructor(
    serverName: string,
    private options: TransportOptions,
  ) {
    this.serverName = serverName;
  }

  async start(): Promise<void> {
    // Spawn the process with full control over stdio
    this.process = spawn(this.options.command, this.options.args || [], {
      env: this.options.env,
      stdio: ['pipe', 'pipe', 'pipe'], // Full control over all streams
    });

    // Handle stderr with prefixing
    if (this.process.stderr) {
      const rl = readline.createInterface({
        input: this.process.stderr,
        crlfDelay: Infinity,
      });

      rl.on('line', (line: string) => {
        if (line.trim()) {
          console.error(`[${this.serverName}] ${line}`);
        }
      });
    }

    // Handle stdout for MCP protocol messages
    if (this.process.stdout) {
      const rl = readline.createInterface({
        input: this.process.stdout,
        crlfDelay: Infinity,
      });

      rl.on('line', (line: string) => {
        if (line.trim()) {
          try {
            const message = JSON.parse(line) as JSONRPCMessage;
            this.messageHandlers.forEach((handler) => handler(message));
          } catch {
            // Not a JSON message, might be a log line that went to stdout
            console.error(`[${this.serverName}] ${line}`);
          }
        }
      });
    }

    // Handle process errors and exit
    this.process.on('error', (error) => {
      this.errorHandlers.forEach((handler) => handler(error));
    });

    this.process.on('close', () => {
      this.closeHandlers.forEach((handler) => handler());
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.process?.stdin) {
      throw new Error('Transport not started');
    }
    this.process.stdin.write(JSON.stringify(message) + '\n');
  }

  async close(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
  }

  set onmessage(handler: (message: JSONRPCMessage) => void) {
    this.messageHandlers.push(handler);
  }

  set onerror(handler: (error: Error) => void) {
    this.errorHandlers.push(handler);
  }

  set onclose(handler: () => void) {
    this.closeHandlers.push(handler);
  }
}

export class MCPProxy {
  private server: Server;
  private clients: Map<string, Client> = new Map();
  private config: ProxyConfig;
  private toolMapping: Map<string, { client: Client; originalName: string }> =
    new Map();
  private dynamicallyEnabledTools: Set<string> = new Set();
  private toolDescriptionCache: Map<
    string,
    { serverName: string; description: string }
  > = new Map();
  private toolDefinitionCache: Map<string, { serverName: string; tool: Tool }> =
    new Map();
  private coreTools: Map<string, ICoreTool> = new Map();

  constructor(config: ProxyConfig) {
    this.config = config;
    this.server = new Server(
      {
        name: 'mcp-funnel',
        version: Package.version,
      },
      {
        capabilities: {
          tools: {
            listChanged: true, // Support dynamic tool updates
          },
        },
      },
    );
  }

  async initialize() {
    this.registerCoreTools();
    await this.connectToTargetServers();
    this.setupRequestHandlers();
  }

  private registerCoreTools() {
    const tools: ICoreTool[] = [
      new DiscoverToolsByWords(),
      new GetToolSchema(),
      new BridgeToolRequest(),
      new LoadToolset(),
    ];

    for (const tool of tools) {
      if (tool.isEnabled(this.config)) {
        this.coreTools.set(tool.name, tool);
        if (tool.onInit) {
          tool.onInit(this.createToolContext());
        }
        console.error(`[proxy] Registered core tool: ${tool.name}`);
      }
    }
  }

  private createToolContext(): CoreToolContext {
    return {
      toolDescriptionCache: this.toolDescriptionCache,
      toolDefinitionCache: this.toolDefinitionCache,
      toolMapping: this.toolMapping,
      dynamicallyEnabledTools: this.dynamicallyEnabledTools,
      config: this.config,
      enableTools: (toolNames: string[]) => {
        for (const toolName of toolNames) {
          this.dynamicallyEnabledTools.add(toolName);
          console.error(`[proxy] Dynamically enabled tool: ${toolName}`);
        }
        // Send notification that the tool list has changed
        this.server.sendToolListChanged();
        console.error(`[proxy] Sent tools/list_changed notification`);
      },
      sendNotification: async (
        method: string,
        params?: Record<string, unknown>,
      ) => {
        // Create a properly typed notification object that conforms to the Notification interface
        const notification: Notification = {
          method,
          ...(params !== undefined && { params }),
        };
        // Type assertion is required because the Server class restricts notifications to specific types,
        // but this function needs to support arbitrary custom notifications
        this.server.notification(notification as Notification);
      },
    };
  }

  private async connectToTargetServers() {
    const connectionPromises = this.config.servers.map(async (targetServer) => {
      const client = new Client({
        name: `proxy-client-${targetServer.name}`,
        version: '1.0.0',
      });

      const transport = new PrefixedStdioClientTransport(targetServer.name, {
        command: targetServer.command,
        args: targetServer.args || [],
        env: { ...process.env, ...targetServer.env } as Record<string, string>,
      });

      await client.connect(transport);
      this.clients.set(targetServer.name, client);
      console.error(`[proxy] Connected to: ${targetServer.name}`);
    });

    await Promise.all(connectionPromises);
  }

  private matchesPattern(toolName: string, pattern: string): boolean {
    // Convert wildcard pattern to regex
    // * matches any sequence of characters
    const regexPattern = pattern
      .split('*')
      .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) // Escape special regex chars
      .join('.*'); // Replace * with .*

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(toolName);
  }

  private shouldExposeTool(serverName: string, toolName: string): boolean {
    // Create the full tool name with server prefix
    const fullToolName = `${serverName}__${toolName}`;

    // Check if dynamically enabled
    if (this.dynamicallyEnabledTools.has(fullToolName)) {
      return true;
    }

    if (this.config.exposeTools) {
      // Check if tool matches any expose pattern (only checking prefixed name)
      return this.config.exposeTools.some((pattern) =>
        this.matchesPattern(fullToolName, pattern),
      );
    }
    if (this.config.hideTools) {
      // Check if tool matches any hide pattern (only checking prefixed name)
      return !this.config.hideTools.some((pattern) =>
        this.matchesPattern(fullToolName, pattern),
      );
    }
    return true;
  }

  private setupRequestHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const allTools: Tool[] = [];

      // In hacky discovery mode, only expose core tools
      if (this.config.hackyDiscovery) {
        for (const coreTool of this.coreTools.values()) {
          allTools.push(coreTool.tool);
        }
        // Still populate the tool caches for bridge/schema tools
        await this.populateToolCaches();
        return { tools: allTools };
      }

      // Add core tools
      for (const coreTool of this.coreTools.values()) {
        allTools.push(coreTool.tool);
      }

      for (const [serverName, client] of this.clients) {
        try {
          const response = await client.listTools();

          for (const tool of response.tools) {
            const fullToolName = `${serverName}__${tool.name}`;

            // Cache tool descriptions and definitions for discovery
            this.toolDescriptionCache.set(fullToolName, {
              serverName,
              description: tool.description || '',
            });
            this.toolDefinitionCache.set(fullToolName, {
              serverName,
              tool,
            });

            // Always register in toolMapping for call handling
            this.toolMapping.set(fullToolName, {
              client,
              originalName: tool.name,
            });

            // If dynamic discovery is enabled, check if tool was dynamically enabled
            if (this.config.enableDynamicDiscovery) {
              if (!this.dynamicallyEnabledTools.has(fullToolName)) {
                continue; // Skip tools not yet enabled
              }
              // Tool was dynamically enabled, add it to the list
              allTools.push({
                ...tool,
                name: fullToolName,
                description: `[${serverName}] ${tool.description || ''}`,
              });
              continue;
            }

            // Check filtering against both the original tool name and the prefixed name
            if (this.shouldExposeTool(serverName, tool.name)) {
              allTools.push({
                ...tool,
                name: fullToolName,
                description: `[${serverName}] ${tool.description || ''}`,
              });
            }
          }
        } catch (error) {
          console.error(
            `[proxy] Failed to list tools from ${serverName}:`,
            error,
          );
        }
      }

      return { tools: allTools };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name: toolName, arguments: toolArgs } = request.params;

      // Handle core tools
      const coreTool = this.coreTools.get(toolName);
      if (coreTool) {
        return coreTool.handle(toolArgs ?? {}, this.createToolContext());
      }

      const mapping = this.toolMapping.get(toolName);
      if (!mapping) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      try {
        const result = await mapping.client.callTool({
          name: mapping.originalName,
          arguments: toolArgs,
        });

        return result as CallToolResult;
      } catch (error) {
        console.error(`[proxy] Failed to call tool ${toolName}:`, error);
        throw error;
      }
    });
  }

  private async populateToolCaches() {
    for (const [serverName, client] of this.clients) {
      try {
        const response = await client.listTools();
        for (const tool of response.tools) {
          const fullToolName = `${serverName}__${tool.name}`;

          // Cache tool descriptions and definitions
          this.toolDescriptionCache.set(fullToolName, {
            serverName,
            description: tool.description || '',
          });
          this.toolDefinitionCache.set(fullToolName, {
            serverName,
            tool,
          });

          // Always register in toolMapping for call handling
          this.toolMapping.set(fullToolName, {
            client,
            originalName: tool.name,
          });
        }
      } catch (error) {
        console.error(
          `[proxy] Failed to cache tools from ${serverName}:`,
          error,
        );
      }
    }
  }

  async start() {
    await this.initialize();
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[proxy] Server started successfully');
  }
}

// Export for library usage
export type { ProxyConfig, ProxyConfigSchema } from './config.js';
