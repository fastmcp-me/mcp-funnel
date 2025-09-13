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
              "Arguments matching the tool's inputSchema (obtained from get_tool_schema)",
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

    let toolName = args.tool;
    const toolArguments = args.arguments as Record<string, unknown> | undefined;

    if (!context.toolMapping) {
      throw new Error('Tool mapping not available in context');
    }

    let mapping = context.toolMapping.get(toolName);
    if (!mapping) {
      const allowShort = context.config.allowShortToolNames === true;
      const looksShort = !toolName.includes('__');
      if (allowShort && looksShort) {
        const candidates = Array.from(context.toolMapping.keys()).filter((k) =>
          k.endsWith(`__${toolName}`),
        );
        if (candidates.length === 1) {
          toolName = candidates[0];
          mapping = context.toolMapping.get(toolName);
        } else if (candidates.length > 1) {
          const list = candidates.slice(0, 5).join(', ');
          return {
            content: [
              {
                type: 'text',
                text: `Ambiguous tool name: ${args.tool}. Candidates: ${list}. Use the full prefixed name exactly as listed by discovery.`,
              },
            ],
            isError: true,
          };
        }
      }
    }
    if (!mapping) {
      const lower = toolName.toLowerCase();
      const suggestions = Array.from(context.toolMapping.keys())
        .filter((k) => k.toLowerCase().includes(lower))
        .slice(0, 3);
      const hintParts = [
        `Tool not found: ${args.tool}. Use discover_tools_by_words to find available tools.`,
        'To execute a tool, always use the fully prefixed name (e.g., "server__tool").',
      ];
      if (suggestions.length > 0) {
        hintParts.push(`Did you mean: ${suggestions.join(', ')} ?`);
      }
      hintParts.push(
        'Recommended flow: get_tool_schema for the tool, then use bridge_tool_request with {"tool":"<full_name>","arguments":{...}}.',
      );
      return {
        content: [
          {
            type: 'text',
            text: hintParts.join(' '),
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
      const errorMessage =
        error instanceof Error ? error.message : String(error);
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
