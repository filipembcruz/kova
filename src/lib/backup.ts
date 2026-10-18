import type { State } from './types';
import { getState, replaceState } from './store';
import { getFile, putFile, blobToBase64, base64ToBlob } from './files';

/** Full backup: state + attachment files (base64). */
export async function buildBackup(state: State = getState()) {
  const files: Record<string, { type: string; b64: string }> = {};
  for (const tx of state.txs) {
    for (const a of tx.attachments ?? []) {
      const b = await getFile(a.id);
      if (b) files[a.id] = { type: a.type, b64: await blobToBase64(b) };
    }
  }
  return JSON.stringify({ app: 'kova', version: 1, exported: new Date().toISOString(), state, files });
}

export async function restoreBackup(text: string) {
  if (!text || !text.trim()) throw new Error('EMPTY');
  let j: any;
  try { j = JSON.parse(text); } catch { throw new Error('BROKEN'); }
  const state: State = j.state ?? j;
  if (!state || !Array.isArray(state.accounts) || !Array.isArray(state.txs)) throw new Error('NOT_KOVA');
  for (const [id, f] of Object.entries((j.files ?? {}) as Record<string, { type: string; b64: string }>)) {
    await putFile(id, base64ToBlob(f.b64, f.type));
  }
  replaceState({ ...state, settings: { ...state.settings, onboarded: true } });
  return { txs: state.txs.length, accounts: state.accounts.length, exported: j.exported as string | undefined };
}
