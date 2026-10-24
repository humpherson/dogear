import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { isPublishableKey, isSupabaseUrl } from './src/lib/publicConfig.ts';
import tailwind from '@tailwindcss/vite';
import { configDefaults } from 'vitest/config';
export default defineConfig(({ mode, command }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const base = env.VITE_BASE_PATH || '/';
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base))
    throw new Error(
      'VITE_BASE_PATH must be / or a slash-delimited project path.',
    );
  if (
    command === 'build' &&
    (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY)
  )
    throw new Error(
      'Production builds require VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY. See .env.example.',
    );
  if (
    command === 'build' &&
    (!isSupabaseUrl(env.VITE_SUPABASE_URL!) ||
      !isPublishableKey(env.VITE_SUPABASE_PUBLISHABLE_KEY!))
  )
    throw new Error(
      'Use a valid Supabase URL and public publishable/anon key. Privileged keys are forbidden.',
    );
  return {
    plugins: [react(), tailwind()],
    base,
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['src/test/setup.ts'],
      exclude: [...configDefaults.exclude, 'tests/**'],
    },
  };
});
