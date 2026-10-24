import { render, screen } from '@testing-library/react';
import { vi, it, expect } from 'vitest';
vi.mock('../lib/env', () => ({ config: null }));
import { App } from '../app/App';
it('shows honest setup instructions when Supabase is absent', () => {
  render(<App />);
  expect(
    screen.getByRole('heading', { name: 'A little setup first.' }),
  ).toBeInTheDocument();
  expect(screen.getByText('npm run db:start')).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Sign in' }),
  ).not.toBeInTheDocument();
});
