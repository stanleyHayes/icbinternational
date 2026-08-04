'use client';

/**
 * A browser-stored value that React can subscribe to.
 *
 * Reading `localStorage` in an effect and calling `setState` works, but it is a cascading render
 * and it is the wrong shape: storage is an *external store*, and React has an API for those.
 * `useSyncExternalStore` reads it during render on the client, returns the declared default on the
 * server, and reconciles the two without an extra pass.
 *
 * Writes notify local subscribers immediately, and the `storage` event covers the other tabs —
 * changing the theme in one tab should not leave a second tab in the old one.
 */

/** A value kept in `localStorage`, exposed as a subscribable store. */
export interface PersistentValue<T> {
  /** Registers a listener. Returns the unsubscribe function `useSyncExternalStore` wants. */
  readonly subscribe: (onChange: () => void) => () => void;
  /** The current value. Safe to call during render. */
  readonly read: () => T;
  /** The value a server render must assume. Always the fallback. */
  readonly readServer: () => T;
  /** Writes and notifies. Serialising to `null` clears the key. */
  readonly write: (value: T) => void;
}

/** How a stored value is turned into a usable one and back. */
export interface PersistentValueOptions<T> {
  readonly key: string;
  /**
   * Which storage area. `'session'` dies with the tab, which is the right scope for anything
   * half-finished and personal — an abandoned challenge must not be picked up by the next person
   * to use the machine.
   */
  readonly area?: 'local' | 'session';
  /** Used when nothing is stored, when the value is corrupt, and on the server. */
  readonly fallback: T;
  /** Narrows the raw string. Return the fallback for anything unrecognised. */
  readonly parse: (raw: string) => T;
  /** `null` clears the key. */
  readonly serialise: (value: T) => string | null;
}

function areaFor<T>(options: PersistentValueOptions<T>): Storage | undefined {
  return options.area === 'session' ? globalThis.sessionStorage : globalThis.localStorage;
}

function loadValue<T>(options: PersistentValueOptions<T>): T {
  try {
    const raw = areaFor(options)?.getItem(options.key);
    return typeof raw === 'string' ? options.parse(raw) : options.fallback;
  } catch {
    return options.fallback;
  }
}

function storeValue<T>(options: PersistentValueOptions<T>, value: T): void {
  try {
    const raw = options.serialise(value);
    const storage = areaFor(options);
    if (raw === null) storage?.removeItem(options.key);
    else storage?.setItem(options.key, raw);
  } catch {
    // Storage can refuse a write in a locked-down private window. The value still applies for this
    // session; it simply will not survive it.
  }
}

/** Builds a store over one storage key. */
export function persistentValue<T>(options: PersistentValueOptions<T>): PersistentValue<T> {
  const listeners = new Set<() => void>();
  let cached: T | undefined;

  // `useSyncExternalStore` compares snapshots by identity and re-renders forever if `read` returns
  // a fresh value each call, so the snapshot is cached until something invalidates it.
  const read = (): T => (cached ??= loadValue(options));

  const notify = (): void => {
    cached = undefined;
    for (const listener of listeners) listener();
  };

  const subscribe = (onChange: () => void): (() => void) => {
    listeners.add(onChange);
    const onStorage = (event: StorageEvent) => {
      if (event.key === options.key || event.key === null) notify();
    };
    globalThis.addEventListener?.('storage', onStorage);
    return () => {
      listeners.delete(onChange);
      globalThis.removeEventListener?.('storage', onStorage);
    };
  };

  return {
    subscribe,
    read,
    readServer: () => options.fallback,
    write: (value: T) => {
      storeValue(options, value);
      notify();
    },
  };
}
