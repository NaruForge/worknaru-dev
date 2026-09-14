import { expect, it } from 'vitest';
import { prepareStorageIdentity } from './storageIdentity.js';

it('keeps preferences on restart and discards the previous instance and global preferences on reset', () => {
  localStorage.clear();
  localStorage.setItem('worknaru.ui.theme', 'dark');
  localStorage.setItem('worknaru.ui.layout.v1', '{}');
  const first = prepareStorageIdentity('ws://localhost:6868/ws', 'worknaru-dev', 'server-one');
  expect(localStorage.getItem('worknaru.ui.theme')).toBeNull();
  expect(localStorage.getItem('worknaru.ui.layout.v1')).toBeNull();
  localStorage.setItem(first.storagePrefix + '.theme', 'dark');
  localStorage.setItem(first.storagePrefix + '.layout.v1', '{"listWidth":400}');
  localStorage.setItem('unrelated', 'keep');
  expect(
    prepareStorageIdentity('ws://localhost:6868/ws', 'worknaru-dev', 'server-one').changed,
  ).toBe(false);
  expect(localStorage.getItem(first.storagePrefix + '.theme')).toBe('dark');
  const reset = prepareStorageIdentity('ws://localhost:6868/ws', 'worknaru-dev', 'server-two');
  expect(reset.changed).toBe(true);
  expect(reset.storagePrefix).not.toBe(first.storagePrefix);
  expect(localStorage.getItem(first.storagePrefix + '.theme')).toBeNull();
  expect(localStorage.getItem(first.storagePrefix + '.layout.v1')).toBeNull();
  expect(localStorage.getItem(reset.storagePrefix + '.theme')).toBeNull();
  expect(localStorage.getItem('unrelated')).toBe('keep');
});
