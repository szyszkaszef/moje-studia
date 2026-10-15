// ===== Zakładka Grafik: tydzień, miesiąc, filtry, dodawanie i edycja zajęć =====
import { S, save } from './store.js';
import {
  esc, todayISO, toISO, fromISO, addDays, addDaysISO, mondayOf, pad, uid, fmtDM,
  DAYS, DAYS_SHORT, MONTHS_NOM,
} from './util.js';
import { allClasses, classesOn, colorOf, nameOf, CLASS_TYPES, isExam } from './data.js';
import { classCard, taskCard } from './components.js';
import { actions, forms, rerender, openModal, closeModal, toast, field, options, segmented, modalButtons } from './ui.js';

let weekOffset = 0;
let monthOffset = 0;
let selectedDay = null;

const passesFilter = (short) => !S.ui.filter || short === S.ui.filter;

function filterChips() {
  const chips = S.subjects.map((s) =>
    `<button class="chip ${S.ui.filter === s.short ? 'active' : ''}" style="--c:${s.color}" data-action="setFilter" data-v="${esc(s.short)}">${esc(s.short)}</button>`).join('');
  return `<div class="chips"><button class="chip ${!S.ui.filter ? 'active' : ''}" data-action="setFilter" data-v="">Wszystkie</button>${chips}</div>`;
}

// Kolokwia i egzaminy pokazujemy na grafiku obok zajęć
const examsOn = (iso) => S.tasks.filter((t) => isExam(t) && t.due === iso && passesFilter(t.subject));

export function renderSchedule() {
  const view = S.ui.scheduleView;
  return `
    <div class="toolbar">
      ${segmented('setScheduleView', [['week', 'Tydzień'], ['month', 'Miesiąc']], view)}
      <button class="btn primary" data-action="newClass">＋ Zajęcia</button>
    </div>
    ${filterChips()}
    ${view === 'week' ? renderWeek() : renderMonth()}`;
}

function renderWeek() {
  const td = todayISO();
  const all = allClasses().filter((c) => passesFilter(c.short));
  const monday = addDays(mondayOf(new Date()), weekOffset * 7);
  const sunday = addDays(monday, 6);
  let days = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i), iso = toISO(d);
    const list = classesOn(all, iso), exams = examsOn(iso);
    if (i >= 5 && !list.length && !exams.length) continue; // weekend tylko gdy coś jest
    days += `<div>
      <div class="day-title ${iso === td ? 'is-today' : ''}">${DAYS[d.getDay()]} ${fmtDM(iso)}</div>
      ${exams.map(taskCard).join('')}
      ${list.length ? list.map(classCard).join('') : (exams.length ? '' : '<p class="muted">Wolne</p>')}
    </div>`;
  }
  return `
    <div class="week-nav">
      <button data-action="weekNav" data-v="-1" aria-label="Poprzedni tydzień">←</button>
      <div class="center"><strong>${fmtDM(toISO(monday))} – ${fmtDM(toISO(sunday))}</strong><br>
        ${weekOffset !== 0 ? '<button class="btn small" data-action="weekNav" data-v="0">Wróć do bieżącego</button>' : '<small class="muted">bieżący tydzień</small>'}</div>
      <button data-action="weekNav" data-v="1" aria-label="Następny tydzień">→</button>
    </div>
    <div class="week-grid">${days}</div>`;
}

