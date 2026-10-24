import { execFileSync, spawn } from 'node:child_process';
const local = JSON.parse(
  execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
  }),
);
const env = {
  ...process.env,
  VITE_SUPABASE_URL: local.API_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: local.ANON_KEY,
  VITE_BASE_PATH: process.env.TEST_BASE_PATH || '/dogear/',
};
execFileSync('npm', ['run', 'build'], { env, stdio: 'inherit' });
const child = spawn(
  'npm',
  ['run', 'preview', '--', '--port', '4173', '--strictPort'],
  { env, stdio: 'inherit' },
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    child.kill(signal);
  });
child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
