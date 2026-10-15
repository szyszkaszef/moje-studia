// ===== Zakładka Zadania =====
import { S, save, normTask } from './store.js';
import { esc, todayISO, addDaysISO, daysBetween, uid } from './util.js';
import { TYPES, toggleTask, nameOf } from './data.js';
import { taskCard } from './components.js';
import { actions, forms, changes, rerender, openModal, closeModal, toast, field, options, segmented, modalButtons } from './ui.js';

const PRIO = { high: 0, normal: 1, low: 2 };

export function renderTasks() {
  const td = todayISO();
  const tab = S.ui.taskTab;
  let list = S.tasks.filter((t) => (tab === 'todo' ? !t.done : t.done) && (!S.ui.taskSubject || t.subject === S.ui.taskSubject));
  list.sort(S.ui.taskSort === 'prio'
    ? (a, b) => PRIO[a.priority] - PRIO[b.priority] || a.due.localeCompare(b.due)
    : (a, b) => a.due.localeCompare(b.due) || PRIO[a.priority] - PRIO[b.priority]);

  let body;
  if (!list.length) body = '<p class="muted">Pusto tutaj.</p>';
  else if (tab === 'todo' && S.ui.taskSort === 'due') {
    const groups = [['Po terminie', (t) => t.due < td], ['Dziś', (t) => t.due === td],
      ['Najbliższe 7 dni', (t) => t.due > td && daysBetween(td, t.due) <= 7], ['Później', () => true]];
    const used = new Set();
    body = groups.map(([name, test]) => {
      const part = list.filter((t) => !used.has(t.id) && test(t));
      part.forEach((t) => used.add(t.id));
      return part.length ? `<h2>${name} (${part.length})</h2>${part.map(taskCard).join('')}` : '';
    }).join('');
  } else body = list.map(taskCard).join('');

  const subjOpts = [['', 'Wszystkie przedmioty'], ...S.subjects.map((s) => [s.short, s.name])];
  return `
    <div class="toolbar">
      ${segmented('setTaskTab', [['todo', `Do zrobienia (${S.tasks.filter((t) => !t.done).length})`], ['done', `Zrobione (${S.tasks.filter((t) => t.done).length})`]], tab)}
      <button class="btn primary" data-action="newTask">＋ Zadanie</button>
    </div>
    <div class="row2">
      <select data-change="taskSubject" aria-label="Przedmiot">${options(subjOpts, S.ui.taskSubject)}</select>
      <select data-change="taskSort" aria-label="Sortowanie">${options([['due', 'Sortuj: termin'], ['prio', 'Sortuj: priorytet']], S.ui.taskSort)}</select>
    </div>
    ${body}`;
}

actions.setTaskTab = (el) => { S.ui.taskTab = el.dataset.v; save(); rerender(); };
changes.taskSubject = (el) => { S.ui.taskSubject = el.value; save(); rerender(); };
changes.taskSort = (el) => { S.ui.taskSort = el.value; save(); rerender(); };

actions.toggleTask = (el) => {
  const t = S.tasks.find((x) => x.id === el.dataset.id);
  if (!t) return;
  const msg = toggleTask(t);
  save(); rerender();
  if (msg) toast(msg);
};

actions.newTask = () => openTaskDialog(null);
actions.editTask = (el) => openTaskDialog(S.tasks.find((x) => x.id === el.dataset.id));

const subRow = (s = { text: '', done: false }) =>
  `<div class="subrow"><input type="checkbox" class="subchk" ${s.done ? 'checked' : ''}>
    <input type="text" class="subtext" value="${esc(s.text)}" placeholder="Podzadanie" maxlength="150">
    <button type="button" class="del" data-action="rmSub" aria-label="Usuń podzadanie">✕</button></div>`;

function openTaskDialog(t) {
  const x = t || normTask({ title: '', subject: S.ui.taskSubject || S.ui.filter || '', due: addDaysISO(todayISO(), 7) });
  openModal(`
    <form data-form="taskForm" class="modal-form">
      <input type="hidden" name="id" value="${esc(t?.id || '')}">
      <h3>${t ? 'Edytuj zadanie' : 'Nowe zadanie'}</h3>
      ${field('Tytuł', `<input name="title" value="${esc(x.title)}" required maxlength="200" placeholder="np. Sprawozdanie z laborek">`)}
      <div class="row2">
        ${field('Przedmiot', `<select name="subject">${options([['', '—'], ...S.subjects.map((s) => [s.short, s.name])], x.subject)}</select>`)}
        ${field('Rodzaj', `<select name="type">${options(Object.entries(TYPES), x.type)}</select>`)}
      </div>
      <div class="row2">
        ${field('Termin', `<input type="date" name="due" value="${esc(x.due)}" required>`)}
        ${field('Godzina (opcjonalnie)', `<input type="time" name="time" value="${esc(x.time)}">`)}
      </div>
      <div class="row2">
        ${field('Priorytet', `<select name="priority">${options([['high', 'Wysoki 🔥'], ['normal', 'Normalny'], ['low', 'Niski']], x.priority)}</select>`)}
        ${field('Powtarzanie', `<select name="repeat">${options([['none', 'Nie powtarzaj'], ['weekly', 'Co tydzień'], ['biweekly', 'Co 2 tygodnie'], ['monthly', 'Co miesiąc']], x.repeat)}</select>`)}
      </div>
      <div class="field"><span>Podzadania</span>
        <div id="subs">${x.subtasks.map(subRow).join('')}</div>
        <button type="button" class="btn small" data-action="addSub">＋ Dodaj podzadanie</button></div>
      ${field('Notatki', `<textarea name="notes" rows="3" maxlength="2000">${esc(x.notes)}</textarea>`)}
      ${modalButtons(t ? `<button type="button" class="btn danger" data-action="deleteTask" data-id="${esc(t.id)}">Usuń</button>` : '')}
    </form>`);
}

actions.addSub = () => {
  const box = document.getElementById('subs');
  box.insertAdjacentHTML('beforeend', subRow());
  box.lastElementChild.querySelector('.subtext').focus();
};
actions.rmSub = (el) => el.closest('.subrow').remove();

forms.taskForm = (f, form) => {
  const subtasks = [...form.querySelectorAll('.subrow')]
    .map((r) => ({ id: uid(), text: r.querySelector('.subtext').value.trim(), done: r.querySelector('.subchk').checked }))
    .filter((s) => s.text);
  const data = {
    title: f.get('title').trim(), subject: f.get('subject'), type: f.get('type'), due: f.get('due'),
    time: f.get('time'), priority: f.get('priority'), repeat: f.get('repeat'), notes: f.get('notes').trim(), subtasks,
  };
  if (!data.title) return toast('Podaj tytuł zadania.');
  const id = f.get('id');
  if (id) Object.assign(S.tasks.find((x) => x.id === id), data);
  else S.tasks.push(normTask({ id: uid(), done: false, ...data }));
  save(); closeModal(); rerender();
};

actions.deleteTask = (el) => {
  if (!confirm('Usunąć to zadanie?')) return;
  S.tasks = S.tasks.filter((x) => x.id !== el.dataset.id);
  save(); closeModal(); rerender();
};
