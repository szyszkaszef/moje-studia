// ===== Lewy panel nawigacji =====
// Komputer: stały panel, który można zwinąć do wąskiego paska z ikonami (przycisk «).
// Telefon: panel wysuwa się z lewej po kliknięciu ☰.
import { S, save } from './store.js';
import { esc } from './util.js';
import { actions, rerender, closeMenu } from './ui.js';
import { currentNoteSubject, noteCount } from './notes.js';

const LEARN_PAGES = [['subjects', 'Przedmioty'], ['grades', 'Oceny'], ['pomodoro', 'Pomodoro']];

export function renderNav() {
  const t = S.ui.tab;
  document.body.classList.toggle('nav-collapsed', !!S.ui.navCollapsed);
  const openTasks = S.tasks.filter((x) => !x.done).length;

  // title = podpowiedź po najechaniu, przydatna gdy panel jest zwinięty do samych ikon
  const item = (tab, icon, label, extra = '') =>
    `<button class="nav-item ${t === tab ? 'active' : ''}" data-action="goTab" data-v="${tab}" title="${label}"><span class="ic">${icon}</span><span class="lb">${label}</span>${extra}</button>`;
  const group = (key, tab, icon, label, children) => `
    <div class="nav-group ${S.ui.navOpen[key] ? 'open' : ''}">
      <div class="nav-row">
        <button class="nav-item ${t === tab ? 'active' : ''}" data-action="navGroup" data-key="${key}" data-v="${tab}" title="${label}"><span class="ic">${icon}</span><span class="lb">${label}</span></button>
        <button class="chev" data-action="toggleGroup" data-key="${key}" aria-label="Rozwiń lub zwiń: ${label}" aria-expanded="${!!S.ui.navOpen[key]}">▾</button>
      </div>
      <div class="nav-sub">${children}</div>
    </div>`;

  const learnSub = LEARN_PAGES.map(([v, l]) =>
    `<button class="nav-sub-item ${t === 'learn' && S.ui.learnTab === v ? 'active' : ''}" data-action="goLearn" data-v="${v}">${l}</button>`).join('');
  const cur = currentNoteSubject();
  const notesSub = S.subjects.map((s) =>
    `<button class="nav-sub-item ${t === 'notes' && cur === s.short ? 'active' : ''}" data-action="goNotes" data-id="${esc(s.short)}">
      <i class="dot" style="background:${s.color}"></i><span class="lb">${esc(s.name)}</span>${noteCount(s.short) ? `<small>${noteCount(s.short)}</small>` : ''}</button>`).join('')
    || '<p class="muted pad">Brak przedmiotów</p>';

  document.getElementById('sidebar').innerHTML = `
    <div class="nav-head">
      <strong class="lb">Menu</strong>
      <button class="chev collapse-btn" data-action="toggleCollapse" aria-label="Zwiń lub rozwiń menu" title="Zwiń / rozwiń menu">«</button>
      <button class="chev close-btn" data-action="closeMenuBtn" aria-label="Zamknij menu">✕</button>
    </div>
    ${item('today', '📅', 'Dziś')}
    ${item('schedule', '🗓️', 'Grafik')}
    ${item('tasks', '✅', 'Zadania', openTasks ? `<small class="count">${openTasks}</small>` : '')}
    ${group('notes', 'notes', '📝', 'Notatki', notesSub)}
    ${group('learn', 'learn', '📚', 'Nauka', learnSub)}
    ${item('settings', '⚙️', 'Ustawienia')}`;
}

const go = () => { closeMenu(); save(); rerender(); window.scrollTo(0, 0); };

actions.toggleMenu = () => document.body.classList.toggle('menu-open');
actions.closeMenuBtn = () => closeMenu();
actions.toggleCollapse = () => { S.ui.navCollapsed = !S.ui.navCollapsed; save(); rerender(); };
actions.goTab = (el) => { S.ui.tab = el.dataset.v; go(); };
actions.toggleGroup = (el) => { S.ui.navOpen[el.dataset.key] = !S.ui.navOpen[el.dataset.key]; save(); rerender(); };
actions.navGroup = (el) => {
  S.ui.tab = el.dataset.v;
  S.ui.navOpen[el.dataset.key] = true;
  go();
};
actions.goLearn = (el) => { S.ui.tab = 'learn'; S.ui.learnTab = el.dataset.v; go(); };
actions.goNotes = (el) => { S.ui.tab = 'notes'; S.ui.noteSubject = el.dataset.id; go(); };
