import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const stpApiTarget = process.env.STP_API_TARGET ?? 'http://127.0.0.1:1111';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/models': {
        target: stpApiTarget,
        changeOrigin: true,
      },
    },
  },
});
