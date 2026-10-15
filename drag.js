// ===== Przesuwanie bloków po notatce: uchwyt ⠿ =====
// Złap uchwyt (myszką albo palcem), przeciągnij nad inny blok i puść. Blok ląduje nad lub pod nim,
// także w innej notatce tego przedmiotu. Gdy trzymasz blok przy górnej lub dolnej krawędzi
// ekranu, strona przewija się sama, więc można przenieść plik przez całą długą notatkę.
import { S, save } from './store.js';
import { rerender } from './ui.js';

const EDGE = 90;      // strefa przy krawędzi ekranu (px), w której zaczyna się przewijanie
const MAX_SPEED = 24; // maksymalna prędkość przewijania (px na klatkę)

let d = null; // trwające przeciąganie: { id, el, ghost, x, y, target, below, raf }

function find(id) {
  for (const n of S.notes) {
    const i = n.blocks.findIndex((b) => b.id === id);
    if (i >= 0) return { n, i };
  }
  return null;
}

function labelOf(el) {
  const img = el.querySelector('img');
  if (img) return `🖼 ${img.alt || 'zdjęcie'}`;
  const name = el.querySelector('.ainfo strong, .r-file header strong');
  if (name) return `📎 ${name.textContent}`;
  const text = el.querySelector('textarea')?.value.trim().replace(/\s+/g, ' ').slice(0, 40);
  return `¶ ${text || 'tekst'}`;
}

const clearMarks = () => document.querySelectorAll('.drop-above, .drop-below').forEach((x) => x.classList.remove('drop-above', 'drop-below'));

// Szuka bloku pod wskaźnikiem (nie licząc przenoszonego) i zaznacza, czy wstawimy nad nim, czy pod nim
function pick() {
  const els = document.elementsFromPoint(d.x, d.y);
  if (!els.some((e) => e.closest?.('.page.write'))) { clearMarks(); d.target = null; return; }
  const t = els.map((e) => e.closest?.('[data-block]')).find((b) => b && b !== d.el);
  if (!t) return; // wskaźnik między blokami: zostaje poprzedni cel
  const r = t.getBoundingClientRect();
  d.below = d.y >= r.top + r.height / 2;
  clearMarks();
  t.classList.add(d.below ? 'drop-below' : 'drop-above');
  d.target = t;
}

function place() {
  d.ghost.style.transform = `translate(${d.x + 14}px, ${d.y + 14}px)`;
}

// Co ~16 ms: przewiń stronę, jeśli wskaźnik jest blisko krawędzi, i odśwież cel upuszczenia
// (zwykły timer zamiast requestAnimationFrame: nie zatrzymuje się, gdy przeglądarka wstrzymuje animacje)
function loop() {
  if (!d) return;
  const top = (document.querySelector('.notebar')?.getBoundingClientRect().bottom || 0) + 30;
  const bottom = window.innerHeight - EDGE;
  let v = 0;
  if (d.y < top) v = -Math.min(1, (top - d.y) / EDGE) * MAX_SPEED;
  else if (d.y > bottom) v = Math.min(1, (d.y - bottom) / EDGE) * MAX_SPEED;
  if (v) window.scrollBy(0, v);
  pick();
}

function finish(drop) {
  clearInterval(d.timer);
  d.ghost.remove();
  d.el.classList.remove('dragging');
  document.body.classList.remove('dragging-blocks');
  clearMarks();
  const { id, target, below } = d;
  d = null;
  if (!drop || !target) return;

  const from = find(id);
  const to = find(target.dataset.id);
  if (!from || !to) return;
  const [moved] = from.n.blocks.splice(from.i, 1);
  const t = find(target.dataset.id); // pozycja celu mogła się zmienić po wyjęciu bloku
  t.n.blocks.splice(t.i + (below ? 1 : 0), 0, moved);
  from.n.updated = t.n.updated = Date.now();
  save();
  rerender();
}

document.addEventListener('pointerdown', (e) => {
  const grip = e.target.closest?.('[data-grip]');
  if (!grip || d || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const el = grip.closest('[data-block]');
  if (!el) return;
  e.preventDefault();
  try { grip.setPointerCapture(e.pointerId); } catch { /* np. zdarzenie testowe */ }

  const ghost = document.createElement('div');
  ghost.className = 'drag-ghost';
  ghost.textContent = labelOf(el);
  document.body.append(ghost);

  d = { id: el.dataset.id, el, ghost, x: e.clientX, y: e.clientY, target: null, below: false, timer: 0 };
  el.classList.add('dragging');
  document.body.classList.add('dragging-blocks');
  place();
  d.timer = setInterval(loop, 16);
});

document.addEventListener('pointermove', (e) => {
  if (!d) return;
  d.x = e.clientX; d.y = e.clientY;
  place();
});
document.addEventListener('pointerup', (e) => {
  if (!d) return;
  d.x = e.clientX; d.y = e.clientY;
  pick();
  finish(true);
});
document.addEventListener('pointercancel', () => { if (d) finish(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && d) finish(false); });
