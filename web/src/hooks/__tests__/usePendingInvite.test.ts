/**
 * Tests for usePendingInvite hook
 */

import { renderHook } from '@testing-library/react';
import { usePendingInvite } from '../usePendingInvite';

// Mock localStorage
const createStorageMock = () => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
};

describe('usePendingInvite', () => {
  let localStorageMock: ReturnType<typeof createStorageMock>;
  let sessionStorageMock: ReturnType<typeof createStorageMock>;

  beforeEach(() => {
    // Create fresh mocks
    localStorageMock = createStorageMock();
    sessionStorageMock = createStorageMock();

    // Mock localStorage and sessionStorage
    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });

    Object.defineProperty(window, 'sessionStorage', {
      value: sessionStorageMock,
      writable: true,
      configurable: true,
    });

    // Reset location hash
    window.location.hash = '';
  });

  it('should return null when no pending invite exists', () => {
    const { result } = renderHook(() => usePendingInvite());

    expect(result.current.code).toBeNull();
    expect(result.current.inviterName).toBeNull();
  });

  it('should extract invite code from URL hash', () => {
    window.location.hash = '#join=test-invite-code-123';

    const { result } = renderHook(() => usePendingInvite());

    expect(result.current.code).toBe('test-invite-code-123');
  });

  it('should extract invite code and inviter name from URL hash', () => {
    window.location.hash = '#join=test-invite-code-123';
    sessionStorageMock.setItem('inviterName', 'Alice');

    const { result } = renderHook(() => usePendingInvite());

    expect(result.current.code).toBe('test-invite-code-123');
    expect(result.current.inviterName).toBe('Alice');
  });

  it('should read invite code from localStorage', () => {
    localStorageMock.setItem('pendingInvite', 'stored-invite-code-456');

    const { result } = renderHook(() => usePendingInvite());

    expect(result.current.code).toBe('stored-invite-code-456');
  });

  it('should read inviter name from sessionStorage', () => {
    localStorageMock.setItem('pendingInvite', 'stored-invite-code-456');
    sessionStorageMock.setItem('inviterName', 'Bob');

    const { result } = renderHook(() => usePendingInvite());

    expect(result.current.code).toBe('stored-invite-code-456');
    expect(result.current.inviterName).toBe('Bob');
  });

  it('should prioritize URL hash over localStorage', () => {
    window.location.hash = '#join=url-invite-code';
    localStorageMock.setItem('pendingInvite', 'storage-invite-code');

    const { result } = renderHook(() => usePendingInvite());

    expect(result.current.code).toBe('url-invite-code');
  });

  it('should clear hash after reading', () => {
    window.location.hash = '#join=test-code';

    renderHook(() => usePendingInvite());

    expect(window.location.hash).toBe('');
  });

  it('should clear localStorage after reading', () => {
    localStorageMock.setItem('pendingInvite', 'test-code');

    renderHook(() => usePendingInvite());

    expect(localStorageMock.getItem('pendingInvite')).toBeNull();
  });

  it('should handle empty hash gracefully', () => {
    window.location.hash = '#join=';

    const { result } = renderHook(() => usePendingInvite());

    // Should fall back to localStorage
    expect(result.current.code).toBeNull();
  });

  it('should handle non-join hash values gracefully', () => {
    window.location.hash = '#settings';

    const { result } = renderHook(() => usePendingInvite());

    expect(result.current.code).toBeNull();
  });
});
