// app/lib/ai/byokStorage.ts
//
// WebMangal AI assistant — Bring-Your-Own-Key local vault. CLIENT ONLY.
//
// Privacy posture this implements (matches the in-UI compliance banner):
//   - The creator's provider API key is ENCRYPTED with AES-GCM before it
//     ever touches localStorage. The AES key itself is a non-extractable
//     CryptoKey that never leaves the browser: it is generated on-device
//     and lives only inside IndexedDB. A stolen localStorage dump alone is
//     therefore not enough to recover the API key.
//   - Nothing here ever performs a network call. Keys are never sent to,
//     stored by, or logged on WebMangal servers. They leave the browser
//     ONLY as a per-request TLS header when the creator explicitly clicks
//     a cloud assist action (see /api/ai/editor-assist/route.ts, which
//     forwards once and discards).
//   - Cloud assist additionally requires an explicit consent checkbox
//     ("I understand my key is kept strictly local to my browser") which
//     is stored alongside the ciphertext; no consent → the UI refuses to
//     fire cloud actions.

export type StoredProvider = 'gemini' | 'groq' | 'openai';

export interface AiSettings {
  provider: StoredProvider;
  /** AES-GCM ciphertext of the API key, base64. */
  keyCipherB64: string;
  /** AES-GCM IV, base64. */
  keyIvB64: string;
  /** ISO timestamp of the explicit local-storage consent checkbox. */
  consentAt: string | null;
  savedAt: string;
}

const SETTINGS_KEY = 'wm_ai_settings_v1';
const VAULT_DB_NAME = 'wm-ai-vault';
const VAULT_DB_VERSION = 1;
const VAULT_STORE = 'keys';
const VAULT_KEY_ID = 'settings-aes-gcm';

function toB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  // Explicit ArrayBuffer so the result satisfies BufferSource under the
  // newer TypedArray generics (Uint8Array<ArrayBufferLike> does not).
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Open (and lazily create) the IndexedDB vault holding the AES key. */
function openVault(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable — cloud key storage requires a standard browser.'));
      return;
    }
    const req = indexedDB.open(VAULT_DB_NAME, VAULT_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(VAULT_STORE)) db.createObjectStore(VAULT_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open the local key vault.'));
  });
}

async function idbGet(db: IDBDatabase, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE, 'readonly');
    const req = tx.objectStore(VAULT_STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Vault read failed.'));
  });
}

async function idbPut(db: IDBDatabase, key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VAULT_STORE, 'readwrite');
    tx.objectStore(VAULT_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Vault write failed.'));
  });
}

/**
 * Load (creating on first use) the non-extractable AES-GCM key that
 * encrypts settings at rest. `extractable: false` means even JS running
 * in this page cannot serialize the raw key material out of the vault.
 */
async function getVaultKey(): Promise<CryptoKey> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new Error('WebCrypto unavailable — cloud key storage requires a secure context.');
  }
  const db = await openVault();
  try {
    const existing = await idbGet(db, VAULT_KEY_ID);
    if (existing instanceof CryptoKey) return existing;
    const fresh = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
      'encrypt',
      'decrypt',
    ]);
    await idbPut(db, VAULT_KEY_ID, fresh);
    return fresh;
  } finally {
    db.close();
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function saveAiSettings(input: {
  provider: StoredProvider;
  apiKey: string;
  consent: boolean;
}): Promise<void> {
  const vaultKey = await getVaultKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    vaultKey,
    new TextEncoder().encode(input.apiKey),
  );
  const settings: AiSettings = {
    provider: input.provider,
    keyCipherB64: toB64(cipher),
    keyIvB64: toB64(iv),
    consentAt: input.consent ? new Date().toISOString() : null,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** Read what's stored WITHOUT decrypting the key. Cheap + safe for UI state. */
export function loadAiSettingsMeta(): Omit<AiSettings, 'keyCipherB64' | 'keyIvB64'> & {
  hasKey: boolean;
} {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_KEY) : null;
  if (!raw) return { provider: 'gemini', consentAt: null, savedAt: '', hasKey: false };
  try {
    const parsed = JSON.parse(raw) as AiSettings;
    return {
      provider:
        parsed.provider === 'groq' || parsed.provider === 'openai'
          ? parsed.provider
          : 'gemini',
      consentAt: parsed.consentAt ?? null,
      savedAt: parsed.savedAt ?? '',
      hasKey: Boolean(parsed.keyCipherB64 && parsed.keyIvB64),
    };
  } catch {
    return { provider: 'gemini', consentAt: null, savedAt: '', hasKey: false };
  }
}

/**
 * Decrypt and return the locally-stored API key. Only called at the exact
 * moment a cloud assist action fires, so plaintext exists in memory just
 * long enough to be placed on the request header.
 */
export async function decryptApiKey(): Promise<string | null> {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return null;
  let parsed: AiSettings;
  try {
    parsed = JSON.parse(raw) as AiSettings;
  } catch {
    return null;
  }
  if (!parsed.keyCipherB64 || !parsed.keyIvB64) return null;
  const vaultKey = await getVaultKey();
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(parsed.keyIvB64) },
      vaultKey,
      fromB64(parsed.keyCipherB64),
    );
    return new TextDecoder().decode(plain);
  } catch {
    // Wrong/rotted vault key (e.g. IndexedDB cleared separately) — treat as
    // no key rather than crashing; the UI will ask the creator to re-enter.
    return null;
  }
}

export function hasConsent(): boolean {
  return loadAiSettingsMeta().consentAt !== null;
}

/** Wipe both halves of the vault (ciphertext + AES key). Irreversible. */
export async function clearAiKeys(): Promise<void> {
  try {
    localStorage.removeItem(SETTINGS_KEY);
  } catch {
    /* storage already gone */
  }
  try {
    const db = await openVault();
    try {
      await idbPut(db, VAULT_KEY_ID, undefined);
    } finally {
      db.close();
    }
  } catch {
    /* vault already gone */
  }
}

