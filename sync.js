// ===== Logowanie i synchronizacja z Supabase =====
// Aplikacja działa najpierw lokalnie (szybko, także offline). Gdy jesteś zalogowany:
//  - zmiany wysyłają się do chmury kilka sekund po zapisie,
//  - zmiany z innych urządzeń pobierają się przy otwarciu aplikacji, powrocie do niej i co minutę,
//  - zdjęcia i pliki idą do prywatnego magazynu (Storage), a na drugie urządzenie pobierają się, gdy są potrzebne.
// Dane tekstowe to jeden dokument na użytkownika (tabela user_state). Wygrywa ostatnia zmiana.
// Gdy dane zmieniono jednocześnie na dwóch urządzeniach, aplikacja pyta, którą wersję zachować.
import { createClient } from '@supabase/supabase-js';
import { S, save, replaceState, setSaveHook } from './store.js';
import { SUPABASE_URL, SUPABASE_KEY } from './supabase-config.js';
import { fileHooks, allFiles, getFileLocal } from './files.js';
import { actions, forms, rerender, openModal, closeModal, toast } from './ui.js';
import { esc, pad } from './util.js';

export const syncConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

const sb = syncConfigured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    global: { fetch: (...args) => fetch(...args) }, // odwołanie w chwili użycia (ułatwia testy)
  })
  : null;

// ---------- Stan synchronizacji (osobno od danych aplikacji) ----------
const META_KEY = 'studia.sync';
const meta = (() => {
  const base = { userId: null, lastRemoteAt: null, dirty: false, seeded: false, up: [], del: [] };
  try { return { ...base, ...JSON.parse(localStorage.getItem(META_KEY) || '{}') }; } catch { return base; }
})();
const saveMeta = () => { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch {} };

// do synchronizacji idą dane, ale nie ustawienia widoku tego urządzenia (zakładka, filtry) ani zegar pomodoro
const snapshot = () => { const { ui, timer, ...rest } = S; return rest; };
let lastSnap = JSON.stringify(snapshot());
let rev = 0;           // licznik zmian lokalnych (żeby nie zgubić zmian zrobionych w trakcie wysyłania)
let suppress = false;  // true, gdy sami zapisujemy dane pobrane z chmury
let user = null;
let busy = false;
let conflictRow = null;
let status = syncConfigured ? 'signedout' : 'off';
let lastSyncAt = null;
let lastError = '';

// ---------- Status w interfejsie ----------
const hhmm = (t) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export function statusText() {
  switch (status) {
    case 'off': return 'Synchronizacja nie jest skonfigurowana.';
    case 'signedout': return 'Niezalogowano: dane są tylko na tym urządzeniu.';
    case 'syncing': return 'Synchronizowanie…';
    case 'synced': return `Zsynchronizowano o ${hhmm(lastSyncAt)}.`;
    case 'pending': return 'Zmiany czekają na wysłanie.';
    case 'offline': return 'Brak internetu: zmiany wyślą się po powrocie sieci.';
    case 'conflict': return 'Dane różnią się od tych w chmurze: wybierz wersję.';
    default: return `Błąd synchronizacji: ${lastError}`;
  }
}
const BADGE = { off: '', signedout: '☁ Zaloguj', syncing: '☁ …', synced: '☁ ✓', pending: '☁ ⏳', offline: '☁ ⏳', conflict: '☁ ⚠', error: '☁ ✕' };

function paint() {
  const badge = document.getElementById('sync-badge');
  if (badge) { badge.hidden = !BADGE[status]; badge.textContent = BADGE[status]; badge.title = statusText(); }
  const line = document.getElementById('sync-status');
  if (line) line.textContent = statusText();
}
function setStatus(s, err = '') {
  status = s; lastError = err;
  if (s === 'synced') lastSyncAt = Date.now();
  paint();
}

const friendly = (e) => {
  const m = String(e?.message || e);
  if (/invalid login/i.test(m)) return 'Nieprawidłowy e-mail lub hasło.';
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'Brak połączenia z internetem.';
  if (/email not confirmed/i.test(m)) return 'Konto nie jest potwierdzone (w Supabase zaznacz „Auto Confirm User”).';
  return m;
};

// ---------- Wysyłanie i pobieranie danych ----------
const isUntouched = () => !(S.tasks.length || S.notes.length || S.grades.length || S.customClasses.length
  || S.studyLog.length || Object.keys(S.overrides).length);

async function pushState() {
  const revAtStart = rev;
  const { data, error } = await sb.from('user_state')
    .upsert({ user_id: user.id, data: snapshot() }, { onConflict: 'user_id' })
    .select('updated_at').single();
  if (error) throw error;
  meta.lastRemoteAt = data.updated_at;
  if (rev === revAtStart) meta.dirty = false; // jeśli w międzyczasie coś zmieniono, zostaje do następnej wysyłki
  saveMeta();
}

