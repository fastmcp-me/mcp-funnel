import { MCPProxy } from './mcp-funnel.js';
import { ProxyConfig, ProxyConfigSchema } from './config.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

async function main() {
  // Config resolution:
  // 1. Explicit: npx mcp-funnel path/to/config.json
  // 2. Implicit: npx mcp-funnel (uses .mcp-funnel.json from cwd)
  const configPath = process.argv[2] || '.mcp-funnel.json';
  const resolvedPath = resolve(process.cwd(), configPath);

  let config: ProxyConfig;

  try {
    const configFile = readFileSync(resolvedPath, 'utf-8');
    const rawConfig = JSON.parse(configFile);
    config = ProxyConfigSchema.parse(rawConfig);
  } catch (error) {
    console.error('Failed to load configuration:', error);
    console.error('\nUsage:');
    console.error(
      '  npx mcp-funnel                    # Uses .mcp-funnel.json from current directory',
    );
    console.error(
      '  npx mcp-funnel path/to/config.json # Uses specified config file',
    );
    console.error('\nExample config (.mcp-funnel.json):');
    console.error(
      JSON.stringify(
        {
          servers: [
            {
              name: 'github',
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-github'],
              env: {
                GITHUB_TOKEN: 'your-token-here',
              },
            },
            {
              name: 'memory',
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-memory'],
            },
          ],
          hideTools: [
            'github__list_workflow_runs',
            'github__get_workflow_run_logs',
            'memory__debug_*',
            'memory__dashboard_*',
          ],
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  const proxy = new MCPProxy(config);
  await proxy.start();
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