function renderMonth() {
  const td = todayISO();
  const base = new Date(new Date().getFullYear(), new Date().getMonth() + monthOffset, 1);
  const y = base.getFullYear(), m = base.getMonth();
  const all = allClasses().filter((c) => passesFilter(c.short));
  const byDate = new Map();
  for (const c of all) (byDate.get(c.date) || byDate.set(c.date, []).get(c.date)).push(c);

  const start = mondayOf(base);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const weeks = Math.ceil(((base.getDay() + 6) % 7 + daysInMonth) / 7);
  const defSel = (monthOffset === 0) ? td : toISO(base);
  const sel = selectedDay && fromISO(selectedDay).getMonth() === m ? selectedDay : defSel;

  let cells = DAYS_SHORT.slice(1).concat(DAYS_SHORT[0]).map((d) => `<div class="dow">${d}</div>`).join('');
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i), iso = toISO(d);
    const cls = (byDate.get(iso) || []).filter((c) => c.status !== 'cancelled');
    const tasksDue = S.tasks.filter((t) => !t.done && t.due === iso && passesFilter(t.subject));
    const dots = cls.slice(0, 5).map((c) => `<i style="background:${colorOf(c.short)}"></i>`).join('')
      + tasksDue.filter((t) => !isExam(t)).slice(0, 2).map((t) => `<u style="border-color:${t.subject ? colorOf(t.subject) : 'var(--muted)'}"></u>`).join('');
    const exam = tasksDue.some(isExam) ? '<em>🎯</em>' : '';
    cells += `<button class="cell ${d.getMonth() !== m ? 'dim' : ''} ${iso === td ? 'today' : ''} ${iso === sel ? 'sel' : ''}" data-action="pickDay" data-date="${iso}">
      <span class="n">${d.getDate()}</span>${exam}<span class="dots">${dots}</span></button>`;
  }

  const dayClasses = classesOn(all, sel);
  const dayTasks = S.tasks.filter((t) => t.due === sel && passesFilter(t.subject));
  const sd = fromISO(sel);
  return `
    <div class="week-nav">
      <button data-action="monthNav" data-v="-1" aria-label="Poprzedni miesiąc">←</button>
      <div class="center"><strong>${MONTHS_NOM[m]} ${y}</strong><br>
        ${monthOffset !== 0 ? '<button class="btn small" data-action="monthNav" data-v="0">Wróć do bieżącego</button>' : '<small class="muted">bieżący miesiąc</small>'}</div>
      <button data-action="monthNav" data-v="1" aria-label="Następny miesiąc">→</button>
    </div>
    <div class="month">${cells}</div>
    <p class="legend muted">● zajęcia &nbsp; ○ zadanie &nbsp; 🎯 kolokwium/egzamin</p>
    <div class="day-title">${DAYS[sd.getDay()]} ${fmtDM(sel)}</div>
    ${dayTasks.map(taskCard).join('')}
    ${dayClasses.length ? dayClasses.map(classCard).join('') : (dayTasks.length ? '' : '<p class="muted">Brak zajęć tego dnia.</p>')}`;
}

// ---------- Nawigacja i filtry ----------
actions.setScheduleView = (el) => { S.ui.scheduleView = el.dataset.v; save(); rerender(); };
actions.setFilter = (el) => { S.ui.filter = el.dataset.v; save(); rerender(); };
actions.weekNav = (el) => { weekOffset = el.dataset.v === '0' ? 0 : weekOffset + Number(el.dataset.v); rerender(); };
actions.monthNav = (el) => { monthOffset = el.dataset.v === '0' ? 0 : monthOffset + Number(el.dataset.v); selectedDay = null; rerender(); };
actions.pickDay = (el) => { selectedDay = el.dataset.date; rerender(); };

// ---------- Okienka edycji zajęć ----------
const STATUS = [['ok', 'Odbywa się normalnie'], ['moved', 'Zmiana sali / godziny'], ['cancelled', 'Odwołane']];

actions.newClass = () => openClassDialog(null, selectedDay || todayISO());
actions.editClass = (el) => {
  const c = allClasses().find((x) => x.id === el.dataset.id);
  if (c) openClassDialog(c);
};