function applyRemote(row) {
  // kopia bezpieczeństwa danych z tego urządzenia, na wypadek gdyby wybrano złą wersję
  try { localStorage.setItem('studia.backup', JSON.stringify({ savedAt: Date.now(), state: S })); } catch {}
  suppress = true;
  try { replaceState({ ...row.data, ui: S.ui, timer: S.timer }); } finally { suppress = false; }
  lastSnap = JSON.stringify(snapshot());
  meta.lastRemoteAt = row.updated_at; meta.dirty = false; saveMeta();
  rerender();
}

async function flushFiles() {
  for (const id of [...meta.up]) {
    const blob = await getFileLocal(id);
    if (blob) {
      const { error } = await sb.storage.from('files').upload(`${user.id}/${id}`, blob, { upsert: true, contentType: blob.type || 'application/octet-stream' });
      if (error) throw error;
    }
    meta.up = meta.up.filter((x) => x !== id); saveMeta();
  }
  for (const id of [...meta.del]) {
    const { error } = await sb.storage.from('files').remove([`${user.id}/${id}`]);
    if (error) throw error;
    meta.del = meta.del.filter((x) => x !== id); saveMeta();
  }
}

async function fetchMissing(id) {
  if (!user) return null;
  const { data, error } = await sb.storage.from('files').download(`${user.id}/${id}`);
  return error ? null : data;
}

export async function syncNow() {
  if (!sb || !user || busy) return;
  if (!navigator.onLine) { setStatus('offline'); return; }
  busy = true; setStatus('syncing');
  try {
    if (meta.userId !== user.id) { // pierwsze logowanie tego konta na tym urządzeniu
      Object.assign(meta, { userId: user.id, lastRemoteAt: null, seeded: false, up: [], del: [] });
    }
    if (!meta.seeded) { // wszystkie pliki z tego urządzenia trafią do chmury
      for (const f of await allFiles()) if (!meta.up.includes(f.id)) meta.up.push(f.id);
      meta.seeded = true; saveMeta();
    }
    const head = await sb.from('user_state').select('updated_at').eq('user_id', user.id).maybeSingle();
    if (head.error) throw head.error;
    const remoteAt = head.data?.updated_at || null;

    if (!remoteAt) {
      await pushState(); // pierwsze urządzenie: wysyłamy wszystko
    } else if (remoteAt === meta.lastRemoteAt) {
      if (meta.dirty) await pushState(); // w chmurze bez zmian, wysyłamy nasze
    } else {
      const full = await sb.from('user_state').select('data,updated_at').eq('user_id', user.id).single();
      if (full.error) throw full.error;
      const freshDevice = !meta.lastRemoteAt && isUntouched();
      if (freshDevice || !meta.dirty) applyRemote(full.data);
      else { conflictRow = full.data; setStatus('conflict'); askConflict(); return; }
    }
    await flushFiles();
    setStatus('synced');
  } catch (e) {
    setStatus(navigator.onLine ? 'error' : 'offline', friendly(e));
  } finally {
    busy = false;
  }
}

let timer;
const schedule = () => { clearTimeout(timer); timer = setTimeout(syncNow, 2500); };

function onLocalSave() {
  if (suppress) return;
  const snap = JSON.stringify(snapshot());
  if (snap === lastSnap) return; // zmieniło się tylko coś lokalnego (np. zakładka), nic do wysłania
  lastSnap = snap; meta.dirty = true; rev++; saveMeta();
  if (user && status !== 'conflict') { if (status !== 'syncing') setStatus('pending'); schedule(); }
}

// ---------- Konflikt: dane zmieniono na dwóch urządzeniach ----------
const counts = (d) => `${(d.tasks || []).length} zadań, ${(d.notes || []).length} notatek, ${(d.grades || []).length} ocen`;
function askConflict() {
  openModal(`<div class="modal-form">
    <h3>Dane różnią się</h3>
    <p>W chmurze są inne dane niż na tym urządzeniu (zmiany zrobiono na dwóch urządzeniach). Którą wersję zachować?</p>
    <p class="muted">Chmura: ${counts(conflictRow.data)}<br>To urządzenie: ${counts(S)}</p>
    <div class="modal-stack">
      <button class="btn primary" data-action="syncUseRemote">☁ Użyj wersji z chmury (zastąpi dane tutaj)</button>
      <button class="btn" data-action="syncUseLocal">📱 Użyj wersji z tego urządzenia (nadpisze chmurę)</button>
      <button class="btn" data-action="closeModal">Zdecyduję później</button>
    </div></div>`);
}
actions.syncUseRemote = () => {
  if (!conflictRow) return;
  applyRemote(conflictRow); conflictRow = null; closeModal();
  schedule(); toast('Pobrano dane z chmury');
};
actions.syncUseLocal = async () => {
  if (!conflictRow || busy) return;
  conflictRow = null; closeModal(); busy = true; setStatus('syncing');
  try { await pushState(); } catch (e) { setStatus('error', friendly(e)); busy = false; return; }
  busy = false; syncNow(); toast('Chmura zastąpiona danymi z tego urządzenia');
};

