import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const binPath = fileURLToPath(new URL('../bin/gagyebu.js', import.meta.url));

export function runCli(args, { env, input, encoding = 'utf8' } = {}) {
  const result = spawnSync(process.execPath, [binPath, ...args], { encoding, env, input });
  assert.ifError(result.error);
  return result;
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
