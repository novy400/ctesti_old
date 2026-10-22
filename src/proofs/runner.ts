import { TestRunner, type RunnerTask } from 'vitest';

/** Rejet avant la boucle d'exécution : aucun contexte n'est créé ou rejoué. */
export default class ProofRunner extends TestRunner {
  override async onBeforeRunTask(task: RunnerTask): Promise<void> {
    await super.onBeforeRunTask(task);
    if (task.type !== 'test') return;
    const retry = typeof task.retry === 'number' ? task.retry : task.retry?.count ?? 0;
    if (task.fails || retry > 0 || (task.repeats ?? 0) > 0) {
      task.fails = false;
      task.retry = 0;
      task.repeats = 0;
      task.result = { state: 'fail', errors: [{ name: 'Error', message: 'cTestI refuse retry, repeats et test.fails' }] };
    }
  }
}
