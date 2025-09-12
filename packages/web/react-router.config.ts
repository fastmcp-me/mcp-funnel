import type { Config } from '@react-router/dev/config';

export default {
  appDirectory: 'app',
  ssr: false, // SPA mode
  future: {
    v3_fetcherPersist: true,
    v3_relativeSplatPath: true,
    v3_throwAbortReason: true,
  },
} satisfies Config;