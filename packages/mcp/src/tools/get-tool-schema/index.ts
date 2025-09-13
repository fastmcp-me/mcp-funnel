import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { CoreToolContext } from '../core-tool.interface.js';
import { BaseCoreTool } from '../base-core-tool.js';
import { resolveToolName } from '../../utils/tool-resolver.js';

export interface GetToolSchemaParams {
  tool: string;
}

export class GetToolSchema extends BaseCoreTool {
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

  async handle(
    args: Record<string, unknown>,
    context: CoreToolContext,
  ): Promise<CallToolResult> {
    if (typeof args.tool !== 'string') {
      throw new Error('Missing or invalid "tool" parameter');
    }

    // First check if we have tool mapping for short name resolution
    let toolName = args.tool;

    if (context.toolMapping) {
      // Use the shared resolver for consistent short name support
      const resolution = resolveToolName(
        args.tool,
        context.toolMapping,
        context.config,
      );

      if (!resolution.resolved) {
        return {
          content: [
            {
              type: 'text',
              text:
                resolution.error?.message ||
                `Tool not found: ${args.tool}. Use discover_tools_by_words to find available tools.`,
            },
          ],
        };
      }

      toolName = resolution.toolName!;
    }

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
