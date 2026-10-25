import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthContext } from '../features/auth/AuthProvider';
import { ProtectedRoute } from '../features/auth/ProtectedRoute';
import { AddQuotePage } from '../pages/AddQuotePage';
import * as library from '../services/libraryService';
import type { CollectionEntry } from '../types';
const collection: CollectionEntry = {
  id: 'collection-a',
  user_id: 'reader-a',
  kind: 'collection',
  name: 'A private collection name',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  quotes: [{ count: 1 }],
};
afterEach(() => vi.restoreAllMocks());
function setup(userId = 'reader-a') {
  vi.spyOn(library, 'getLibrary').mockResolvedValue([]);
  vi.spyOn(library, 'getCollection').mockResolvedValue(collection);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function tree(id: string) {
    return (
      <QueryClientProvider client={client}>
        <AuthContext.Provider
          value={{
            session: { user: { id } } as Session,
            loading: false,
            recovery: false,
            error: null,
          }}
        >
          <MemoryRouter
            initialEntries={[
              {
                pathname: '/quotes/new',
                state: { ownerId: 'reader-a', collection },
              },
            ]}
          >
            <Routes>
              <Route element={<ProtectedRoute />}>
                <Route path="/quotes/new" element={<AddQuotePage />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </QueryClientProvider>
    );
  }
  const view = render(tree(userId));
  return { ...view, switchTo: (id: string) => view.rerender(tree(id)) };
}
it('discards the previous account’s selected collection and unsaved draft on a direct identity change', async () => {
  const view = setup();
  await screen.findByLabelText('The words you want to keep');
  await userEvent.type(
    screen.getByLabelText('The words you want to keep'),
    'An unsaved private draft',
  );
  view.switchTo('reader-b');
  expect(
    screen.queryByText('A private collection name'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByDisplayValue('An unsaved private draft'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('The words you want to keep'),
  ).not.toBeInTheDocument();
});
it('does not render another account’s collection from retained browser history state', () => {
  setup('reader-b');
  expect(
    screen.queryByText('A private collection name'),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('The words you want to keep'),
  ).not.toBeInTheDocument();
});
