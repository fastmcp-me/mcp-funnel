import { z } from 'zod';

export const TargetServerSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export const ProxyConfigSchema = z.object({
  servers: z.array(TargetServerSchema),
  exposeTools: z.array(z.string()).optional(),
  hideTools: z.array(z.string()).optional(),
  enableDynamicDiscovery: z.boolean().optional(),
  hackyDiscovery: z.boolean().optional(),
  toolsets: z.record(z.string(), z.array(z.string())).optional(),
});

export type TargetServer = z.infer<typeof TargetServerSchema>;
export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;
