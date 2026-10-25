import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { usePreloadPages } from '../app/usePreloadPages';
import {
  loadBookPage,
  loadCollectionPage,
  loadLibraryPage,
} from '../app/pageLoaders';
vi.mock('../app/pageLoaders', () => ({
  loadBookPage: vi.fn(),
  loadCollectionPage: vi.fn(),
  loadLibraryPage: vi.fn(),
}));
beforeEach(() => {
  for (const load of [loadBookPage, loadCollectionPage, loadLibraryPage])
    vi.mocked(load).mockResolvedValue({ default: () => <div /> });
});
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it('waits for idle before loading static page modules and tolerates preload failures', async () => {
  let idle!: IdleRequestCallback;
  const schedule = vi.fn((callback: IdleRequestCallback) => {
    idle = callback;
    return 7;
  });
  const cancel = vi.fn();
  vi.stubGlobal('requestIdleCallback', schedule);
  vi.stubGlobal('cancelIdleCallback', cancel);
  vi.mocked(loadBookPage).mockRejectedValueOnce(new Error('Offline preload'));
  const view = renderHook(() => usePreloadPages('reader'));
  expect(loadBookPage).not.toHaveBeenCalled();
  await act(async () => idle({ didTimeout: false, timeRemaining: () => 50 }));
  for (const load of [loadBookPage, loadCollectionPage, loadLibraryPage])
    expect(load).toHaveBeenCalledTimes(1);
  view.unmount();
  expect(cancel).toHaveBeenCalledWith(7);
});
it('does not schedule code preloads when signed out or Save-Data is enabled', () => {
  const schedule = vi.fn();
  vi.stubGlobal('requestIdleCallback', schedule);
  vi.stubGlobal('cancelIdleCallback', vi.fn());
  const view = renderHook(({ id }) => usePreloadPages(id), {
    initialProps: { id: undefined as string | undefined },
  });
  expect(schedule).not.toHaveBeenCalled();
  vi.stubGlobal('navigator', { connection: { saveData: true } });
  view.rerender({ id: 'reader' });
  expect(schedule).not.toHaveBeenCalled();
});
it('cancels scheduled idle work when the user signs out', () => {
  vi.stubGlobal(
    'requestIdleCallback',
    vi.fn(() => 3),
  );
  const cancel = vi.fn();
  vi.stubGlobal('cancelIdleCallback', cancel);
  const view = renderHook(({ id }) => usePreloadPages(id), {
    initialProps: { id: 'reader' as string | undefined },
  });
  view.rerender({ id: undefined });
  expect(cancel).toHaveBeenCalledWith(3);
  expect(loadBookPage).not.toHaveBeenCalled();
});
it('uses a cancellable timer when idle callbacks are unavailable', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('requestIdleCallback', undefined);
  const first = renderHook(() => usePreloadPages('reader'));
  first.unmount();
  await vi.advanceTimersByTimeAsync(750);
  expect(loadBookPage).not.toHaveBeenCalled();
  renderHook(() => usePreloadPages('reader'));
  await vi.advanceTimersByTimeAsync(749);
  expect(loadBookPage).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  for (const load of [loadBookPage, loadCollectionPage, loadLibraryPage])
    expect(load).toHaveBeenCalledTimes(1);
});
