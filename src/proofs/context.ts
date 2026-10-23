import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { configuration } from './config.js';
import { request, TransportError, type RequestOptions } from './transport.js';
import { column, nodes, parseXml, query, textValue } from './xml.js';
import { IbmiError, ProofLifecycle } from './lifecycle.js';

/** Un contexte local possède exactement une soumission XMLSERVICE stateless. */
export class ProofContext extends ProofLifecycle {
  readonly id = randomUUID();
  private used = false;
  private active = false;
  private closed = false;
  private indeterminate = false;
  private responseReceived = false;
  private state = 'created';
  private identities: string[] = [];
  constructor(readonly config = configuration()) { super(); }

  get verifiedJob(): string {
    if (this.identities.length !== 2 || this.identities[0] !== this.identities[1]) throw new Error('Job non vérifié');
    return this.identities[0]!;
  }

  async inventory(): Promise<void> {
    await mkdir('artifacts/contexts', { recursive: true });
    await writeFile(`artifacts/contexts/${this.id}.json`, JSON.stringify({
      contextId: this.id, mode: 'stateless', state: this.state,
      indeterminate: this.indeterminate, responseReceived: this.responseReceived,
      identities: this.identities, proofLibrary: this.config.library, ownsLibrary: false,
      managesHostJob: false,
    }, null, 2));
  }

  async run(body: string, options: RequestOptions & { expectError?: boolean } = {}): Promise<unknown> {
    if (this.failed) throw new Error('Contexte condamné ; scénario interdit');
    if (this.used || this.closed) throw new Error('Une seule requête XMLSERVICE par test est autorisée');
    this.used = true; // Réserve la soumission avant tout await, y compris pour deux appels concurrents.
    this.active = true;
    let submitted = false;
    try {
      this.state = 'request-pending';
      await this.inventory();
      submitted = true;
      const xml = await request(this.config,
        `<myscript>${query('values QSYS2.JOB_NAME')}${body}${query('values QSYS2.JOB_NAME')}</myscript>`, options);
      this.responseReceived = true;
      this.state = 'response-received';
      const response = parseXml(xml, options.expectError);
      const sqls = nodes(response, 'sql');
      const hasError = nodes(response, 'error').length > 0 || nodes(response, 'sqlerror').length > 0;
      const info = nodes(response, 'jobinfo')[0];
      const reportedJob = info ? ['jobnbr', 'jobuser', 'jobname'].map(tag => textValue(nodes(info, tag)[0]).trim()).join('/') : undefined;
      const first = sqls.length ? column(sqls[0])[0]?.trim() : reportedJob;
      if (!first || !/^\d{6}\/[A-Z0-9_$#@]+\/[A-Z0-9_$#@]+$/.test(first)) throw new Error('Identité de job IBM i absente');
      this.identities = [first];
      if (options.expectError) {
        if (!hasError) throw new Error('Erreur IBM i attendue ; terminaison normale reçue');
      } else {
        const last = column(sqls.at(-1))[0]?.trim();
        if (sqls.length < 2 || last !== first) throw new Error('Identité du job incohérente dans la requête');
        this.identities.push(last);
      }
      this.state = 'completed';
      await this.inventory();
      return response;
    } catch (error) {
      this.condemn(error);
      this.indeterminate = submitted && !this.responseReceived && (!(error instanceof TransportError) || error.execution === 'indeterminate');
      if (error instanceof TransportError && error.execution === 'not-submitted') this.indeterminate = false;
      // Une réponse XML invalide ne démontre pas la complétude des observations.
      if (this.responseReceived && !(error instanceof IbmiError)) this.indeterminate = true;
      this.state = 'failed';
      await this.inventory();
      throw error;
    } finally { this.active = false; }
  }

  async close(): Promise<void> {
    if (this.active) throw new Error('Clôture interdite pendant une opération active');
    if (this.closed) return;
    this.closed = true;
    this.state = this.failed ? 'retained' : 'closed';
    await this.inventory();
    // Aucun appel serveur, arrêt de job ou nettoyage : les effets externes restent explicites.
    if (this.failed) throw new AggregateError([...this.failures,
      new Error(`Contexte conservé : artifacts/contexts/${this.id}.json ; aucune terminaison forcée`)],
      'Clôture cTestI en échec');
  }
}
