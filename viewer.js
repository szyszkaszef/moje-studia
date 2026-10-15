// ===== Pełnoekranowa przeglądarka zdjęć: powiększanie i filtry czytelności =====
// Filtry pomagają z zapisami ręcznymi, zdjęciami tablicy i wykresami: kontrast, czarno-białe, negatyw.
import { save } from './store.js';
import { esc } from './util.js';
import { actions, changes } from './ui.js';
import { hydrate } from './files.js';

export const FILTERS = [['none', 'Oryginał'], ['contrast', 'Kontrast'], ['bw', 'Czarno-białe'], ['invert', 'Negatyw']];
export const nextFilter = (f = 'none') => FILTERS[(FILTERS.findIndex(([v]) => v === f) + 1) % FILTERS.length][0];
export const filterLabel = (f = 'none') => FILTERS.find(([v]) => v === f)?.[1] || 'Oryginał';

export function setFilterClass(el, f) {
  [...el.classList].filter((c) => c.startsWith('f-')).forEach((c) => el.classList.remove(c));
  el.classList.add(`f-${f || 'none'}`);
}

let cur = null;
let zoom = 1;
const root = () => document.getElementById('viewer');
const img = () => document.getElementById('v-img');
const applyZoom = () => { img().style.width = `${zoom * 100}%`; img().style.maxWidth = zoom > 1 ? 'none' : '100%'; };

export function openViewer(block) {
  cur = block; zoom = 1;
  root().innerHTML = `
    <div class="v-bar">
      <strong class="v-name">${esc(block.caption || block.name)}</strong><span class="grow"></span>
      <button class="btn small" data-action="vZoom" data-d="-0.5" aria-label="Pomniejsz">−</button>
      <button class="btn small" data-action="vZoom" data-d="0">Dopasuj</button>
      <button class="btn small" data-action="vZoom" data-d="0.5" aria-label="Powiększ">＋</button>
      <select data-change="vFilter" aria-label="Filtr czytelności">${FILTERS.map(([v, l]) => `<option value="${v}" ${v === (block.filter || 'none') ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <a class="btn small" data-file-href="${esc(block.fileId)}" download="${esc(block.name)}">⬇</a>
      <button class="btn small primary" data-action="vClose" aria-label="Zamknij">✕</button>
    </div>
    <div class="v-scroll"><img id="v-img" class="f-${block.filter || 'none'}" data-file="${esc(block.fileId)}" alt="${esc(block.name)}"></div>`;
  root().hidden = false;
  document.body.classList.add('viewing');
  hydrate(root());
}

function close() {
  root().hidden = true; root().innerHTML = '';
  document.body.classList.remove('viewing');
  cur = null;
}

actions.vClose = close;
actions.vZoom = (el) => {
  const d = Number(el.dataset.d);
  zoom = d === 0 ? 1 : Math.min(5, Math.max(0.5, zoom + d));
  applyZoom();
};
changes.vFilter = (el) => {
  if (!cur) return;
  cur.filter = el.value; save();
  setFilterClass(img(), cur.filter);
  // te same zmiany od razu na stronie notatki
  document.querySelectorAll(`[data-bid="${cur.id}"]`).forEach((n) => setFilterClass(n, cur.filter));
};

document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && cur) close(); });
document.addEventListener('dblclick', (e) => {
  if (e.target.id === 'v-img') { zoom = zoom > 1 ? 1 : 2.5; applyZoom(); }
});
