import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { afterEach, expect, it, vi } from 'vitest';
import { LandingQuote } from '../components/quotes/LandingQuote';
import { LandingPage } from '../pages/LandingPage';
import { AuthContext, type AuthState } from '../features/auth/AuthProvider';
import { homepageQuotes } from '../content/homepageQuotes';
afterEach(() => vi.restoreAllMocks());
function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}
it.each([0, 1, 2])(
  'renders static entry %i immediately with its own attribution',
  (index) => {
    vi.spyOn(Math, 'random').mockReturnValue((index + 0.5) / 3);
    const get = vi.spyOn(globalThis, 'fetch');
    render(<LandingQuote />);
    const entry = homepageQuotes[index];
    expect(screen.getByRole('blockquote').textContent).toBe(entry.text);
    expect(screen.getByText(entry.author)).toBeInTheDocument();
    expect(
      screen.getByText(`${entry.book_title} · ${entry.published_year}`),
    ).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  },
);
it('keeps its selection on rerender and chooses again on a new visit', () => {
  const random = vi.spyOn(Math, 'random').mockReturnValue(0);
  const first = render(<LandingQuote />);
  expect(screen.getByText('Wrong Hands · 2024')).toBeInTheDocument();
  random.mockReturnValue(0.99);
  first.rerender(<LandingQuote />);
  expect(screen.getByText('Wrong Hands · 2024')).toBeInTheDocument();
  first.unmount();
  render(<LandingQuote />);
  expect(screen.getByText('The Last Dance · 2023')).toBeInTheDocument();
});
function renderLanding(state: Partial<AuthState>) {
  return render(
    <QueryClientProvider client={client()}>
      <AuthContext.Provider
        value={{
          session: null,
          loading: false,
          error: null,
          recovery: false,
          ...state,
        }}
      >
        <MemoryRouter>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/library" element={<p>Private library</p>} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}
it('does not fetch a quote while initial authentication resolves', () => {
  const get = vi.spyOn(globalThis, 'fetch');
  renderLanding({ loading: true });
  expect(screen.getByRole('status')).toHaveTextContent('Opening Dogeard');
  expect(get).not.toHaveBeenCalled();
});
it('redirects signed-in users without fetching a homepage quote', async () => {
  const get = vi.spyOn(globalThis, 'fetch');
  renderLanding({ session: { user: { id: 'reader' } } as Session });
  await waitFor(() =>
    expect(screen.getByText('Private library')).toBeInTheDocument(),
  );
  expect(get).not.toHaveBeenCalled();
});
