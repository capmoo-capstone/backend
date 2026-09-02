import { describe, expect, it, vi } from 'vitest';

const workerModule = vi.fn();

vi.mock('./worker.job', () => {
  workerModule();
  return {};
});

describe('notification-worker.job', () => {
  it('delegates to the shared worker runtime entrypoint', async () => {
    await import('./notification-worker.job');

    expect(workerModule).toHaveBeenCalledOnce();
  });
});
