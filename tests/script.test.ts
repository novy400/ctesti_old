import { expect, test } from 'vitest';
import { ProofScript } from '../src/proofs/script.js';
import { nodes, parseXml, textValue } from '../src/proofs/xml.js';

test('REXX protège le littéral CL imbriqué dans STRREXPRC PARM sans altérer les caractères XML', () => {
  const script = new ProofScript().command("SNDPGMMSG MSG('a & <b>') TOPGMQ(*EXT) MSGTYPE(*INFO)", 'rexx');
  const cmd = nodes(parseXml(`<myscript>${script.body}</myscript>`), 'cmd')[0];
  expect(cmd).toHaveProperty('@_exec', 'rexx');
  expect(textValue(cmd)).toBe("SNDPGMMSG MSG(''a & <b>'') TOPGMQ(*EXT) MSGTYPE(*INFO)");
});

test('les commandes directes et SQL conservent leur niveau de guillemets', () => {
  const script = new ProofScript().command("CMD PARM('value')")
    .statement("insert into QTEMP.T values('token') with nc");
  expect(textValue(nodes(parseXml(`<myscript>${script.body}</myscript>`), 'cmd')[0])).toBe("CMD PARM('value')");
  expect(script.body).toContain("values('token') with nc");
});

test('les opérateurs SQL sont transmis en CDATA sans entités XML livrées au moteur SQL', () => {
  const script = new ProofScript().observe('messages', 'select ORDINAL_POSITION from QTEMP.T where ORDINAL_POSITION > 1 and ORDINAL_POSITION < 10');
  expect(script.body).toContain('<![CDATA[');
  expect(script.body).not.toContain('&gt;');
  expect(script.body).not.toContain('&lt;');
});

test.each([']]>', '</query>', '<cmd>'])('les délimiteurs réservés du parseur XMLSERVICE sont refusés : %s', value => {
  expect(() => new ProofScript().statement(`values '${value}'`)).toThrow('délimiteurs');
});
