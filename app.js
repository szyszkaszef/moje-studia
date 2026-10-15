// ===== Moje Studia – punkt startowy: rysowanie widoków, odświeżanie, obsługa kliknięć =====
import { S, save } from './store.js';
import { prettyDate } from './util.js';
import { setSchedule, initSubjects } from './data.js';
import { actions, forms, changes, inputs, setRender, closeModal, closeMenu } from './ui.js';
import { renderToday } from './today.js';
import { renderSchedule } from './schedule.js';
import { renderTasks } from './tasks.js';
import { renderLearn } from './learn.js';
import { renderNotes, migrateNotes, afterRender } from './notes.js';
import { renderSettings, applyAppearance } from './settings.js';
import { renderNav } from './nav.js';
import { hydrateReader } from './reader.js';
import { tick } from './pomodoro.js';
import { initSync } from './sync.js';

const VIEWS = { today: renderToday, schedule: renderSchedule, tasks: renderTasks, learn: renderLearn, notes: renderNotes, settings: renderSettings };

function render() {
  if (!VIEWS[S.ui.tab]) S.ui.tab = 'today';
  applyAppearance();
  document.getElementById('today-label').textContent = prettyDate(new Date());
  const y = window.scrollY;
  const view = document.getElementById('view');
  view.classList.toggle('wide', S.ui.tab === 'notes');
  view.innerHTML = VIEWS[S.ui.tab]();
  hydrateReader(view); // podstawia zdjęcia, wczytuje pliki tekstowe i rysuje PDF-y z magazynu
  afterRender(); // dopasowuje wysokość pól tekstowych w notatce
  renderNav();
  window.scrollTo(0, y);
}
setRender(render);

// Jeden "nasłuchiwacz" na całą stronę: element z data-action wywołuje funkcję o tej nazwie
const modalEl = document.getElementById('modal');
document.addEventListener('click', (e) => {
  if (e.target === modalEl) return closeModal();
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el, e);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button][data-action]')) { e.preventDefault(); e.target.click(); }
});
document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  forms[form.dataset.form]?.(new FormData(form), form);
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  if (el) changes[el.dataset.change]?.(el);
});
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el) inputs[el.dataset.input]?.(el);
});

// Co sekundę: zegar pomodoro. Co minutę: odśwież "Dziś", chyba że właśnie coś edytujesz.
setInterval(tick, 1000);
setInterval(() => { if (S.ui.tab === 'today' && !modalEl.open) render(); }, 60000);

fetch('/schedule.json')
  .then((r) => r.json())
  .then((data) => { setSchedule(data); initSubjects(); migrateNotes(); render(); tick(); initSync(); })
  .catch(() => { document.getElementById('view').textContent = 'Nie udało się wczytać grafiku (schedule.json).'; });
