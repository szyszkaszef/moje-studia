// ===== Zakładka Dziś =====
import { S, save } from './store.js';
import { esc, todayISO, nowTime, daysBetween, fromISO, prettyDate, fmtDM, timeToMin } from './util.js';
import { allClasses, classesOn, isExam, studyMinutes, fmtMin } from './data.js';
import { classCard, taskCard } from './components.js';
import { actions, rerender } from './ui.js';

export function renderToday() {
  const td = todayISO(), nt = nowTime();
  const all = allClasses();
  const next = all.find((c) => c.status !== 'cancelled' && (c.date > td || (c.date === td && c.end > nt)));
  const todays = classesOn(all, td);
  const open = S.tasks.filter((t) => !t.done);
  const sortDue = (a, b) => a.due.localeCompare(b.due);
  const overdue = open.filter((t) => t.due < td).sort(sortDue);
  const soon = open.filter((t) => t.due >= td && daysBetween(td, t.due) <= 7).sort(sortDue);
  const exams = open.filter((t) => isExam(t) && t.due >= td && daysBetween(td, t.due) <= 30).sort(sortDue);

  let hero = '<div class="hero"><div class="big">Koniec zajęć w semestrze 🎉</div></div>';
  if (next) {
    const now = next.date === td && next.start <= nt;
    let when = next.date === td ? `dziś o ${next.start}` : `${daysBetween(td, next.date) === 1 ? 'jutro' : prettyDate(fromISO(next.date))}, ${next.start}`;
    if (!now && next.date === td) {
      const m = timeToMin(next.start) - timeToMin(nt);
      when += ` (za ${m >= 60 ? Math.floor(m / 60) + ' h ' : ''}${m % 60} min)`;
    }
    hero = `<div class="hero">
      <small>${now ? 'Trwa teraz' : 'Następne zajęcia'}</small>
      <div class="big">${esc(next.subject)}</div>
      <small>${esc(next.type)} · ${when}${next.room ? ` · sala ${esc(next.room)}` : ''}</small>
    </div>`;
  }

  const section = (title, items, render, empty) =>
    `<h2>${title}</h2>${items.length ? items.map(render).join('') : (empty ? `<p class="muted">${empty}</p>` : '')}`;

  return `
    ${hero}
    ${section('Dzisiejsze zajęcia', todays, classCard, 'Dziś nie masz zajęć 😎')}
    ${overdue.length ? section(`Po terminie (${overdue.length})`, overdue, taskCard) : ''}
    ${section('Zadania na najbliższe 7 dni', soon, taskCard, 'Brak pilnych zadań.')}
    ${exams.length ? section('🎯 Kolokwia i egzaminy (30 dni)', exams, taskCard) : ''}
    <div class="card study" role="button" tabindex="0" data-action="goPomodoro">
      <strong>📚 Nauka dziś: ${fmtMin(studyMinutes(td, td))}</strong>
      <small class="muted">Kliknij, żeby włączyć licznik pomodoro</small>
    </div>`;
}

actions.goPomodoro = () => { S.ui.tab = 'learn'; S.ui.learnTab = 'pomodoro'; save(); rerender(); window.scrollTo(0, 0); };
