import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { afterEach, expect, it, vi } from 'vitest';
import { LandingQuote } from '../components/quotes/LandingQuote';
import { LandingPage } from '../pages/LandingPage';
import { AuthContext, type AuthState } from '../features/auth/AuthProvider';
import * as samples from '../services/homepageQuotesService';
const sample = {
  text: 'A line from the database.',
  author: 'A Writer',
  book_title: 'A Book',
  published_year: '1900',
};
afterEach(() => vi.restoreAllMocks());
function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}
function renderQuote() {
  return render(
    <QueryClientProvider client={client()}>
      <LandingQuote />
    </QueryClientProvider>,
  );
}
it('renders the selected database text and attribution', async () => {
  vi.spyOn(samples, 'getRandomHomepageQuote').mockResolvedValue(sample);
  renderQuote();
  expect(await screen.findByRole('blockquote')).toHaveTextContent(sample.text);
  expect(screen.getByText(sample.author)).toBeInTheDocument();
  expect(screen.getByText('A Book · 1900')).toBeInTheDocument();
});
it('shows a loading state without a hard-coded quotation', () => {
  vi.spyOn(samples, 'getRandomHomepageQuote').mockImplementation(
    () => new Promise(() => {}),
  );
  renderQuote();
  expect(screen.getByRole('status')).toHaveTextContent('Finding a little quip');
  expect(screen.queryByRole('blockquote')).not.toBeInTheDocument();
});
it('supports an empty sample collection without inventing a fallback quote', async () => {
  vi.spyOn(samples, 'getRandomHomepageQuote').mockResolvedValue(null);
  renderQuote();
  expect(
    await screen.findByText('A little quip will be here soon.'),
  ).toBeInTheDocument();
  expect(screen.queryByRole('blockquote')).not.toBeInTheDocument();
});
it('offers a retry when the database is unavailable', async () => {
  const get = vi
    .spyOn(samples, 'getRandomHomepageQuote')
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValue(sample);
  renderQuote();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'We couldn’t load a sample quote.',
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Try another quote' }),
  );
  expect(await screen.findByRole('blockquote')).toHaveTextContent(sample.text);
  expect(get).toHaveBeenCalledTimes(2);
});
it('requests a fresh random sample when the visitor returns to the homepage', async () => {
  const get = vi
    .spyOn(samples, 'getRandomHomepageQuote')
    .mockResolvedValueOnce(sample)
    .mockResolvedValue({
      ...sample,
      text: 'A different database sample.',
    });
  const query = client();
  const first = render(
    <QueryClientProvider client={query}>
      <LandingQuote />
    </QueryClientProvider>,
  );
  await screen.findByRole('blockquote');
  first.unmount();
  render(
    <QueryClientProvider client={query}>
      <LandingQuote />
    </QueryClientProvider>,
  );
  expect(
    await screen.findByText('A different database sample.'),
  ).toBeInTheDocument();
  expect(get).toHaveBeenCalledTimes(2);
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
it('does not request samples until initial authentication resolves', () => {
  const get = vi.spyOn(samples, 'getRandomHomepageQuote');
  renderLanding({ loading: true });
  expect(screen.getByRole('status')).toHaveTextContent('Opening Dogear');
  expect(get).not.toHaveBeenCalled();
});
it('redirects signed-in users without fetching a public sample', async () => {
  const get = vi.spyOn(samples, 'getRandomHomepageQuote');
  renderLanding({ session: { user: { id: 'reader' } } as Session });
  await waitFor(() =>
    expect(screen.getByText('Private library')).toBeInTheDocument(),
  );
  expect(get).not.toHaveBeenCalled();
});
