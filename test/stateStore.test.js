import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStateStore } from '../src/twitch/stateStore.js';

async function tempDir(t) {
  const dir = await mkdtemp(join(tmpdir(), 'gladys-twitch-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test('saves and loads the channels', async (t) => {
  const file = join(await tempDir(t), 'state.json');
  const store = createStateStore(file);
  assert.deepEqual(await store.load(), {}, 'no file yet');
  await store.save({ 1: { live: true, stream_id: 's1' } });
  assert.deepEqual(await createStateStore(file).load(), { 1: { live: true, stream_id: 's1' } });
  assert.equal(JSON.parse(await readFile(file, 'utf8')).version, 1);
});

test('a broken file or an unwritable path is not fatal', async (t) => {
  const file = join(await tempDir(t), 'state.json');
  await writeFile(file, '{ not json');
  assert.deepEqual(await createStateStore(file).load(), {});
  await createStateStore(join(file, 'nested', 'state.json')).save({ 1: {} });
});
