import { ProofScript } from './script.js';
import type { ProofContext } from './context.js';

export const collectionLimits = { milliseconds: 15_000, messages: 10_000, bytes: 10 * 1024 * 1024 } as const;
export interface CollectionLimits { milliseconds: number; messages: number; bytes: number; }
export interface CallMessage {
  ordinal: number;
  key: string | null;
  id: string | null;
  type: string | null;
  severity: number | null;
  text: string | null;
  substitution: string | null;
  fromProgram: string | null;
}
export interface CallObservation {
  contextId: string;
  job: string;
  callId: string;
  outcome: 'normal' | 'ibmi-error' | 'unknown';
  messages: CallMessage[];
  collection: { state: 'complete' | 'partial'; error: string | null };
}
export class CollectionError extends Error {
  constructor(readonly observation: CallObservation) {
    super(`Collecte partielle : ${observation.callId} (${observation.collection.error})`);
  }
}
const literal = (text: string) => `'${text.replaceAll("'", "''")}'`;

/** Banc d'attribution : toute la séquence est construite avant l'unique run(). */
export class ObservationScript extends ProofScript {
  private readonly calls = new Set<string>();
  private responseBytes = 1024 * 1024;
  get maxResponseBytes(): number { return this.responseBytes; }

  constructor(readonly contextId: string) {
    super();
    this.statement(`create table QTEMP.CT10PRE (POS integer, MSGKEY char(8))`)
      .statement(`create table QTEMP.CT10RES (CALL_ID varchar(64), JOB varchar(28), OUTCOME varchar(16), COLLECTION_ERROR varchar(32))`)
      .statement(`create table QTEMP.CT10MSG (CALL_ID varchar(64), POS integer, PAYLOAD varchar(32000) CCSID 1208)`);
  }

