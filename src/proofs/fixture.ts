import { test } from 'vitest';

export interface ProofResource {
  retain(): void;
  close(): Promise<void>;
  readonly failed?: boolean;
  condemn?(error: unknown): void;
}

export function createProofTest<T extends ProofResource>(
  create: () => T,
  beforeClose?: (resource: T, provisional: 'pass' | 'fail') => Promise<void>,
  prepare?: (resource: T) => Promise<void>,
) {
  return test.extend<{ ibmi: T }>({
    ibmi: async ({ task }, use) => {
      const resource = create();
      const errors: unknown[] = [];
      const record = (error: unknown) => {
        resource.retain();
        resource.condemn?.(error);
        errors.push(error);
      };
      try {
        try { await prepare?.(resource); }
        catch (error) { record(error); }
        if (!errors.length) await use(resource);
      }
      finally {
        const provisional = errors.length || resource.failed || task.result?.state === 'fail' ? 'fail' : 'pass';
        if (provisional === 'fail') resource.retain();
        for (const error of task.result?.errors ?? []) resource.condemn?.(error);
        try { await beforeClose?.(resource, provisional); }
        catch (error) { record(error); }
        try { await resource.close(); }
        catch (error) { errors.push(error); }
        // Vitest déroule un seul niveau d'AggregateError dans ses reporters.
        const flatten = (error: unknown): unknown[] => error instanceof AggregateError
          ? error.errors.flatMap(flatten) : [error];
        if (errors.length) throw new AggregateError([...new Set(errors.flatMap(flatten))], 'Clôture cTestI en échec');
      }
    },
  });
}
