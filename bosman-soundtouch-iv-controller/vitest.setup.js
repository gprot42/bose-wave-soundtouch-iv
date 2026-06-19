/*
 * Copyright (c) 2026 Kambrium Software GmbH
 * Licensed under the MIT License.
 */

// This file contains setup code that will run before each test
import * as matchers from '@testing-library/jest-dom/matchers';
import {expect} from 'vitest';

// Extend Vitest's expect with Jest DOM matchers
expect.extend(matchers);

// Mock global objects if needed
// global.fetch = vi.fn();

// Add any other global setup here
// required for svelte5 + jsdom as jsdom does not support matchMedia
Object.defineProperty(globalThis, 'matchMedia', {
  writable: true,
  enumerable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
