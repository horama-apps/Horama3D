import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: env.VITE_BASE_PATH ?? '/',
    plugins: [react()],
    server: {
      headers: {
        'Content-Security-Policy':
          "frame-ancestors 'self' http://localhost:* http://127.0.0.1:* https://*.myshopify.com https://admin.shopify.com;",
      },
    },
  };
});
