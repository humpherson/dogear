import { Suspense } from 'react';
import { act, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { preloadablePage } from '../app/preloadablePage';
const ready = { default: () => <h1>Ready page</h1> };
it('renders a preloaded page without showing or invoking a Suspense fallback on first use', async () => {
  const importPage = vi.fn().mockResolvedValue(ready);
  const { load, Page } = preloadablePage(importPage);
  const fallback = vi.fn(() => <p>Loading code</p>);
  function Fallback() {
    return fallback();
  }
  await load();
  render(
    <Suspense fallback={<Fallback />}>
      <Page />
    </Suspense>,
  );
  expect(
    screen.getByRole('heading', { name: 'Ready page' }),
  ).toBeInTheDocument();
  expect(fallback).not.toHaveBeenCalled();
  expect(importPage).toHaveBeenCalledTimes(1);
});
it('shares in-flight imports between preload and navigation and shows feedback while pending', async () => {
  let resolve!: (page: typeof ready) => void;
  const importPage = vi.fn(
    () =>
      new Promise<typeof ready>((done) => {
        resolve = done;
      }),
  );
  const { load, Page } = preloadablePage(importPage);
  const first = load();
  expect(load()).toBe(first);
  render(
    <Suspense fallback={<p role="status">Loading code</p>}>
      <Page />
    </Suspense>,
  );
  expect(screen.getByRole('status')).toHaveTextContent('Loading code');
  expect(importPage).toHaveBeenCalledTimes(1);
  await act(async () => resolve(ready));
  expect(
    await screen.findByRole('heading', { name: 'Ready page' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('does not permanently retain a failed background preload', async () => {
  const importPage = vi
    .fn()
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce(ready);
  const { load, Page } = preloadablePage(importPage);
  await expect(load()).rejects.toThrow('Offline');
  await load();
  render(
    <Suspense fallback={<p>Loading code</p>}>
      <Page />
    </Suspense>,
  );
  expect(
    screen.getByRole('heading', { name: 'Ready page' }),
  ).toBeInTheDocument();
  expect(importPage).toHaveBeenCalledTimes(2);
});
