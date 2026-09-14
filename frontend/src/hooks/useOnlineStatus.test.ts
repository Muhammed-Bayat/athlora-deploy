import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnlineStatus } from './useOnlineStatus';

const networkStatus = vi.hoisted(() => ({
  isDeviceOnline: vi.fn(() => true),
  onConnectivityChange: vi.fn(() => vi.fn()),
  recordNetworkFailure: vi.fn(),
  recordNetworkSuccess: vi.fn(),
}));

vi.mock('../offline/networkStatus', () => networkStatus);

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
  networkStatus.isDeviceOnline.mockReturnValue(true);
  networkStatus.onConnectivityChange.mockReturnValue(vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('useOnlineStatus', () => {
  it('initializes with the current online state', () => {
    const { result } = renderHook(() => useOnlineStatus());

    expect(result.current.isOnline).toBe(true);
    expect(typeof result.current.resetWasOffline).toBe('function');
  });

  it('reports offline when isDeviceOnline returns false', () => {
    networkStatus.isDeviceOnline.mockReturnValue(false);
    const { result } = renderHook(() => useOnlineStatus());

    expect(result.current.isOnline).toBe(false);
  });

  it('updates isOnline on connectivity change', () => {
    let connectivityListener: (online: boolean) => void = () => {};
    networkStatus.onConnectivityChange.mockImplementation((cb: (online: boolean) => void) => {
      connectivityListener = cb;
      return vi.fn();
    });

    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(true);

    act(() => { connectivityListener(false); });
    expect(result.current.isOnline).toBe(false);

    act(() => { connectivityListener(true); });
    expect(result.current.isOnline).toBe(true);
  });

  it('probes the network when the window online event fires', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useOnlineStatus());

    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect(fetchMock).toHaveBeenCalledWith(
      '/health',
      expect.objectContaining({ method: 'HEAD' }),
    );
    expect(result.current.isOnline).toBe(true);
  });

  it('sets offline when the probe fails after online event', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    networkStatus.isDeviceOnline.mockReturnValue(false);
    const { result } = renderHook(() => useOnlineStatus());
    expect(result.current.isOnline).toBe(false);

    networkStatus.isDeviceOnline.mockReturnValue(true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });

    expect(result.current.isOnline).toBe(false);
  });

  it('sets offline on window offline event', () => {
    const { result } = renderHook(() => useOnlineStatus());

    act(() => { window.dispatchEvent(new Event('offline')); });

    expect(result.current.isOnline).toBe(false);
  });

  it('probes periodically and updates state', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useOnlineStatus());

    expect(result.current.isOnline).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(8000);
    });

    expect(fetchMock).toHaveBeenCalled();
  });
});
