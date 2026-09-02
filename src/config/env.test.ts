import { describe, expect, it } from 'vitest';
import { resolveRuntimeRole } from './env';

describe('resolveRuntimeRole', () => {
  it('prefers an explicit PROCESS_ROLE', () => {
    expect(resolveRuntimeRole('dist/src/app.js', 'worker')).toBe('worker');
    expect(resolveRuntimeRole('dist/src/app.js', 'scheduler')).toBe('scheduler');
  });

  it('infers worker and scheduler from the entrypoint path', () => {
    expect(resolveRuntimeRole('dist\\src\\jobs\\worker.job.js')).toBe('worker');
    expect(resolveRuntimeRole('dist\\src\\jobs\\scheduler.job.js')).toBe('scheduler');
  });

  it('defaults to api for ordinary server entrypoints', () => {
    expect(resolveRuntimeRole('dist/src/app.js')).toBe('api');
    expect(resolveRuntimeRole('src/app.ts')).toBe('api');
  });
});
