// ===== Zakładka Ustawienia: wygląd, kolory przedmiotów, kopia zapasowa =====
import { S, save, replaceState, wipeAll } from './store.js';
import { esc, todayISO } from './util.js';
import { actions, changes, rerender, toast, segmented } from './ui.js';
import { allFiles, blobToDataUrl, restoreFiles } from './files.js';
import { renderSyncCard } from './sync.js';
import { renderPushCard } from './push.js';

export function applyAppearance() {
  const root = document.documentElement;
  if (S.settings.theme === 'auto') root.removeAttribute('data-theme');
  else root.dataset.theme = S.settings.theme;
  root.dataset.density = S.settings.density;
  root.style.setProperty('--accent', S.settings.accent);
}

export function renderSettings() {
  const st = S.settings;
  return `
    <h2>Konto i synchronizacja</h2>
    ${renderSyncCard()}

    <h2>Powiadomienia</h2>
    ${renderPushCard()}

    <h2>Wygląd</h2>
    <div class="card">
      <div class="setting"><span>Motyw</span>${segmented('setTheme', [['auto', 'Auto'], ['light', 'Jasny'], ['dark', 'Ciemny']], st.theme)}</div>
      <div class="setting"><span>Gęstość kart</span>${segmented('setDensity', [['comfortable', 'Wygodna'], ['compact', 'Kompaktowa']], st.density)}</div>
      <div class="setting"><span>Styl notatnika</span>${segmented('setNotebook', [['dark', 'Ciemna tablica'], ['paper', 'Papier']], st.notebook || 'dark')}</div>
      <div class="setting"><span>Kolor główny</span><input type="color" value="${esc(st.accent)}" data-change="setAccent" aria-label="Kolor główny"></div>
      <div class="setting"><span>Pokazuj prowadzących</span><input type="checkbox" class="switch" ${st.showTeacher ? 'checked' : ''} data-change="setTeacher"></div>
    </div>

    <h2>Kolory przedmiotów</h2>
    <div class="card">
      ${S.subjects.map((s) => `<div class="setting"><span>${esc(s.name)}</span>
        <input type="color" value="${esc(s.color)}" data-change="subjectColor" data-id="${esc(s.short)}" aria-label="Kolor: ${esc(s.name)}"></div>`).join('') || '<p class="muted">Brak przedmiotów.</p>'}
    </div>

    <h2>Dane i kopia zapasowa</h2>
    <div class="card">
      <p class="muted">Dane są zapisane w tej przeglądarce. Zrób kopię, zanim wyczyścisz dane przeglądarki lub zmienisz urządzenie (synchronizację między urządzeniami dodamy później).</p>
      <div class="btn-row">
        <button class="btn" data-action="exportData">⬇ Pobierz kopię</button>
        <label class="btn">⬆ Wczytaj kopię<input type="file" accept="application/json,.json" data-change="importData" hidden></label>
      </div>
      <div class="btn-row">
        <button class="btn" data-action="resetOverrides">Cofnij zmiany w grafiku z PDF</button>
        <button class="btn danger" data-action="wipe">Usuń wszystkie dane</button>
      </div>
    </div>`;
}

actions.setTheme = (el) => { S.settings.theme = el.dataset.v; save(); rerender(); };
actions.setNotebook = (el) => { S.settings.notebook = el.dataset.v; save(); rerender(); };
actions.setDensity =(el) => { S.settings.density = el.dataset.v; save(); rerender(); };
changes.setAccent = (el) => { S.settings.accent = el.value; save(); rerender(); };
changes.setTeacher = (el) => { S.settings.showTeacher = el.checked; save(); rerender(); };
changes.subjectColor = (el) => {
  const s = S.subjects.find((x) => x.short === el.dataset.id);
  if (s) { s.color = el.value; save(); }
};

actions.exportData = async () => {
  // Kopia zawiera dane oraz wszystkie załączniki z notatek (zapisane jako tekst base64, więc plik może być duży)
  const _files = [];
  try { for (const f of await allFiles()) _files.push({ id: f.id, data: await blobToDataUrl(f.blob) }); } catch {}
  const blob = new Blob([JSON.stringify({ ...S, _files })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `studia-kopia-${todayISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

changes.importData = (el) => {
  const file = el.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    let obj;
    try {
      obj = JSON.parse(reader.result);
      if (!obj || typeof obj !== 'object' || !Array.isArray(obj.tasks)) throw new Error('format');
    } catch { return toast('To nie wygląda na plik kopii z tej aplikacji.'); }
    if (!confirm('Wczytanie kopii zastąpi obecne dane. Kontynuować?')) return;
    const { _files, ...data } = obj;
    try { await restoreFiles(_files); } catch { toast('Nie wszystkie załączniki udało się odtworzyć.'); }
    replaceState(data); rerender(); toast('Kopia wczytana ✔');
  };
  reader.readAsText(file);
  el.value = '';
};

actions.resetOverrides = () => {
  if (!confirm('Cofnąć wszystkie Twoje zmiany w zajęciach z PDF (odwołania, zmiany sal, notatki)?')) return;
  S.overrides = {}; save(); rerender(); toast('Grafik przywrócony z PDF');
};
actions.wipe = () => {
  if (!confirm('Na pewno usunąć WSZYSTKIE dane (zadania, oceny, notatki, ustawienia)? Tego nie da się cofnąć.')) return;
  wipeAll();
  try { indexedDB.deleteDatabase('studia-files'); } catch {}
  location.reload();
};
