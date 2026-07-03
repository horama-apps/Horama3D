import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const stpApiTarget = env.STP_API_TARGET ?? 'http://127.0.0.1:1111';

  return {
    plugins: [react()],
    server: {
      headers: {
        'Content-Security-Policy':
          "frame-ancestors 'self' http://localhost:* http://127.0.0.1:* https://*.myshopify.com https://admin.shopify.com;",
      },
      proxy: {
        '/models': {
          target: stpApiTarget,
          changeOrigin: true,
        },
        '/analyze': {
          target: stpApiTarget,
          changeOrigin: true,
        },
        '/transforms': {
          target: stpApiTarget,
          changeOrigin: true,
        },
        '/transform': {
          target: stpApiTarget,
          changeOrigin: true,
        },
        '/download': {
          target: stpApiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
