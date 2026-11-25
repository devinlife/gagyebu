import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CURRENT_VERSION, DEFAULT_CATEGORIES } from '../src/store.js';

export const binPath = fileURLToPath(new URL('../bin/gagyebu.js', import.meta.url));

export function runCli(args, { env, input, encoding = 'utf8', timeout } = {}) {
  const result = spawnSync(process.execPath, [binPath, ...args], { encoding, env, input, timeout });
  assert.ifError(result.error);
  return result;
}

export function output({ status, stdout, stderr }) {
  assert.equal(status, 0, stderr);
  assert.equal(stderr, '');
  return stdout;
}

export function assertUsageError({ status, stdout, stderr }, message, usage) {
  assert.equal(status, 2, message);
  assert.equal(stdout, '', message);
  assert.equal(stderr, `오류: ${message}\n${usage}\n`, message);
}

export function tempDir(t, prefix = 'gagyebu-') {
  const directory = mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

export function writeJson(filePath, value) {
  const contents = JSON.stringify(value);
  writeFileSync(filePath, contents);
  return contents;
}

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

export function testEnv(directory, overrides) {
  const env = { ...process.env, GAGYEBU_DATA: path.join(directory, 'data.json') };
  delete env.GAGYEBU_TODAY;
  return Object.assign(env, overrides);
}

export function transaction(overrides) {
  return {
    date: '2026-02-10', type: 'expense', amount: 1000, category: '식비',
    account: '현금', memo: '', tags: [], ...overrides,
  };
}

export function currentData(overrides) {
  return {
    version: CURRENT_VERSION,
    nextId: 1,
    categories: structuredClone(DEFAULT_CATEGORIES),
    budgets: {},
    accounts: [{ name: '현금', opening: 0 }],
    transactions: [],
    recurring: [],
    nextRecurringId: 1,
    ...overrides,
  };
}
