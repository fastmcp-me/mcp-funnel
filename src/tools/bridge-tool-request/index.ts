import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ICoreTool, CoreToolContext } from '../core-tool.interface.js';
import { ProxyConfig } from '../../config.js';

export interface BridgeToolRequestParams {
  tool: string;
  arguments?: Record<string, unknown>;
}

export class BridgeToolRequest implements ICoreTool {
  readonly name = 'bridge_tool_request';

  get tool(): Tool {
    return {
      name: this.name,
      description:
        'Execute any discovered tool dynamically. First use get_tool_schema to understand the required arguments structure.',
      inputSchema: {
        type: 'object',
        properties: {
          tool: {
            type: 'string',
            description:
              'Full tool name from discover_tools_by_words (e.g., "github__create_issue")',
          },
          arguments: {
            type: 'object',
            description:
              'Arguments matching the tool\'s inputSchema (obtained from get_tool_schema)',
            additionalProperties: true,
          },
        },
        required: ['tool'],
      },
    };
  }

  isEnabled(config: ProxyConfig): boolean {
    return config.hackyDiscovery === true;
  }

  async handle(
    args: Record<string, unknown>,
    context: CoreToolContext,
  ): Promise<CallToolResult> {
    if (typeof args.tool !== 'string') {
      throw new Error('Missing or invalid "tool" parameter');
    }

    const toolName = args.tool;
    const toolArguments = args.arguments as Record<string, unknown> | undefined;

    if (!context.toolMapping) {
      throw new Error('Tool mapping not available in context');
    }

    const mapping = context.toolMapping.get(toolName);
    if (!mapping) {
      return {
        content: [
          {
            type: 'text',
            text: `Tool not found: ${toolName}. Use discover_tools_by_words to find available tools.`,
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await mapping.client.callTool({
        name: mapping.originalName,
        arguments: toolArguments,
      });

      return result as CallToolResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Failed to execute tool ${toolName}: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
}