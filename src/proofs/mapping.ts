import { ProgramCall } from 'itoolkit';
import { escapeXml } from './xml.js';
import { identifier } from './config.js';

// Signatures fixes du banc, volontairement distinctes de la future API rpg.*.
export function mappingCall(library: string, procedure: boolean): string {
  const call = new ProgramCall(procedure ? 'CTMAPS' : 'CTMAPP', {
    lib: identifier(library), error: 'on', ...(procedure ? { func: 'CTMap' } : {}),
  });
  call.addParam({ type: 'ds', name: 'payload', io: 'both', by: 'ref', fields: [
    { type: '16A', name: 'fixed', value: escapeXml('été & <ok>'), trim: 'off' },
    { type: '32A', varying: '2', name: 'shortText', value: escapeXml('café  '), trim: 'off' },
    { type: '32A', varying: '4', name: 'longText', value: '', trim: 'off' },
    { type: '10i0', name: 'integer', value: '-2147483648' },
    { type: '31p9', name: 'amount', value: '1234567890123456789012.123456789' },
    { type: 'ds', name: 'numbers', fields: [
      { type: '10i0', name: 'first', value: '-1' },
      { type: '10i0', name: 'second', value: '0' },
      { type: '10i0', name: 'third', value: '2147483647' },
    ] },
  ] });
  if (procedure) call.addReturn({ type: '10i0', name: 'returnValue', value: '0' });
  return call.toXML();
}
