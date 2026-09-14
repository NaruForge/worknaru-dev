import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
  localStorage.clear();
});
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('1280'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })),
});
window.HTMLElement.prototype.scrollIntoView = () => {};
