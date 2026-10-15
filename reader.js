// ===== Tryb czytania: notatki sformatowane, wszystko otwarte (do nauki) =====
// Teksty są ładnie sformatowane, pliki tekstowe i CSV rozwinięte, PDF-y narysowane, zdjęcia duże.
// Tryb pisania (notes.js) pokazuje te same notatki jako dokument, w którym piszesz swobodnie.
import { S, save } from './store.js';
import { esc } from './util.js';
import { colorOf } from './data.js';
import { getFile, hydrate } from './files.js';
import { isPdf, isCsv, isMd, isText, iconOf, fmtSize } from './filetypes.js';
import { renderMd, csvTable } from './md.js';
import { renderPdf } from './pdfview.js';
import { actions, rerender } from './ui.js';

export const notebookStyle = () => S.settings.notebook || 'dark';

function readBlock(b) {
  const id = esc(b.id);
  const filter = `f-${b.filter || 'none'}`;
  if (b.type === 'text') {
    return b.text.trim() ? `<div class="rb rb-text md">${renderMd(b.text)}</div>` : '';
  }
  if (b.type === 'image') {
    return `<figure class="rb r-img w-${b.width} ${b.width === 'l' ? 'span' : ''}">
      <img class="${filter}" data-file="${esc(b.fileId)}" data-bid="${id}" data-action="openImage" data-id="${id}" alt="${esc(b.name)}" title="Kliknij, aby powiększyć">
      ${b.caption ? `<figcaption>${esc(b.caption)}</figcaption>` : ''}</figure>`;
  }
  const head = (extra = '') => `<header><span>${iconOf(b)} <strong>${esc(b.name)}</strong> <small class="muted">${fmtSize(b.size)}</small></span>
    <span class="r-links">${extra}<a data-file-href="${esc(b.fileId)}" download="${esc(b.name)}" title="Pobierz">⬇</a></span></header>`;
  if (isPdf(b)) {
    return `<div class="rb r-file span">${head(`<a data-file-href="${esc(b.fileId)}" target="_blank" rel="noopener" title="Otwórz w nowej karcie">↗</a>`)}
      <div class="pdfwrap ${filter}" data-pdf="${esc(b.fileId)}"><p class="muted">Ładowanie PDF…</p></div></div>`;
  }
  if (isText(b)) {
    const kind = isMd(b) ? 'md' : isCsv(b) ? 'csv' : 'txt';
    return `<div class="rb r-file ${kind === 'csv' ? 'span' : ''}">${head()}
      <div class="textfile" data-textfile="${esc(b.fileId)}" data-kind="${kind}"><p class="muted">Ładowanie…</p></div></div>`;
  }
  return `<div class="rb r-file">${head()}<p class="muted pad">Tego typu pliku nie da się wyświetlić w aplikacji. Pobierz go przyciskiem ⬇.</p></div>`;
}

export function readPage(n, cols) {
  const folded = !!S.ui.collapsed[n.id];
  const date = new Date(n.created).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' });
  const body = n.blocks.map(readBlock).join('');
  return `<section class="page nb" data-nb="${notebookStyle()}" id="page-${esc(n.id)}" style="--c:${colorOf(n.short)}">
    <header class="page-head">
      <h2>${esc(n.title || 'Bez tytułu')}</h2><small class="muted">${date}</small><span class="grow"></span>
      <button class="btn small" data-action="noteFold" data-id="${esc(n.id)}">${folded ? '▸ Rozwiń' : '▾ Zwiń'}</button>
      <button class="btn small" data-action="editNote" data-id="${esc(n.id)}">✎ Pisz</button>
    </header>
    ${folded ? '' : `<div class="page-body cols-${cols}">${body || '<p class="muted">Pusta strona. Kliknij ✎ Pisz, żeby dodać treść.</p>'}</div>`}
  </section>`;
}

// Po narysowaniu widoku: wczytaj treść plików tekstowych i narysuj PDF-y
export function hydrateReader(root) {
  root.querySelectorAll('[data-textfile]:not([data-done])').forEach(async (el) => {
    el.dataset.done = '1';
    const blob = await getFile(el.dataset.textfile).catch(() => null);
    if (!blob) { el.textContent = '(brak pliku)'; return; }
    let text = await blob.text();
    const cut = text.length > 200000;
    if (cut) text = text.slice(0, 200000);
    const kind = el.dataset.kind;
    el.innerHTML = (kind === 'md' ? `<div class="md">${renderMd(text)}</div>`
      : kind === 'csv' ? csvTable(text) : `<pre class="plain">${esc(text)}</pre>`)
      + (cut ? '<p class="muted">… plik skrócony do 200 000 znaków. Resztę zobaczysz po pobraniu.</p>' : '');
  });
  root.querySelectorAll('[data-pdf]:not([data-done])').forEach(async (el) => {
    el.dataset.done = '1';
    const blob = await getFile(el.dataset.pdf).catch(() => null);
    if (!blob) { el.textContent = '(brak pliku)'; return; }
    renderPdf(el, blob);
  });
  hydrate(root);
}

actions.setCols = (el) => { S.ui.noteCols = el.dataset.v; save(); rerender(); };
actions.noteFold = (el) => { S.ui.collapsed[el.dataset.id] = !S.ui.collapsed[el.dataset.id]; save(); rerender(); };
actions.jumpNote = (el) => {
  if (S.ui.collapsed[el.dataset.id]) { S.ui.collapsed[el.dataset.id] = false; save(); rerender(); }
  document.getElementById(`page-${el.dataset.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
