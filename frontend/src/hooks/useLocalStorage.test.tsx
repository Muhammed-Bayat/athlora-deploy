import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useLocalStorage } from './useLocalStorage';
describe('useLocalStorage', () => {
  it('reads persisted values and writes direct and functional updates', () => {
    localStorage.setItem('count', '2'); const { result } = renderHook(() => useLocalStorage('count', 0));
    expect(result.current[0]).toBe(2); act(() => result.current[1](3)); expect(localStorage.getItem('count')).toBe('3'); act(() => result.current[1]((value) => value + 1)); expect(result.current[0]).toBe(4);
  });
  it('falls back to memory when storage is unavailable', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); }); const { result } = renderHook(() => useLocalStorage('blocked', 'initial'));
    expect(result.current[0]).toBe('initial'); getItem.mockRestore();
  });
});
