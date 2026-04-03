import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  const FRONTEND_PORT = parseInt(env.VITE_PORT        || '5173', 10);
  const BACKEND_PORT  = parseInt(env.VITE_BACKEND_PORT || '5000', 10);
  const AI_PORT       = parseInt(env.VITE_AI_PORT      || '5001', 10);
  const BACKEND_HOST  = env.VITE_BACKEND_HOST || 'localhost';
  const AI_HOST       = env.VITE_AI_HOST || 'localhost';
  const BACKEND_PROTOCOL = env.VITE_BACKEND_PROTOCOL || 'http';
  const AI_PROTOCOL = env.VITE_AI_PROTOCOL || 'http';

  return {
    plugins: [react()],
    server: {
      port: FRONTEND_PORT,
      proxy: {
        '/api': {
          target: `${BACKEND_PROTOCOL}://${BACKEND_HOST}:${BACKEND_PORT}`,
          changeOrigin: true,
        },
        '/ai': {
          target: `${AI_PROTOCOL}://${AI_HOST}:${AI_PORT}`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ai/, ''),
        },
      },
    },
  };
});
