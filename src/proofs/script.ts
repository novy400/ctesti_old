import { column, xmlServiceText, nodes, query } from './xml.js';

/** Construit la séquence entière avant sa soumission ; aucune opération réseau. */
export class ProofScript {
  private readonly steps: string[] = [];
  private readonly observations = new Map<string, number>();
  private sqlCount = 0;

  command(cl: string, executor: 'cmd' | 'rexx' = 'cmd'): this {
    // XMLSERVICE imbrique ce texte dans STRREXPRC PARM('...') pour exec=rexx.
    const command = executor === 'rexx' ? cl.replaceAll("'", "''") : cl;
    this.steps.push(`<cmd exec="${executor}" error="on">${xmlServiceText(command)}</cmd>`);
    return this;
  }

  shell(command: string): this {
    this.steps.push(`<sh error="on">${xmlServiceText(command)}</sh>`);
    return this;
  }

  statement(sql: string): this {
    this.steps.push(`<sql><query error="on">${xmlServiceText(sql)}</query><free/></sql>`);
    this.sqlCount++;
    return this;
  }

  observe(name: string, sql: string): this {
    if (this.observations.has(name)) throw new Error('Observation déjà définie');
    this.observations.set(name, this.sqlCount++);
    this.steps.push(query(sql));
    return this;
  }

  get body(): string { return this.steps.join(''); }

  rows(response: unknown, name: string): string[] {
    const index = this.observations.get(name);
    if (index === undefined) throw new Error('Observation inconnue');
    // La première requête SQL relève l'identité, ajoutée par ProofContext.
    const sql = nodes(response, 'sql')[index + 1];
    if (!sql) throw new Error('Observation absente');
    return column(sql);
  }
}
