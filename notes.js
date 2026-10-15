// ===== Notatki: widok przedmiotu, tryb pisania =====
// Dwa tryby tej samej strony (przełącznik na pasku):
//   📖 Czytanie: sformatowane notatki, wszystko otwarte (reader.js)
//   ✎ Pisanie: notatka jak plik tekstowy. Klikasz gdziekolwiek i piszesz, zdjęcia i pliki wstawiasz
//      w miejscu kursora (tekst dzieli się na dwie części), pasek u góry formatuje zaznaczony tekst.
// Notatka składa się z bloków (tekst / zdjęcie / plik) i zapisuje się sama.
// Pliki idą do IndexedDB (files.js), w notatce jest tylko ich opis.
import { S, save } from './store.js';
import { esc, uid } from './util.js';
import { subjectOf, colorOf } from './data.js';
import { putFile, getFile, delFile, hydrate } from './files.js';
import { isPdf, isText, iconOf, fmtSize } from './filetypes.js';
import { readPage, notebookStyle } from './reader.js';
import { openViewer, nextFilter, filterLabel } from './viewer.js';
import { actions, changes, inputs, rerender, toast, segmented } from './ui.js';
import './drag.js'; // przesuwanie bloków uchwytem ⠿

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB na plik
const mode = () => S.ui.noteMode || 'read';
let anchor = { noteId: null, blockId: null }; // ostatnio kliknięte miejsce w notatce
let pendingFocus = null; // co sfokusować po przerysowaniu: { blockId, caret } lub { titleOf }

export function currentNoteSubject() {
  return subjectOf(S.ui.noteSubject) ? S.ui.noteSubject : (S.subjects[0]?.short || '');
}
export const noteCount = (short) => S.notes.filter((n) => n.short === short).length;
export const noteFileIds = (n) => (n.blocks || []).filter((b) => b.fileId).map((b) => b.fileId);

const newText = (text = '') => ({ id: uid(), type: 'text', text });
const fileBlock = (id, name, mime, size) => (mime.startsWith('image/')
  ? { id: uid(), type: 'image', fileId: id, name, mime, size, caption: '', width: 'm', filter: 'none' }
  : { id: uid(), type: 'file', fileId: id, name, mime, size, filter: 'none' });

// Starsze notatki (tytuł + tekst + załączniki) zamieniamy na bloki
export function migrateNotes() {
  let changed = false;
  for (const s of S.subjects) {
    if (s.notes && s.notes.trim()) {
      S.notes.push({ id: uid(), short: s.short, title: 'Notatki', blocks: [newText(s.notes)], created: Date.now(), updated: Date.now() });
      s.notes = ''; changed = true;
    }
  }
  for (const n of S.notes) {
    if (n.blocks) continue;
    n.blocks = [];
    if (n.text?.trim()) n.blocks.push(newText(n.text));
    for (const a of n.attachments || []) n.blocks.push(fileBlock(a.id, a.name, a.type || '', a.size));
    if (!n.blocks.length) n.blocks.push(newText());
    delete n.text; delete n.attachments; changed = true;
  }
  if (changed) save();
}

const noteOf = (id) => S.notes.find((n) => n.id === id);
function locate(blockId) {
  for (const n of S.notes) {
    const i = n.blocks.findIndex((b) => b.id === blockId);
    if (i >= 0) return { n, b: n.blocks[i], i };
  }
  return null;
}
const touch = (n) => { n.updated = Date.now(); save(); };
const blockEl = (id) => document.querySelector(`[data-block][data-id="${id}"]`);

// W trybie pisania przed pierwszym blokiem, po ostatnim i między zdjęciami/plikami musi być miejsce na tekst
function normalize(n) {
  const out = [];
  const media = (b) => b && b.type !== 'text';
  if (!n.blocks.length || media(n.blocks[0])) out.push(newText());
  n.blocks.forEach((b, i) => {
    out.push(b);
    const next = n.blocks[i + 1];
    if (media(b) && (!next || media(next))) out.push(newText());
  });
  // jeden pusty tekst obok drugiego tekstu jest zbędny
  n.blocks = out.filter((b, i) => !(b.type === 'text' && !b.text.trim() && out[i - 1]?.type === 'text'));
}

