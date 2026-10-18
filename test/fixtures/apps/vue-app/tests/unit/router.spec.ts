import { createRouter, createMemoryHistory } from 'vue-router';
import { describe, expect, it } from 'vitest';

// Routes written for a test: never read as screens of the application.
const routes = [{ path: '/never', component: { template: '<div />' } }];

describe('router', () => {
  it('resolves', () => {
    const router = createRouter({ history: createMemoryHistory(), routes });
    expect(router.resolve('/never').matched).toHaveLength(1);
  });
});
