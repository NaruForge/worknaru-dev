/** Public server identity scopes browser preferences; no conversation data is stored. */
export function prepareStorageIdentity(endpoint: string, target: string, server: string) {
  const environmentKey =
    'worknaru.ui.environment.' + encodeURIComponent(JSON.stringify([endpoint, target]));
  const prefixFor = (id: string) => 'worknaru.ui.server.' + encodeURIComponent(id);
  let changed = false;
  try {
    const previous = localStorage.getItem(environmentKey);
    changed = previous !== server;
    if (changed && previous) {
      const prefix = prefixFor(previous) + '.';
      for (const key of Object.keys(localStorage))
        if (key.startsWith(prefix)) localStorage.removeItem(key);
    }
    // Pre-reset UI preferences have no instance identity and are not migrated.
    localStorage.removeItem('worknaru.ui.theme');
    localStorage.removeItem('worknaru.ui.layout.v1');
    localStorage.setItem(environmentKey, server);
  } catch {
    /* A storage-denied browser still gets a fresh in-memory session. */
  }
  return { storagePrefix: prefixFor(server), changed };
}
