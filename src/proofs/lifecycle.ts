export type Verdict = 'pass' | 'fail';

export class IbmiError extends Error {}

export interface CloseStep {
  name: string;
  destructive?: boolean;
  run(): Promise<void>;
}

/** Verdict et conservation communs au banc IBM i et aux opérations contrôlées. */
export class ProofLifecycle {
  private retained = false;
  private readonly recorded: unknown[] = [];
  readonly completed: string[] = [];
  readonly skipped: string[] = [];

  get failed(): boolean { return this.retained; }
  get failures(): readonly unknown[] { return this.recorded; }
  retain(): void { this.retained = true; }

  condemn(error: unknown): void {
    this.retain();
    if (!this.recorded.includes(error)) this.recorded.push(error);
  }

  async perform<T>(operation: () => Promise<T>): Promise<T> {
    if (this.failed) throw new Error('Contexte condamné ; scénario interdit');
    try { return await operation(); }
    catch (error) { this.condemn(error); throw error; }
  }

  async expectingError(operation: () => Promise<unknown>): Promise<IbmiError> {
    return this.perform(async () => {
      try { await operation(); }
      catch (error) {
        if (error instanceof IbmiError) return error;
        throw error;
      }
      throw new Error('Erreur IBM i attendue ; terminaison normale reçue');
    });
  }

  async finish(steps: readonly CloseStep[]): Promise<void> {
    const errors: unknown[] = [...this.failures];
    for (const step of steps) {
      if (step.destructive && this.failed) { this.skipped.push(step.name); continue; }
      try { await step.run(); this.completed.push(step.name); }
      catch (error) { this.condemn(error); errors.push(error); }
    }
    if (errors.length) throw new AggregateError(errors, 'Clôture cTestI en échec');
  }
}
