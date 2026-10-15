// ===== Karty zajęć i zadań (używane w kilku widokach) =====
import { S } from './store.js';
import { esc, todayISO, nowTime } from './util.js';
import { colorOf, nameOf, TYPES, isExam, dueLabel } from './data.js';

export function classCard(c) {
  const td = todayISO(), t = nowTime();
  let st = '';
  if (c.status === 'cancelled') st = 'cancelled';
  else if (c.date < td || (c.date === td && c.end <= t)) st = 'past';
  else if (c.date === td && c.start <= t) st = 'now';

  const moved = c.status === 'moved';
  const oldRoom = moved && c.orig && c.orig.room !== c.room ? ` <s>${esc(c.orig.room)}</s>` : '';
  const room = c.room ? `📍 ${esc(c.room)}${oldRoom}` : '';
  const meta = [room, S.settings.showTeacher && c.teacher ? esc(c.teacher) : ''].filter(Boolean).join(' · ');

  const badges = [`<span class="badge">${esc(c.type)}${st === 'now' ? ' · trwa teraz' : ''}</span>`];
  if (moved) badges.push('<span class="badge warn">Zmiana</span>');
  if (c.status === 'cancelled') badges.push('<span class="badge bad">Odwołane</span>');
  if (c.custom) badges.push('<span class="badge">własne</span>');

  return `
    <div class="class ${st}" role="button" tabindex="0" data-action="editClass" data-id="${esc(c.id)}" style="--c:${colorOf(c.short)}">
      <div class="time">${esc(c.start)}<small>${esc(c.end)}</small></div>
      <div class="info">
        <div class="name">${esc(c.subject)}</div>
        ${meta ? `<div class="meta">${meta}</div>` : ''}
        ${c.note ? `<div class="meta">📝 ${esc(c.note)}</div>` : ''}
        <div class="badges">${badges.join('')}</div>
      </div>
    </div>`;
}

export function taskCard(t) {
  const due = dueLabel(t);
  const subs = t.subtasks || [];
  const subDone = subs.filter((s) => s.done).length;
  const exam = isExam(t);
  const subj = t.subject ? `${esc(nameOf(t.subject))} · ` : '';
  const tags = [];
  if (t.type !== 'zadanie') tags.push(`<span class="badge">${TYPES[t.type] || t.type}</span>`);
  if (t.repeat && t.repeat !== 'none') tags.push(`<span class="badge">🔁${t.doneCount ? ' ×' + t.doneCount : ''}</span>`);
  if (subs.length) tags.push(`<span class="badge">☑ ${subDone}/${subs.length}</span>`);
  if (t.notes) tags.push('<span class="badge">📝</span>');
  return `
    <div class="task ${t.done ? 'done' : ''} ${exam ? 'exam' : ''}" style="--c:${t.subject ? colorOf(t.subject) : 'var(--line)'}">
      <input type="checkbox" data-action="toggleTask" data-id="${esc(t.id)}" ${t.done ? 'checked' : ''} aria-label="Oznacz jako zrobione">
      <div class="info" role="button" tabindex="0" data-action="editTask" data-id="${esc(t.id)}">
        <div class="title">${exam ? '🎯 ' : ''}${t.priority === 'high' ? '🔥 ' : ''}${esc(t.title)}</div>
        <div class="due ${due.cls}">${subj}${due.text}</div>
        ${tags.length ? `<div class="badges">${tags.join('')}</div>` : ''}
      </div>
    </div>`;
}