  call(callId: string, command: string, options: {
    limits?: Partial<CollectionLimits>;
    // Injection explicite du banc, exécutée côté serveur, jamais une décision après réponse.
    failAfter?: number;
    delaySeconds?: number;
    invalidateBoundary?: boolean;
  } = {}): this {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(callId) || this.calls.has(callId)) throw new Error('Identifiant d’appel invalide ou dupliqué');
    const limits = { ...collectionLimits, ...options.limits };
    for (const name of ['milliseconds', 'messages', 'bytes'] as const) {
      if (!Number.isSafeInteger(limits[name]) || limits[name] < 1 || limits[name] > collectionLimits[name]) throw new Error('Budget de collecte invalide');
    }
    if (options.failAfter !== undefined && (!Number.isSafeInteger(options.failAfter) || options.failAfter < 0)) throw new Error('Injection invalide');
    if (options.delaySeconds !== undefined && (!Number.isInteger(options.delaySeconds) || options.delaySeconds < 0 || options.delaySeconds > 16)) throw new Error('Délai injecté invalide');
    this.calls.add(callId);
    this.responseBytes += limits.bytes + limits.messages * 128;
    const id = literal(callId);
    this.statement(`begin
        declare v_result integer default -1;
        declare finished integer default 0;
        declare v_pos integer;
        declare v_msgkey char(8);
        declare payload varchar(32000) CCSID 1208;
        declare truncated integer;
        declare prefix integer default 0;
        declare seen integer default 0;
        declare amount integer default 0;
        declare total_bytes bigint default 0;
        declare started timestamp;
        declare reason varchar(32) default null;
        declare c cursor for
          select ORDINAL_POSITION, hex(MESSAGE_KEY),
            JSON_OBJECT('ordinal': ORDINAL_POSITION, 'key': hex(MESSAGE_KEY),
              'id': MESSAGE_ID, 'type': MESSAGE_TYPE, 'severity': SEVERITY,
              'text': MESSAGE_TEXT, 'substitution': hex(MESSAGE_TOKENS),
              'fromProgram': FROM_PROGRAM null on null returning varchar(32000) CCSID 1208),
            case when MESSAGE_TOKEN_LENGTH > length(MESSAGE_TOKENS)
              or length(MESSAGE_TEXT) >= 1024 then 1 else 0 end
          from table(QSYS2.JOBLOG_INFO('*', 'NO')) order by ORDINAL_POSITION;
        declare continue handler for not found set finished = 1;
        declare exit handler for sqlexception, sqlwarning
          update QTEMP.CT10RES set COLLECTION_ERROR = 'collector-sql-error' where CALL_ID = ${id} with nc;
        if exists (select 1 from QTEMP.CT10RES where COLLECTION_ERROR is not null) then
          insert into QTEMP.CT10RES values (${id}, QSYS2.JOB_NAME, 'unknown', 'blocked-after-collection-failure') with nc;
        else
        insert into QTEMP.CT10RES values (${id}, QSYS2.JOB_NAME, 'unknown', 'not-collected') with nc;
        truncate table QTEMP.CT10PRE immediate;
        insert into QTEMP.CT10PRE select ORDINAL_POSITION, hex(MESSAGE_KEY)
          from table(QSYS2.JOBLOG_INFO('*', 'NO')) with nc;
        begin
          declare continue handler for sqlexception set v_result = -1;
          set v_result = QSYS2.QCMDEXC(${literal(command)});
        end;
        update QTEMP.CT10RES set OUTCOME = case when v_result = 1 then 'normal' else 'ibmi-error' end
          where CALL_ID = ${id} with nc;
        set started = current_timestamp;
        select count(*) into prefix from QTEMP.CT10PRE;
        ${options.invalidateBoundary ? "update QTEMP.CT10PRE set MSGKEY = 'INVALID' where POS = 1 with nc;" : ''}
        ${options.delaySeconds ? `call QSYS2.QCMDEXC('DLYJOB DLY(${options.delaySeconds})');` : ''}
        set finished = 0;
        open c;
        collect_loop: loop
          fetch c into v_pos, v_msgkey, payload, truncated;
          if current_timestamp > started + ${limits.milliseconds * 1000} microseconds then
            set reason = 'time-limit'; leave collect_loop;
          end if;
          if finished = 1 then leave collect_loop; end if;
          if v_pos <= prefix then
            if v_msgkey is null or not exists (select 1 from QTEMP.CT10PRE where POS = v_pos and MSGKEY = v_msgkey) then
              set reason = 'uncertain-boundary'; leave collect_loop;
            end if;
            set seen = seen + 1;
          else
            ${options.failAfter !== undefined ? `if amount >= ${options.failAfter} then signal sqlstate '75010'; end if;` : ''}
            if amount >= ${limits.messages} then set reason = 'message-limit'; leave collect_loop; end if;
            if total_bytes + octet_length(payload) > ${limits.bytes} then set reason = 'byte-limit'; leave collect_loop; end if;
            insert into QTEMP.CT10MSG values (${id}, v_pos, payload) with nc;
            set amount = amount + 1;
            set total_bytes = total_bytes + octet_length(payload);
            if truncated = 1 then set reason = 'truncated-field'; leave collect_loop; end if;
            if amount >= ${limits.messages} then set reason = 'message-limit'; leave collect_loop; end if;
            if total_bytes >= ${limits.bytes} then set reason = 'byte-limit'; leave collect_loop; end if;
          end if;
        end loop;
        close c;
        if reason is null and seen <> prefix then set reason = 'uncertain-boundary'; end if;
        update QTEMP.CT10RES set COLLECTION_ERROR = reason where CALL_ID = ${id} with nc;
        end if;
      end`)
      .observe(`call-${callId}`, `select JSON_OBJECT('callId': CALL_ID, 'job': JOB, 'outcome': OUTCOME,
        'error': COLLECTION_ERROR null on null returning varchar(512) CCSID 1208) from QTEMP.CT10RES where CALL_ID = ${id} with nc`)
      .observe(`messages-${callId}`, `select PAYLOAD from (
        select POS, PAYLOAD from QTEMP.CT10MSG where CALL_ID = ${id}
        union all select 0, cast('null' as varchar(32000) CCSID 1208) from SYSIBM.SYSDUMMY1
          where not exists (select 1 from QTEMP.CT10MSG where CALL_ID = ${id})
        ) M order by POS with nc`);
    return this;
  }

  observation(response: unknown, callId: string, job: string): CallObservation {
    if (!this.calls.has(callId)) throw new Error('Appel inconnu');
    let result: CallObservation = {
      contextId: this.contextId, callId, job, outcome: 'unknown', messages: [],
      collection: { state: 'partial', error: 'missing-observation' },
    };
    try {
      const rows = this.rows(response, `call-${callId}`);
      if (rows.length !== 1) throw new Error('Résultat absent ou ambigu');
      const status = JSON.parse(rows[0]!);
      if (status.callId !== callId || status.job !== job || !['normal', 'ibmi-error', 'unknown'].includes(status.outcome)
        || !(status.error === null || typeof status.error === 'string')) throw new Error('Attribution invalide');
      result.outcome = status.outcome;
      const messageRows = this.rows(response, `messages-${callId}`);
      if (messageRows.length === 0) throw new Error('Collecte absente');
      for (const row of messageRows) {
        if (row.trim() === 'null' && messageRows.length === 1) continue;
        const message = JSON.parse(row) as CallMessage;
        if (!Number.isSafeInteger(message.ordinal) || message.ordinal <= (result.messages.at(-1)?.ordinal ?? 0)
          || !['key', 'id', 'type', 'text', 'substitution', 'fromProgram'].every(key => {
            const field = message[key as keyof CallMessage];
            return field === null || typeof field === 'string';
          }) || !(message.severity === null || Number.isInteger(message.severity))) throw new Error('Message invalide');
        result.messages.push(message);
      }
      result.collection = { state: status.error === null ? 'complete' : 'partial', error: status.error };
      if (status.outcome === 'unknown' && status.error === null) throw new Error('Résultat inconnu');
    } catch {
      result.collection = { state: 'partial', error: 'invalid-or-missing-observation' };
    }
    if (result.collection.state !== 'complete') throw new CollectionError(result);
    return result;
  }
}

/** Le job est fourni seulement par les contrôles d'identité de ProofContext. */
export async function runObservations(context: ProofContext, script: ObservationScript): Promise<{
  response: unknown; job: string;
}> {
  if (script.contextId !== context.id) throw new Error('Scénario rattaché à un autre contexte');
  return { response: await context.run(script.body, { maxResponseBytes: script.maxResponseBytes }), job: context.verifiedJob };
}
