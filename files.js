// ===== Magazyn plików (zdjęcia, PDF-y, dokumenty) w IndexedDB =====
// localStorage jest za mały na pliki (ok. 5 MB), dlatego pliki trzymamy w osobnej bazie przeglądarki.
// W notatkach zapisujemy tylko ich opis (nazwa, rozmiar, id).

const DB_NAME = 'studia-files';
const STORE = 'files';
let dbPromise;

const db = () => (dbPromise ??= new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1);
  req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
}));

async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode);
    const request = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(request?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const urls = new Map(); // id -> adres blob: (cache, żeby nie tworzyć w kółko)

// Punkty zaczepienia dla synchronizacji (sync.js): wysyłanie nowych plików do chmury,
// usuwanie ich stamtąd i pobieranie plików, których jeszcze nie ma na tym urządzeniu.
export const fileHooks = { onPut: null, onDelete: null, fetchMissing: null };

const putLocal = (id, blob) => tx('readwrite', (s) => s.put({ id, blob }));
export const getFileLocal = (id) => tx('readonly', (s) => s.get(id)).then((r) => r?.blob);
export const allFiles = () => tx('readonly', (s) => s.getAll());

export async function putFile(id, blob) {
  await putLocal(id, blob);
  fileHooks.onPut?.(id, blob);
}

export async function getFile(id) {
  const local = await getFileLocal(id);
  if (local) return local;
  const remote = await fileHooks.fetchMissing?.(id).catch(() => null);
  if (remote) { await putLocal(id, remote); return remote; }
  return undefined;
}

export async function delFile(id) {
  if (urls.has(id)) { URL.revokeObjectURL(urls.get(id)); urls.delete(id); }
  await tx('readwrite', (s) => s.delete(id));
  fileHooks.onDelete?.(id);
}

export async function fileUrl(id) {
  if (urls.has(id)) return urls.get(id);
  const blob = await getFile(id);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}

// Uzupełnia obrazki (data-file="id") i linki (data-file-href="id") właściwymi adresami plików
export function hydrate(root = document) {
  root.querySelectorAll('[data-file]:not([src])').forEach(async (el) => {
    const url = await fileUrl(el.dataset.file).catch(() => null);
    if (url) el.src = url; else el.alt = '(brak pliku)';
  });
  root.querySelectorAll('[data-file-href]:not([href])').forEach(async (el) => {
    const url = await fileUrl(el.dataset.fileHref).catch(() => null);
    if (url) el.href = url;
  });
}

// ----- do kopii zapasowej -----
export const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(r.error);
  r.readAsDataURL(blob);
});

export async function restoreFiles(list) {
  for (const f of list || []) {
    const blob = await fetch(f.data).then((r) => r.blob());
    await putFile(f.id, blob);
  }
}
