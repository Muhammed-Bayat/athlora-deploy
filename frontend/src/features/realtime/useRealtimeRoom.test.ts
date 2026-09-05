import { describe, expect, it } from 'vitest';
import { realtimeProtocol } from './useRealtimeRoom';

describe('realtime protocol', () => {
  it('uses an explicit event subscription and invalidation notification', () => {
    expect(realtimeProtocol.subscribeEvent).toBe('event:subscribe');
    expect(realtimeProtocol.invalidated).toBe('realtime:invalidate');
  });
});
