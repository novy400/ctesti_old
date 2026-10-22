import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { IbmiError } from './lifecycle.js';

export function escapeXml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

// Les apostrophes et guillemets sont valides dans le texte d'un élément.
// XMLSERVICE ne doit pas recevoir &apos; à la place des délimiteurs SQL/CL.
export function escapeXmlText(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

// Le parseur rapide XMLSERVICE ne décode pas les entités dans les commandes.
export function xmlServiceText(value: string): string {
  if (value.includes(']]>') || /<\/?(?:myscript|script|query|prepare|cmd|pgm|sql|sh)\b/i.test(value)) {
    throw new Error('Texte incompatible avec les délimiteurs du parseur XMLSERVICE');
  }
  return `<![CDATA[${value}]]>`;
}

export function nodes(value: unknown, tag: string): unknown[] {
  if (Array.isArray(value)) return value.flatMap(item => nodes(item, tag));
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) => key === tag
    ? (Array.isArray(item) ? item : [item]) : nodes(item, tag));
}

export function textValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && '#text' in value && typeof value['#text'] === 'string') return value['#text'];
  throw new Error('Réponse XML : valeur texte absente');
}

export function parseXml(xml: string, allowIbmiError = false): unknown {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Réponse XML invalide');
  const result: unknown = new XMLParser({ ignoreAttributes: false, parseTagValue: false, trimValues: false }).parse(xml);
  if (result && typeof result === 'object' && 'report' in result && nodes(result, 'error').length) {
    if (allowIbmiError) return result;
    const codes = ['sqlcode', 'sqlstate', 'cpf', 'errnoxml'].flatMap(tag => nodes(result, tag)
      .map(textValue).filter(value => /^[-A-Z0-9]{1,12}$/.test(value.trim())).map(value => `${tag}=${value.trim()}`));
    throw new IbmiError(`Erreur XMLSERVICE/IBM i (${[...new Set(codes)].join(', ')} ; contenu non exporté)`);
  }
  if (!result || typeof result !== 'object' || !('myscript' in result)) throw new Error('Réponse XMLSERVICE absente');
  if (!allowIbmiError && (nodes(result, 'error').length || nodes(result, 'sqlerror').length)) throw new IbmiError('Erreur XMLSERVICE/IBM i (contenu non exporté)');
  return result;
}

export function output(result: unknown, name: string): string {
  const matches = nodes(result, 'data').filter(item => item && typeof item === 'object' && '@_name' in item && item['@_name'] === name);
  if (matches.length !== 1) throw new Error(`Sortie absente ou ambiguë : ${name}`);
  return textValue(matches[0]);
}

// Une seule colonne par requête dans ce banc ; aucune conversion numérique implicite.
export function column(result: unknown): string[] {
  return nodes(result, 'row').map(row => {
    const fields = nodes(row, 'data');
    if (fields.length !== 1) throw new Error('Réponse SQL : une colonne attendue');
    return textValue(fields[0]);
  });
}

export function query(statement: string): string {
  return `<sql><query error="on">${xmlServiceText(statement)}</query><fetch block="all" desc="off" error="on"/><free/></sql>`;
}
