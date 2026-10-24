import { lazy, useState, type ReactNode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
} from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Session } from '@supabase/supabase-js';
import { expect, it } from 'vitest';
import { RequestActivity } from '../components/layout/RequestActivity';
import { AppShell } from '../components/layout/AppShell';
import { AuthContext } from '../features/auth/AuthProvider';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function renderView(children: ReactNode, loading = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AuthContext.Provider
        value={{
          session: { user: { id: 'reader' } } as Session,
          loading,
          error: null,
          recovery: false,
        }}
      >
        <MemoryRouter>{children}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>,
  );
}
it('keeps activity visible until concurrent reads settle, including a failure', async () => {
  const first = deferred<string>(),
    second = deferred<string>();
  function Reads() {
    useQuery({ queryKey: ['first'], queryFn: () => first.promise });
    const query = useQuery({
      queryKey: ['second'],
      queryFn: () => second.promise,
    });
    return (
      <>
        <RequestActivity />
        {query.isError && <p role="alert">Read failed</p>}
      </>
    );
  }
  renderView(<Reads />);
  expect(await screen.findByRole('progressbar')).toBeInTheDocument();
  await act(async () => first.resolve('done'));
  expect(screen.getByRole('progressbar')).toBeInTheDocument();
  await act(async () => second.reject(new Error('Offline')));
  await screen.findByRole('alert');
  await waitFor(() =>
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument(),
  );
});
it('does not show activity for a disabled query or cached idle data', async () => {
  function Idle() {
    useQuery({
      queryKey: ['disabled'],
      queryFn: async () => 'unused',
      enabled: false,
    });
    useQuery({
      queryKey: ['cached'],
      queryFn: async () => 'unused',
      initialData: 'saved',
      staleTime: Infinity,
    });
    return <RequestActivity />;
  }
  renderView(<Idle />);
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});
it('shows activity for saves and removes it after a failed write', async () => {
  const pending = deferred<void>();
  function Save() {
    const mutation = useMutation({ mutationFn: () => pending.promise });
    return (
      <>
        <RequestActivity />
        <button disabled={mutation.isPending} onClick={() => mutation.mutate()}>
          Save
        </button>
        {mutation.isError && <p role="alert">Save failed</p>}
      </>
    );
  }
  renderView(<Save />);
  await userEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('progressbar')).toHaveAttribute(
    'aria-valuetext',
    'Working…',
  );
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  await act(async () => pending.reject(new Error('Offline')));
  await screen.findByRole('alert');
  await waitFor(() =>
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
});
it('shows activity while the session is being checked', () => {
  renderView(<RequestActivity />, true);
  expect(screen.getByRole('progressbar')).toHaveAttribute(
    'aria-valuetext',
    'Loading…',
  );
});
it('keeps the navigation visible while a lazy page loads', async () => {
  const pending = deferred<{ default: () => ReactNode }>();
  const Page = lazy(() => pending.promise);
  renderView(
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Page />} />
      </Route>
    </Routes>,
  );
  expect(
    screen.getByRole('navigation', { name: 'Main navigation' }),
  ).toBeVisible();
  expect(screen.getByRole('status')).toHaveTextContent('Opening this page…');
  expect(
    screen.getByRole('status').querySelector('.spinner'),
  ).toBeInTheDocument();
  await act(async () => pending.resolve({ default: () => <h1>Ready</h1> }));
  expect(
    await screen.findByRole('heading', { name: 'Ready' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('keeps existing content visible during a background refresh', async () => {
  const pending = deferred<string>();
  function Refresh() {
    const query = useQuery({
      queryKey: ['refresh'],
      queryFn: () => pending.promise,
      initialData: 'Already loaded',
      staleTime: Infinity,
    });
    return (
      <>
        <RequestActivity />
        <p>{query.data}</p>
        <button onClick={() => void query.refetch()}>Refresh</button>
      </>
    );
  }
  renderView(<Refresh />);
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByRole('progressbar')).toBeInTheDocument();
  expect(screen.getByText('Already loaded')).toBeInTheDocument();
  await act(async () => pending.resolve('Updated'));
  await screen.findByText('Updated');
  await waitFor(() =>
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument(),
  );
});
it('clears activity when a read is cancelled on unmount', async () => {
  function Read() {
    useQuery({
      queryKey: ['cancel'],
      queryFn: ({ signal }) =>
        new Promise<string>((_, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason)),
        ),
    });
    return <p>Reading</p>;
  }
  function View() {
    const [show, setShow] = useState(true);
    return (
      <>
        <RequestActivity />
        {show && <Read />}
        <button onClick={() => setShow(false)}>Leave</button>
      </>
    );
  }
  renderView(<View />);
  await screen.findByRole('progressbar');
  await userEvent.click(screen.getByRole('button', { name: 'Leave' }));
  await waitFor(() =>
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument(),
  );
});
