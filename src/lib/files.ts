// Attachments (images / PDFs) live in IndexedDB, keyed by attachment id.
import { idb } from './store';

export async function putFile(id: string, blob: Blob) {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').put(blob, id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export async function getFile(id: string): Promise<Blob | null> {
  const db = await idb();
  return new Promise((res) => {
    const r = db.transaction('files', 'readonly').objectStore('files').get(id);
    r.onsuccess = () => res((r.result as Blob) ?? null);
    r.onerror = () => res(null);
  });
}

export async function deleteFile(id: string) {
  const db = await idb();
  await new Promise<void>((res) => {
    const tx = db.transaction('files', 'readwrite');
    tx.objectStore('files').delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => res();
  });
}

export function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] ?? '');
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(b);
  });
}

export function base64ToBlob(b64: string, type: string) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

/** Shrinks large photos before storing (keeps PDFs as they are). */
export async function compressImage(file: Blob, max = 1800, quality = 0.82): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.size < 600_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', quality));
  } catch {
    return file;
  }
}
