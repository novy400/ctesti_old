import { expect, test } from 'vitest';
import { column, output, parseXml } from '../src/proofs/xml.js';
import { mappingCall } from '../src/proofs/mapping.js';
import { configuration } from '../src/proofs/config.js';

test('packed au-delà de 2^53 et espaces conservés sans conversion numérique', () => {
  const result = parseXml('<myscript><pgm><parm><data name="amount">1234567890123456789012.123456790</data><data name="text">café  </data></parm></pgm></myscript>');
  expect(output(result, 'amount')).toBe('1234567890123456789012.123456790');
  expect(output(result, 'text')).toBe('café  ');
});

test('collecte impossible distincte de zéro ligne', () => {
  expect(column(parseXml('<myscript><sql><fetch/></sql></myscript>'))).toEqual([]);
  expect(() => parseXml('<myscript><sql><sqlerror>denied</sqlerror></sql></myscript>')).toThrow();
  expect(() => parseXml('<myscript><pgm><error>CPF0001</error></pgm></myscript>')).toThrow();
  expect(() => parseXml('<myscript>')).toThrow();
});

test('les rapports error=on sont distingués des réponses invalides sans exporter leur contenu', () => {
  const report = '<report><error><sqlcode>-7008</sqlcode><sqlstate>55019</sqlstate><xmlhint>secret-detail</xmlhint></error><xmloutput><![CDATA[partial]]></xmloutput></report>';
  expect(() => parseXml(report)).toThrow('sqlcode=-7008');
  expect(() => parseXml(report)).not.toThrow('secret-detail');
  expect(parseXml(report, true)).toHaveProperty('report');
});

test('la signature du banc échappe les valeurs et ne passe rien par valeur', () => {
  const xml = mappingCall('CTPROOF', true);
  expect(xml).toContain('été &amp; &lt;ok&gt;');
  expect(xml).toContain("by='ref'");
  expect(xml).toContain("varying='4'");
  expect(() => mappingCall("BAD'LIB", false)).toThrow();
});

test('pas de cible ni identité SSH implicites', () => {
  expect(() => configuration({})).toThrow('CTESTI_HOST_KEY_SHA256');
  expect(() => configuration({ CTESTI_HOST_KEY_SHA256: 'unknown' })).toThrow('SHA-256');
});
