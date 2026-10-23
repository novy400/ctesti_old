import { readFileSync } from 'node:fs';
import type { ProofScript } from '../../src/proofs/script.js';

const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** Rien n'est installé dans NOVY4001/NOVY4002 ; tout est propre à la requête. */
export function observationFixtures<T extends ProofScript>(script: T): T {
  for (const [name, type] of [['CT10SRC', '*FILE'], ['CT10FIX', '*PGM'], ['CT10NEST', '*PGM'], ['CT10MF', '*MSGF']]) {
    script.statement(`begin
      if QSYS2.QCMDEXC('CHKOBJ OBJ(QTEMP/${name}) OBJTYPE(${type})') = 1 then
        signal sqlstate '75001' set message_text = 'Collision fixture cTestI';
      end if;
    end`);
  }
  script.command('CRTSRCPF FILE(QTEMP/CT10SRC) RCDLEN(112) MBR(*NONE)');
  script.command('CRTMSGF MSGF(QTEMP/CT10MF)')
    .command("ADDMSGD MSGID(CT10001) MSGF(QTEMP/CT10MF) MSG('CT10:volume') FMT((*CHAR 4000))");
  for (const member of ['CT10NEST', 'CT10FIX']) {
    const source = readFileSync(new URL(`rpg/${member.toLowerCase()}.rpgle`, import.meta.url), 'utf8');
    const lines = source.replaceAll('\r', '').trimEnd().split('\n');
    if (lines.some(line => line.length > 100)) throw new Error('Source RPG trop longue');
    script.command(`ADDPFM FILE(QTEMP/CT10SRC) MBR(${member}) SRCTYPE(RPGLE)`)
      .statement(`create alias QTEMP.${member}S for QTEMP.CT10SRC(${member})`)
      .statement(`insert into QTEMP.${member}S values ${lines.map((line, i) => `(${i + 1}, 0, ${literal(line)})`).join(', ')} with nc`)
      .command(`CRTBNDRPG PGM(QTEMP/${member}) SRCFILE(QTEMP/CT10SRC) SRCMBR(${member}) OUTPUT(*NONE) DBGVIEW(*NONE) REPLACE(*NO)`);
  }
  script.command("SNDPGMMSG MSG('CT10:preparation') TOPGMQ(*EXT) MSGTYPE(*INFO)", 'rexx');
  return script;
}
