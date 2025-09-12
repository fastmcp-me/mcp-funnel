import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ICoreTool, CoreToolContext } from '../core-tool.interface.js';
import { ProxyConfig } from '../../config.js';

export interface GetToolSchemaParams {
  tool: string;
}

export class GetToolSchema implements ICoreTool {
  readonly name = 'get_tool_schema';

  get tool(): Tool {
    return {
      name: this.name,
      description:
        'Get the input schema for a specific tool. Use the returned schema to understand what arguments are required for bridge_tool_request.',
      inputSchema: {
        type: 'object',
        properties: {
          tool: {
            type: 'string',
            description:
              'Full tool name including server prefix (e.g., "github__create_issue")',
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
    const toolDefinition = context.toolDefinitionCache?.get(toolName);

    if (!toolDefinition) {
      return {
        content: [
          {
            type: 'text',
            text: `Tool not found: ${toolName}. Use discover_tools_by_words to find available tools.`,
          },
        ],
      };
    }

    const response = {
      tool: toolName,
      inputSchema: toolDefinition.tool.inputSchema || {
        type: 'object',
        properties: {},
      },
      description: toolDefinition.tool.description || '',
      usage: `To call this tool, use bridge_tool_request with:\n{\n  "tool": "${toolName}",\n  "arguments": <object matching inputSchema>\n}`,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2),
        },
      ],
    };
  }
}