function openClassDialog(c, date) {
  const subjOpts = S.subjects.map((s) => [s.short, s.name]);
  if (c && !c.custom) {
    // Zajęcia z PDF: nie zmieniamy przedmiotu i daty, ale możesz oznaczyć odwołanie, zmianę sali, godzinę i dodać notatkę
    openModal(`
      <form data-form="classForm" class="modal-form">
        <input type="hidden" name="mode" value="override"><input type="hidden" name="id" value="${esc(c.id)}">
        <h3>${esc(c.subject)}</h3>
        <p class="muted">${esc(c.type)} · ${fmtDM(c.date)} · ${esc(c.teacher || '')}<br>Z PDF: ${esc(c.orig.start)}–${esc(c.orig.end)}, sala ${esc(c.orig.room)}</p>
        ${field('Status', `<select name="status">${options(STATUS, c.status)}</select>`)}
        <div class="row2">
          ${field('Początek', `<input type="time" name="start" value="${esc(c.start)}" required>`)}
          ${field('Koniec', `<input type="time" name="end" value="${esc(c.end)}" required>`)}
        </div>
        ${field('Sala', `<input name="room" value="${esc(c.room)}" maxlength="40">`)}
        ${field('Notatka', `<input name="note" value="${esc(c.note || '')}" maxlength="200" placeholder="np. przynieść kalkulator">`)}
        ${modalButtons(c.hasOverride ? `<button type="button" class="btn danger" data-action="resetClass" data-id="${esc(c.id)}">Przywróć z PDF</button>` : '')}
      </form>`);
    return;
  }
  const x = c || { short: S.ui.filter || S.subjects[0]?.short || '', type: 'Wykład', date, start: '08:00', end: '09:30', room: '', teacher: '', note: '' };
  openModal(`
    <form data-form="classForm" class="modal-form">
      <input type="hidden" name="mode" value="${c ? 'custom-edit' : 'new'}"><input type="hidden" name="id" value="${esc(c?.id || '')}">
      <h3>${c ? 'Edytuj zajęcia' : 'Nowe zajęcia'}</h3>
      ${S.subjects.length ? '' : '<p class="muted">Najpierw dodaj przedmiot w zakładce Nauka.</p>'}
      ${field('Przedmiot', `<select name="short" required>${options(subjOpts, x.short)}</select>`)}
      ${field('Rodzaj', `<select name="type">${options(CLASS_TYPES.map((t) => [t, t]), x.type)}</select>`)}
      ${field('Data', `<input type="date" name="date" value="${esc(x.date)}" required>`)}
      <div class="row2">
        ${field('Początek', `<input type="time" name="start" value="${esc(x.start)}" required>`)}
        ${field('Koniec', `<input type="time" name="end" value="${esc(x.end)}" required>`)}
      </div>
      ${field('Sala', `<input name="room" value="${esc(x.room)}" maxlength="40">`)}
      ${field('Prowadzący', `<input name="teacher" value="${esc(x.teacher || '')}" maxlength="80">`)}
      ${field('Notatka', `<input name="note" value="${esc(x.note || '')}" maxlength="200">`)}
      ${c ? '' : `<div class="row2">
        ${field('Powtarzaj', `<select name="repeat">${options([['none', 'Jednorazowo'], ['weekly', 'Co tydzień']], 'none')}</select>`)}
        ${field('Do dnia', `<input type="date" name="until" value="${addDaysISO(x.date, 84)}">`)}
      </div>`}
      ${modalButtons(c ? `<button type="button" class="btn danger" data-action="deleteClass" data-id="${esc(c.id)}">Usuń</button>${c.seriesId ? `<button type="button" class="btn danger" data-action="deleteSeries" data-id="${esc(c.seriesId)}">Usuń serię</button>` : ''}` : '')}
    </form>`);
}

forms.classForm = (f) => {
  const mode = f.get('mode');
  const start = f.get('start'), end = f.get('end');
  if (end <= start) return toast('Koniec musi być po początku zajęć.');

  if (mode === 'override') {
    const id = f.get('id');
    const orig = allClasses().find((c) => c.id === id).orig;
    const o = { status: f.get('status'), start, end, room: f.get('room').trim(), note: f.get('note').trim() };
    const same = o.status === 'ok' && o.start === orig.start && o.end === orig.end && o.room === orig.room && !o.note;
    if (same) delete S.overrides[id]; else S.overrides[id] = o;
    // Zmiana sali/godziny bez wskazania statusu oznaczamy automatycznie jako "Zmiana"
    if (o.status === 'ok' && (o.room !== orig.room || o.start !== orig.start || o.end !== orig.end)) S.overrides[id].status = 'moved';
  } else {
    const data = {
      short: f.get('short'), type: f.get('type'), date: f.get('date'), start, end,
      room: f.get('room').trim(), teacher: f.get('teacher').trim(), note: f.get('note').trim(),
    };
    if (mode === 'custom-edit') {
      Object.assign(S.customClasses.find((c) => c.id === f.get('id')), data);
    } else if (f.get('repeat') === 'weekly') {
      const until = f.get('until');
      if (!until || until < data.date) return toast('Podaj datę końca powtarzania.');
      const seriesId = uid();
      for (let d = data.date; d <= until; d = addDaysISO(d, 7)) S.customClasses.push({ ...data, date: d, id: uid(), seriesId });
    } else {
      S.customClasses.push({ ...data, id: uid() });
    }
  }
  save(); closeModal(); rerender();
};

actions.resetClass = (el) => { delete S.overrides[el.dataset.id]; save(); closeModal(); rerender(); toast('Przywrócono dane z PDF'); };
actions.deleteClass = (el) => {
  if (!confirm('Usunąć te zajęcia?')) return;
  S.customClasses = S.customClasses.filter((c) => c.id !== el.dataset.id);
  save(); closeModal(); rerender();
};
actions.deleteSeries = (el) => {
  if (!confirm('Usunąć wszystkie zajęcia z tej serii?')) return;
  S.customClasses = S.customClasses.filter((c) => c.seriesId !== el.dataset.id);
  save(); closeModal(); rerender();
};