// ---------- Widok ----------
export function renderNotes() {
  if (!S.subjects.length) return '<p class="muted">Najpierw dodaj przedmiot w zakładce Nauka → Przedmioty.</p>';
  const short = currentNoteSubject();
  const s = subjectOf(short);
  const write = mode() === 'write';
  const cols = S.ui.noteCols || 'auto';
  const notes = S.notes.filter((n) => n.short === short).sort((a, b) => a.created - b.created);

  const chips = S.subjects.map((x) =>
    `<button class="chip ${x.short === short ? 'active' : ''}" style="--c:${x.color}" data-action="setNoteSubject" data-v="${esc(x.short)}">${esc(x.short)}${noteCount(x.short) ? ` · ${noteCount(x.short)}` : ''}</button>`).join('');
  const fmt = [['h1', 'H1', 'Nagłówek'], ['h2', 'H2', 'Podnagłówek'], ['li', '•', 'Lista punktowana'], ['ol', '1.', 'Lista numerowana'], ['b', 'B', 'Pogrubienie'], ['mark', '🖍', 'Zakreślacz']]
    .map(([k, l, t]) => `<button type="button" class="btn small" data-keepfocus data-action="fmt" data-k="${k}" title="${t}" aria-label="${t}">${l}</button>`).join('');
  const toolbar = `
    <div class="notebar">
      ${segmented('setNoteMode', [['read', '📖 Czytanie'], ['write', '✎ Pisanie']], mode())}
      ${write
        ? `<div class="fmtbar">${fmt}<button type="button" class="btn small" data-keepfocus data-action="insertFile" title="Wstaw w miejscu kursora">🖼 Zdjęcie / plik</button></div>`
        : segmented('setCols', [['auto', 'Auto'], ['1', '1 kol.'], ['2', '2 kol.']], cols)}
      <span class="grow"></span>
      <button class="btn primary small" data-action="newNote">＋ Notatka</button>
    </div>`;
  const toc = !write && notes.length > 1
    ? `<div class="chips toc">${notes.map((n) => `<button class="chip" data-action="jumpNote" data-id="${esc(n.id)}">${esc(n.title || 'Bez tytułu')}</button>`).join('')}</div>` : '';
  const pages = notes.map((n) => (write ? writePage(n) : readPage(n, cols))).join('')
    || '<p class="muted">Brak notatek do tego przedmiotu. Kliknij „＋ Notatka” i zacznij pisać: tekst, zdjęcia, pliki i PDF-y trafiają na jedną stronę.</p>';

  return `
    <div class="chips">${chips}</div>
    <h2 class="colored" style="--c:${s.color}">📝 ${esc(s.name)}</h2>
    ${toolbar}
    <input type="file" id="note-file" multiple hidden data-change="noteFiles">
    ${toc}${pages}
    ${write ? '<p class="muted hint">Klikaj gdziekolwiek i pisz. Wklej zrzut ekranu (Ctrl+V) albo przeciągnij pliki: trafią w miejsce kursora. Formatowanie: przyciski u góry albo <code># nagłówek</code>, <code>- lista</code>, <code>**pogrubienie**</code>, <code>==zakreślacz==</code>.</p>' : ''}`;
}

