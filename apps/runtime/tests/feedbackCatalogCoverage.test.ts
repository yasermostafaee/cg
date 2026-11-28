import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';
import ar from '../src/renderer/i18n/catalogs/ar.json';
import en from '../src/renderer/i18n/catalogs/en.json';
import fa from '../src/renderer/i18n/catalogs/fa.json';

const renderer = fileURLToPath(new URL('../src/renderer/', import.meta.url));
const feedbackCalls = [
  'feedback',
  'knownFeedback',
  'FeedbackError',
  'reportCommandError',
  'reportCommandNotice',
  'reportCommandSuccess',
  'raiseRefusal',
];
const fallbackCalls = ['feedbackFailure', 'feedbackProblem', 'refusalFeedback'];

function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* sourceFiles(path);
    else if (/\.tsx?$/.test(path)) yield path;
  }
}

function literalKeys(value: ts.Expression | undefined): string[] {
  if (value === undefined) return [];
  if (ts.isStringLiteralLike(value)) return value.text.trim() === '' ? [] : [value.text];
  if (ts.isConditionalExpression(value)) {
    return [...literalKeys(value.whenTrue), ...literalKeys(value.whenFalse)];
  }
  return [];
}

function feedbackKeys(source: ts.SourceFile): ReadonlyMap<string, number> {
  const keys = new Map<string, number>();
  const translators = new Set(feedbackCalls);
  function findTranslators(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer !== undefined &&
      ts.isCallExpression(node.initializer) &&
      node.initializer.expression.getText(source) === 'useFeedbackText'
    ) {
      translators.add(node.name.text);
    }
    ts.forEachChild(node, findTranslators);
  }
  function collect(node: ts.Node): void {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const fn = node.expression.getText(source);
      if (translators.has(fn) || fallbackCalls.includes(fn)) {
        const argument = fallbackCalls.includes(fn) ? 1 : 0;
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        for (const key of literalKeys(node.arguments?.[argument])) keys.set(key, line);
      }
    }
    ts.forEachChild(node, collect);
  }
  findTranslators(source);
  collect(source);
  return keys;
}

it('catalogs literal action messages and fallbacks in English, Persian, and Arabic', () => {
  const missing: string[] = [];
  for (const path of sourceFiles(renderer)) {
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest);
    for (const [key, line] of feedbackKeys(source)) {
      for (const [locale, catalog] of Object.entries({ en, fa, ar })) {
        if (Object.hasOwn(catalog.feedback, key) || Object.hasOwn(catalog.interface, key)) continue;
        missing.push(`${relative(renderer, path)}:${String(line)} [${locale}] ${key}`);
      }
    }
  }
  expect(missing).toEqual([]);
});
