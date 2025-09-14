import type { Config } from '@react-router/dev/config';

export default {
  appDirectory: 'app',
  ssr: false, // SPA mode
  // React Router v7 doesn't use future flags in the same way
} satisfies Config;
