import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
const tokenStyle = document.createElement('style');
tokenStyle.textContent = readFileSync('../../packages/ui/src/tokens.css', 'utf8');
document.head.append(tokenStyle);
// jsdom does not lay out boxes. Real resize behavior is covered in Playwright.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
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