// ---------- Logowanie ----------
export async function signIn(email, password) {
  const { error } = await sb.auth.signInWithPassword({ email, password });
  return error ? friendly(error) : null;
}
export async function signOut() {
  await sb.auth.signOut();
  user = null; setStatus('signedout');
}

forms.syncLogin = async (f) => {
  if (!sb) return;
  const err = await signIn(f.get('email').trim(), f.get('password'));
  if (err) return toast(err);
  user = (await sb.auth.getSession()).data.session?.user || null;
  toast('Zalogowano ✔'); rerender();
};
actions.syncNow = () => { if (!user) return toast('Najpierw się zaloguj.'); syncNow(); };
actions.syncSignOut = async () => {
  if (!confirm('Wylogować? Dane zostaną na tym urządzeniu, ale przestaną się synchronizować.')) return;
  await signOut(); rerender();
};
actions.syncRestoreBackup = () => {
  let b;
  try { b = JSON.parse(localStorage.getItem('studia.backup')); } catch {}
  if (!b?.state) return toast('Brak kopii do przywrócenia.');
  if (!confirm(`Przywrócić dane z ${new Date(b.savedAt).toLocaleString('pl-PL')} (sprzed ostatniego pobrania z chmury)?`)) return;
  replaceState({ ...b.state, ui: S.ui, timer: S.timer });
  rerender(); toast('Przywrócono. Dane wyślą się do chmury.');
};
actions.goSync = () => { S.ui.tab = 'settings'; save(); rerender(); window.scrollTo(0, 0); };

// Karta w Ustawieniach
export function renderSyncCard() {
  const hasBackup = (() => { try { return Boolean(localStorage.getItem('studia.backup')); } catch { return false; } })();
  if (!syncConfigured) {
    return '<div class="card"><p class="muted">Synchronizacja nie jest jeszcze skonfigurowana (brak danych Supabase w aplikacji).</p></div>';
  }
  if (!user) {
    return `<div class="card">
      <p class="muted">Zaloguj się kontem założonym w Supabase, żeby zadania, notatki i pliki były takie same na wszystkich urządzeniach.</p>
      <form data-form="syncLogin" class="sync-form">
        <label class="field"><span>E-mail</span><input type="email" name="email" autocomplete="username" required></label>
        <label class="field"><span>Hasło</span><input type="password" name="password" autocomplete="current-password" required></label>
        <button class="btn primary" type="submit">Zaloguj</button>
      </form></div>`;
  }
  return `<div class="card">
    <div class="setting"><span>Konto</span><strong>${esc(user.email)}</strong></div>
    <p class="muted" id="sync-status">${esc(statusText())}</p>
    <div class="btn-row">
      <button class="btn primary" data-action="syncNow">⟳ Synchronizuj teraz</button>
      <button class="btn" data-action="syncSignOut">Wyloguj</button>
      ${hasBackup ? '<button class="btn" data-action="syncRestoreBackup">↩ Przywróć dane sprzed ostatniego pobrania</button>' : ''}
    </div></div>`;
}

// Dla push.js: klient Supabase i zalogowany użytkownik
export const getClient = () => sb;
export const getUser = () => user;

// ---------- Start ----------
export async function initSync() {
  if (!sb) { paint(); return; }
  fileHooks.onPut = (id) => {
    if (!meta.up.includes(id)) meta.up.push(id);
    meta.del = meta.del.filter((x) => x !== id); saveMeta(); if (user) schedule();
  };
  fileHooks.onDelete = (id) => {
    meta.up = meta.up.filter((x) => x !== id);
    if (!meta.del.includes(id)) meta.del.push(id); saveMeta(); if (user) schedule();
  };
  fileHooks.fetchMissing = fetchMissing;
  setSaveHook(onLocalSave);

  const { data } = await sb.auth.getSession();
  user = data.session?.user || null;
  setStatus(user ? 'pending' : 'signedout');
  // (w tej funkcji zwrotnej nie wolno czekać na inne wywołania Supabase, dlatego setTimeout)
  sb.auth.onAuthStateChange((_event, session) => {
    const was = user;
    user = session?.user || null;
    if (user && !was) setTimeout(syncNow, 0);
    if (!user) setStatus('signedout');
  });
  addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60000);
  if (user) syncNow();
}
