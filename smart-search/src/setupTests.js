// Extends Vitest's expect with jest-dom matchers.
// Allows assertions like: expect(element).toBeInTheDocument()
import '@testing-library/jest-dom';

// jsdom does not implement matchMedia. Provide a minimal stub so hooks that
// read prefers-color-scheme do not throw during tests.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
