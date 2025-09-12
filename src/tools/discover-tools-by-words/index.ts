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
  const keywords = words.toLowerCase().split(/\s+/).filter(Boolean);
  const matches: ToolMatch[] = [];

  for (const [toolName, { serverName, description }] of toolDescriptions) {
    const lowerDesc = description.toLowerCase();
    let score = 0;

    // Calculate match score based on keyword presence
    for (const keyword of keywords) {
      if (lowerDesc.includes(keyword)) {
        // Higher score for exact word match vs substring match
        const wordBoundaryMatch = new RegExp(`\\b${keyword}\\b`, 'i').test(
          description,
        );
        score += wordBoundaryMatch ? 2 : 1;
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

  // Sort by score (highest first), then alphabetically
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
            text: `Found and enabled ${matches.length} tools:\n${enabledList}`,
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
      .map((m) => `- ${m.name}: ${m.description}`)
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `Found ${matches.length} matching tools:\n${matchList}\n\nUse enable=true to activate these tools.`,
        },
      ],
    };
  }
}