function writePage(n) {
  normalize(n);
  const last = n.blocks[n.blocks.length - 1];
  const date = new Date(n.created).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<section class="page nb write" data-nb="${notebookStyle()}" data-note="${esc(n.id)}" id="page-${esc(n.id)}" style="--c:${colorOf(n.short)}">
    <header class="page-head">
      <input class="note-title" data-input="noteTitle" data-id="${esc(n.id)}" value="${esc(n.title)}" placeholder="Tytuł strony" maxlength="120">
      <small class="muted">${date}</small>
      <button class="btn small" data-action="noteExport" data-id="${esc(n.id)}" title="Pobierz jako plik .txt">⬇ .txt</button>
      <button class="btn small danger" data-action="noteDelete" data-id="${esc(n.id)}" title="Usuń całą notatkę">🗑</button>
    </header>
    <div class="write-body">${n.blocks.map((b) => blockHtml(n, b, b === last)).join('')}</div>
  </section>`;
}

function blockHtml(n, b, isLast) {
  const id = esc(b.id);
  const btn = (action, label, title) =>
    `<button type="button" data-action="${action}" data-id="${id}" title="${title}" aria-label="${title}">${label}</button>`;
  let extra = '';
  if (b.type === 'image') {
    extra = ['s', 'm', 'l'].map((w) => `<button type="button" class="${b.width === w ? 'on' : ''}" data-action="blkSize" data-id="${id}" data-w="${w}" title="Rozmiar zdjęcia (L = cała szerokość)">${w.toUpperCase()}</button>`).join('')
      + btn('blkFilter', '🎨', `Filtr czytelności: ${filterLabel(b.filter)} (kliknij, aby zmienić)`);
  } else if (isPdf(b)) {
    extra = btn('blkFilter', '🎨', `Filtr PDF: ${filterLabel(b.filter)}`);
  }
  const tools = `<div class="blk-tools">
    <span class="grip" data-grip title="Przeciągnij, aby przenieść" aria-hidden="true">⠿</span>
    ${extra}${btn('blkUp', '↑', 'W górę')}${btn('blkDown', '↓', 'W dół')}${btn('blkDel', '🗑️', 'Usuń ten fragment')}</div>`;

  let body;
  if (b.type === 'text') {
    body = `<textarea class="blk-input" data-input="blkText" data-id="${id}" rows="1" spellcheck="true" ${isLast ? 'placeholder="Pisz tutaj…"' : ''}>\n${esc(b.text)}</textarea>`;
  } else if (b.type === 'image') {
    body = `<figure><img class="w-${b.width} f-${b.filter || 'none'}" data-file="${esc(b.fileId)}" data-bid="${id}" alt="${esc(b.name)}" data-action="openImage" data-id="${id}">
      <input class="caption" data-input="blkCaption" data-id="${id}" value="${esc(b.caption || '')}" placeholder="Podpis (opcjonalnie)" maxlength="200"></figure>`;
  } else if (isPdf(b)) {
    // PDF jest od razu rozwinięty także w trybie pisania (rysuje go hydrateReader)
    body = `<div class="r-file"><header>
      <span>${iconOf(b)} <strong>${esc(b.name)}</strong> <small class="muted">${fmtSize(b.size)}</small></span>
      <span class="r-links"><a data-file-href="${esc(b.fileId)}" target="_blank" rel="noopener" title="Otwórz w nowej karcie">↗</a>
        <a data-file-href="${esc(b.fileId)}" download="${esc(b.name)}" title="Pobierz">⬇</a></span></header>
      <div class="pdfwrap f-${b.filter || 'none'}" data-pdf="${esc(b.fileId)}"><p class="muted">Ładowanie PDF…</p></div></div>`;
  } else {
    body = `<div class="att">
      <div class="att-main"><span class="aic">${iconOf(b)}</span>
        <div class="ainfo"><strong>${esc(b.name)}</strong><small class="muted">${fmtSize(b.size)}</small></div></div>
      <div class="att-btns">
        ${isText(b) ? `<button type="button" class="btn small" data-action="attInsert" data-id="${id}">⤵ Wstaw treść jako tekst</button>` : ''}
        <a class="btn small" data-file-href="${esc(b.fileId)}" download="${esc(b.name)}">⬇ Pobierz</a>
      </div></div>`;
  }
  return `<section class="blk blk-${b.type}" data-block data-note="${esc(n.id)}" data-id="${id}">${tools}${body}</section>`;
}

const autosize = (el) => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; };
// Wywoływane po każdym narysowaniu widoku
export const afterRender = () => requestAnimationFrame(() => {
  document.querySelectorAll('textarea.blk-input').forEach(autosize);
  if (!pendingFocus) return;
  const f = pendingFocus; pendingFocus = null;
  if (f.titleOf) {
    const t = document.querySelector(`[data-note="${f.titleOf}"] .note-title`);
    t?.focus(); t?.scrollIntoView({ block: 'center' });
  } else {
    const ta = blockEl(f.blockId)?.querySelector('textarea');
    if (!ta) return;
    ta.focus();
    const c = f.caret ?? ta.value.length;
    ta.setSelectionRange(c, c);
  }
});
window.addEventListener('resize', afterRender);

// ---------- Tryb, notatki ----------
actions.setNoteMode = (el) => { S.ui.noteMode = el.dataset.v; save(); rerender(); };
actions.setNoteSubject = (el) => { S.ui.noteSubject = el.dataset.v; anchor = { noteId: null, blockId: null }; save(); rerender(); };
actions.newNote = () => {
  const n = { id: uid(), short: currentNoteSubject(), title: '', blocks: [newText()], created: Date.now(), updated: Date.now() };
  S.notes.push(n); S.ui.noteMode = 'write'; save();
  pendingFocus = { titleOf: n.id };
  rerender();
};
actions.editNote = (el) => {
  S.ui.noteMode = 'write'; save();
  const id = el.dataset.id;
  const first = noteOf(id)?.blocks.find((b) => b.type === 'text');
  pendingFocus = first ? { blockId: first.id, caret: 0 } : null;
  rerender();
  document.getElementById(`page-${id}`)?.scrollIntoView({ block: 'start' });
};
actions.noteDelete = async (el) => {
  const n = noteOf(el.dataset.id);
  if (!n || !confirm(`Usunąć notatkę „${n.title || 'Bez tytułu'}” razem ze zdjęciami i plikami?`)) return;
  for (const id of noteFileIds(n)) await delFile(id).catch(() => {});
  S.notes = S.notes.filter((x) => x.id !== n.id);
  save(); rerender();
};
actions.noteExport = (el) => {
  const n = noteOf(el.dataset.id);
  const lines = n.blocks.map((b) => (b.type === 'text' ? b.text
    : b.type === 'image' ? `[Zdjęcie: ${b.name}]${b.caption ? ` ${b.caption}` : ''}` : `[Plik: ${b.name}]`)).filter(Boolean);
  const blob = new Blob([`${n.title}\n\n${lines.join('\n\n')}`], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(n.title || 'notatka').replace(/[\\/:*?"<>|]/g, '_')}.txt`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

// ---------- Wpisywanie (autozapis) ----------
inputs.noteTitle = (el) => { const n = noteOf(el.dataset.id); if (n) { n.title = el.value; touch(n); } };
inputs.blkText = (el) => {
  const r = locate(el.dataset.id);
  if (r) { r.b.text = el.value; touch(r.n); autosize(el); }
};
inputs.blkCaption = (el) => {
  const r = locate(el.dataset.id);
  if (r) { r.b.caption = el.value; touch(r.n); }
};

// Zapamiętujemy, gdzie jest kursor: tam trafi wklejone zdjęcie lub wstawiony plik
document.addEventListener('focusin', (e) => {
  const blk = e.target.closest?.('[data-block]');
  if (blk) { anchor = { noteId: blk.dataset.note, blockId: blk.dataset.id }; return; }
  const page = e.target.closest?.('.page.write');
  if (page && e.target.closest('.page-head')) anchor = { noteId: page.dataset.note, blockId: '__start' };
});
// Przyciski paska formatowania nie mogą odbierać fokusu polu tekstowemu (inaczej znika zaznaczenie)
document.addEventListener('mousedown', (e) => { if (e.target.closest('[data-keepfocus]')) e.preventDefault(); });

// Formatowanie zaznaczonego tekstu: nagłówki, listy, pogrubienie, zakreślacz
actions.fmt = (el) => {
  const ta = anchor.blockId && blockEl(anchor.blockId)?.querySelector('textarea');
  if (!ta) return toast('Kliknij najpierw w tekst, który chcesz sformatować.');
  const { selectionStart: s, selectionEnd: e, value: v } = ta;
  const k = el.dataset.k;
  let out;
  if (k === 'b' || k === 'mark') {
    const m = k === 'b' ? '**' : '==';
    out = `${v.slice(0, s)}${m}${v.slice(s, e) || 'tekst'}${m}${v.slice(e)}`;
  } else {
    const prefix = { h1: '# ', h2: '## ', li: '- ', ol: '1. ' }[k];
    const ls = v.lastIndexOf('\n', s - 1) + 1;
    const block = v.slice(ls, e).split('\n').map((line) => prefix + line).join('\n');
    out = v.slice(0, ls) + block + v.slice(e);
  }
  ta.value = out;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
};

// ---------- Wstawianie zdjęć i plików w miejscu kursora ----------
// Jeśli kursor jest w środku tekstu, tekst dzieli się na dwie części, a plik trafia pomiędzy nie.
function insertAt(n, afterId, blocks) {
  let idx = n.blocks.length;
  if (afterId === '__start') idx = 0;
  else if (afterId) {
    const i = n.blocks.findIndex((b) => b.id === afterId);
    if (i >= 0) {
      idx = i + 1;
      const b = n.blocks[i];
      if (b.type === 'text') {
        const ta = blockEl(b.id)?.querySelector('textarea');
        const c = ta ? ta.selectionStart : b.text.length;
        if (c < b.text.length) {
          n.blocks.splice(i + 1, 0, newText(b.text.slice(c)));
          b.text = b.text.slice(0, c);
        }
      }
    }
  }
  n.blocks.splice(idx, 0, ...blocks);
}

async function addFiles(list, target) {
  const n = noteOf(target.noteId) || S.notes.find((x) => x.short === currentNoteSubject());
  if (!n) return toast('Najpierw dodaj notatkę.');
  try { navigator.storage?.persist?.(); } catch {} // prosi przeglądarkę, żeby nie kasowała plików przy braku miejsca
  const blocks = [];
  for (const f of list) {
    if (f.size > MAX_SIZE) { toast(`„${f.name}” jest za duży (limit 50 MB)`); continue; }
    const id = uid();
    try { await putFile(id, f); } catch { toast('Nie udało się zapisać pliku (brak miejsca?)'); continue; }
    blocks.push(fileBlock(id, f.name || 'plik', f.type || '', f.size));
  }
  if (!blocks.length) return;
  insertAt(n, target.noteId === n.id ? target.blockId : '', blocks);
  touch(n); rerender();
  toast(blocks.length === 1 ? 'Dodano do notatki' : `Dodano do notatki: ${blocks.length}`);
}

let pickTarget = null;
actions.insertFile = () => {
  if (!anchor.noteId || !noteOf(anchor.noteId)) return toast('Kliknij w miejsce w notatce, w które chcesz wstawić plik.');
  pickTarget = { ...anchor };
  document.getElementById('note-file')?.click();
};
changes.noteFiles = (el) => { addFiles([...el.files], pickTarget || anchor); pickTarget = null; el.value = ''; };

const writing = () => S.ui.tab === 'notes' && mode() === 'write';

// Wklejanie zdjęć ze schowka (np. zrzut ekranu)
document.addEventListener('paste', (e) => {
  if (!writing() || !anchor.noteId) return;
  const files = [...(e.clipboardData?.files || [])];
  if (!files.length || e.clipboardData.getData('text/plain')) return; // zwykły tekst wkleja się normalnie
  e.preventDefault();
  const stamp = new Date().toLocaleTimeString('pl-PL').replace(/:/g, '-');
  addFiles(files.map((f) => (f.name && f.name !== 'image.png' ? f
    : new File([f], `Wklejony obraz ${stamp}.${f.type.split('/')[1] || 'png'}`, { type: f.type }))), { ...anchor });
});

// ---------- Bloki: przesuwanie, rozmiar, filtry, usuwanie ----------
function move(id, delta) {
  const r = locate(id);
  if (!r) return;
  const j = r.i + delta;
  if (j < 0 || j >= r.n.blocks.length) return;
  [r.n.blocks[r.i], r.n.blocks[j]] = [r.n.blocks[j], r.n.blocks[r.i]];
  touch(r.n); rerender();
  blockEl(id)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
actions.blkUp = (el) => move(el.dataset.id, -1);
actions.blkDown = (el) => move(el.dataset.id, 1);
actions.blkSize = (el) => {
  const r = locate(el.dataset.id);
  if (r) { r.b.width = el.dataset.w; touch(r.n); rerender(); }
};
actions.blkFilter = (el) => {
  const r = locate(el.dataset.id);
  if (!r) return;
  r.b.filter = nextFilter(r.b.filter); touch(r.n); rerender();
  toast(`Filtr: ${filterLabel(r.b.filter)}`);
};
actions.blkDel = async (el) => {
  const r = locate(el.dataset.id);
  if (!r) return;
  const heavy = r.b.type !== 'text' || r.b.text.length > 60;
  if (heavy && !confirm(r.b.type === 'text' ? 'Usunąć ten fragment tekstu?' : `Usunąć „${r.b.name}” z notatki?`)) return;
  if (r.b.fileId) await delFile(r.b.fileId).catch(() => {});
  r.n.blocks.splice(r.i, 1);
  touch(r.n); rerender();
};

// Zdjęcia otwierają się na cały ekran z powiększaniem i filtrami
actions.openImage = (el) => {
  const r = locate(el.dataset.id);
  if (r) openViewer(r.b);
};
// Treść pliku tekstowego staje się zwykłym tekstem pod plikiem (można ją edytować)
actions.attInsert = async (el) => {
  const r = locate(el.dataset.id);
  if (!r) return;
  const blob = await getFile(r.b.fileId);
  const t = newText(blob ? await blob.text() : '');
  r.n.blocks.splice(r.i + 1, 0, t);
  touch(r.n);
  pendingFocus = { blockId: t.id, caret: 0 };
  rerender();
  toast('Wstawiono treść pliku jako tekst');
};

// ---------- Przeciąganie plików z komputera na stronę ----------
// (przesuwanie bloków wewnątrz notatki: drag.js)
const hasFiles = (e) => e.dataTransfer?.types?.includes('Files');
document.addEventListener('dragover', (e) => {
  if (!writing() || !hasFiles(e)) return;
  e.preventDefault(); // bez tego przeglądarka otworzyłaby upuszczony plik zamiast go dodać
  e.target.closest('.page.write')?.classList.add('over');
});
document.addEventListener('dragleave', (e) => {
  if (hasFiles(e)) e.target.closest?.('.page.write')?.classList.remove('over');
});
document.addEventListener('drop', (e) => {
  if (!writing() || !hasFiles(e)) return;
  e.preventDefault();
  document.querySelectorAll('.page.over').forEach((x) => x.classList.remove('over'));
  const page = e.target.closest('.page.write');
  if (!page) return;
  const files = [...(e.dataTransfer?.files || [])];
  if (files.length) addFiles(files, anchor.noteId === page.dataset.note ? { ...anchor } : { noteId: page.dataset.note, blockId: '' });
});
