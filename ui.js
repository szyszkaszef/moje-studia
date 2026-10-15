// ===== Wspólne elementy interfejsu: okienka, powiadomienia, rejestr akcji =====
import { esc } from './util.js';

// Każdy moduł dopisuje tu swoje funkcje; app.js wywołuje je po kliknięciu elementu z data-action="..."
export const actions = {};  // kliknięcia
export const forms = {};    // wysłane formularze (data-form="...")
export const changes = {};  // zmiany pól (data-change="...")
export const inputs = {};   // wpisywanie w pola (data-input="..."), np. autozapis notatek

// Wysuwane menu po prawej (na telefonie)
export const closeMenu = () => document.body.classList.remove('menu-open');

let renderFn = () => {};
export const setRender = (f) => { renderFn = f; };
export const rerender = () => renderFn();

const modal = () => document.getElementById('modal');
export function openModal(html) {
  const m = modal();
  m.innerHTML = html;
  if (!m.open) m.showModal();
}
export function closeModal() {
  const m = modal();
  if (m.open) m.close();
  m.innerHTML = '';
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

// Generatory kawałków formularza
export const field = (label, inner, cls = '') => `<label class="field ${cls}"><span>${label}</span>${inner}</label>`;
export const options = (items, selected) =>
  items.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(l)}</option>`).join('');
export const segmented = (action, items, current) =>
  `<div class="seg">${items.map(([v, l]) =>
    `<button type="button" class="${v === current ? 'active' : ''}" data-action="${action}" data-v="${esc(v)}">${l}</button>`).join('')}</div>`;
export const modalButtons = (extra = '') =>
  `<div class="modal-actions">${extra}<span class="grow"></span>
    <button type="button" class="btn" data-action="closeModal">Anuluj</button>
    <button type="submit" class="btn primary">Zapisz</button></div>`;
export const progressBar = (pct, color = 'var(--accent)') =>
  `<div class="bar"><i style="width:${Math.max(0, Math.min(100, pct))}%;background:${color}"></i></div>`;

actions.closeModal = () => closeModal();
