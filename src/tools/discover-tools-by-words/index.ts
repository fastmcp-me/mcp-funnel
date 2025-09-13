import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ICoreTool, CoreToolContext } from '../core-tool.interface.js';
import { ProxyConfig } from '../../config.js';

export interface DiscoverToolsParams {
  words: string;
  enable?: boolean;
}

export interface ToolMatch {
  name: string;
  serverName: string;
  description: string;
  score: number;
}

function searchToolDescriptions(
  words: string,
  toolDescriptions: Map<string, { serverName: string; description: string }>,
): ToolMatch[] {
  // Split on whitespace and hyphens to capture queries like "code-reasoning"
  const keywords = words.toLowerCase().split(/[\s-]+/).filter(Boolean);
  const matches: ToolMatch[] = [];

  for (const [toolName, { serverName, description }] of toolDescriptions) {
    const lowerDesc = description.toLowerCase();
    const lowerName = toolName.toLowerCase();
    const lowerServer = serverName.toLowerCase();
    const nameTokens = lowerName.split(/[^a-z0-9]+/).filter(Boolean);
    const serverTokens = lowerServer.split(/[^a-z0-9]+/).filter(Boolean);

    let score = 0;

    // Calculate match score across description, tool name, and server name
    for (const keyword of keywords) {
      // Description scoring: prefer whole-word matches over substrings
      if (lowerDesc.includes(keyword)) {
        const wordBoundaryMatch = new RegExp(`\\b${keyword}\\b`, 'i').test(
          description,
        );
        score += wordBoundaryMatch ? 2 : 1;
      }

      // Tool name scoring: token match preferred, then substring
      if (nameTokens.includes(keyword)) {
        score += 2;
      } else if (lowerName.includes(keyword)) {
        score += 1;
      }

      // Server name scoring: token match preferred, then substring
      if (serverTokens.includes(keyword)) {
        score += 2;
      } else if (lowerServer.includes(keyword)) {
        score += 1;
      }
    }

    if (score > 0) {
      matches.push({
        name: toolName,
        serverName,
        description,
        score,
      });
    }
  }

  // Sort by score (highest first), then alphabetically for stable output
  return matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Core tool for discovering and dynamically enabling MCP tools based on keyword search
 * @since 1.0.0
 * @version 1.0.0
 * @category Tools
 * @internal
 * @see file://../core-tool.interface.ts#L33
 */
export class DiscoverToolsByWords implements ICoreTool {
  readonly name = 'discover_tools_by_words';

  get tool(): Tool {
    return {
      name: this.name,
      description:
        'Search for tools by keywords in their descriptions. Returns matching tools that can be dynamically enabled to reduce context usage.',
      inputSchema: {
        type: 'object',
        properties: {
          words: {
            type: 'string',
            description:
              'Space-separated keywords to search for in tool descriptions',
          },
          enable: {
            type: 'boolean',
            description: 'If true, automatically enable the discovered tools',
            default: false,
          },
        },
        required: ['words'],
      },
    };
  }

  isEnabled(config: ProxyConfig): boolean {
    return config.enableDynamicDiscovery === true;
  }

  async handle(
    args: Record<string, unknown>,
    context: CoreToolContext,
  ): Promise<CallToolResult> {
    // Validate args conform to DiscoverToolsParams
    if (typeof args.words !== 'string') {
      throw new Error('Missing or invalid "words" parameter');
    }

    const typedArgs: DiscoverToolsParams = {
      words: args.words,
      enable: typeof args.enable === 'boolean' ? args.enable : false,
    };

    const matches = searchToolDescriptions(
      typedArgs.words,
      context.toolDescriptionCache,
    );

    if (typedArgs.enable && matches.length > 0) {
      // Enable the discovered tools
      const toolNames = matches.map((m) => m.name);
      context.enableTools(toolNames);

      // TODO: When notification support is added, notify clients
      // if (context.sendNotification) {
      //   await context.sendNotification('tools/list_changed');
      // }

      const enabledList = matches
        .map((m) => `- ${m.name}: ${m.description}`)
        .join('\n');

      return {
        content: [
          {
            type: 'text',
            text: `Found and enabled ${matches.length} tools:\n${enabledList}\n\nNote: Always call tools using the fully prefixed name exactly as listed. To run a tool next, use bridge_tool_request with {"tool":"<full_name>","arguments":{...}} and consult get_tool_schema first for required arguments.`,
          },
        ],
      };
    }

    if (matches.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: `No tools found matching keywords: ${typedArgs.words}`,
          },
        ],
      };
    }

    const matchList = matches
      .map(
        (m) =>
          `- ${m.name}: ${m.description}\n  Example: bridge_tool_request {"tool":"${m.name}","arguments":{}}`,
      )
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `Found ${matches.length} matching tools:\n${matchList}\n\nTip: Always use the fully prefixed name when executing. Use enable=true to activate these tools if dynamic discovery is desired.`,
        },
      ],
    };
  }
}
