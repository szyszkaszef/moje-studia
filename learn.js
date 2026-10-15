// ===== Zakładka Nauka: przedmioty (notatki, postęp), oceny, pomodoro =====
import { S, save } from './store.js';
import { esc, todayISO, daysBetween, fromISO, uid, fmtDM } from './util.js';
import {
  allClasses, classProgress, subjectAvg, overallAvg, subjectOf, nextColor,
} from './data.js';
import { actions, forms, rerender, openModal, closeModal, toast, field, options, segmented, modalButtons, progressBar } from './ui.js';
import { renderPomodoro } from './pomodoro.js';
import { noteCount, noteFileIds } from './notes.js';
import { delFile } from './files.js';

export function renderLearn() {
  const tab = S.ui.learnTab;
  const body = tab === 'subjects' ? renderSubjects() : tab === 'grades' ? renderGrades() : renderPomodoro();
  return `<div class="toolbar">${segmented('learnTab', [['subjects', 'Przedmioty'], ['grades', 'Oceny'], ['pomodoro', 'Pomodoro']], tab)}</div>${body}`;
}
actions.learnTab = (el) => { S.ui.learnTab = el.dataset.v; save(); rerender(); };

// ---------- Przedmioty ----------
function semesterCard() {
  const cls = allClasses().filter((c) => c.status !== 'cancelled');
  if (!cls.length) return '';
  const start = cls[0].date, end = cls[cls.length - 1].date, td = todayISO();
  const total = Math.max(1, daysBetween(start, end));
  const pct = Math.round(Math.min(1, Math.max(0, daysBetween(start, td) / total)) * 100);
  const left = daysBetween(td, end);
  const doneTasks = S.tasks.filter((t) => t.done).length;
  return `<div class="hero">
    <small>Semestr: ${fmtDM(start)} – ${fmtDM(end)}</small>
    <div class="big">${pct}% za nami</div>
    <div class="bar light"><i style="width:${pct}%"></i></div>
    <small>${left > 0 ? `Zostało ${left} dni zajęć` : 'Zajęcia zakończone'} · zrobione zadania: ${doneTasks}/${S.tasks.length}</small>
  </div>`;
}

function renderSubjects() {
  const cards = S.subjects.map((s) => {
    const p = classProgress(s.short);
    const avg = subjectAvg(s.short);
    const open = S.tasks.filter((t) => !t.done && t.subject === s.short).length;
    return `<div class="card subj ${s.passed ? 'passed' : ''}" role="button" tabindex="0" data-action="editSubject" data-id="${esc(s.short)}" style="--c:${s.color}">
      <div class="subj-head"><strong>${esc(s.name)}</strong>${s.passed ? '<span class="badge ok">✔ Zaliczony</span>' : ''}</div>
      ${progressBar(p.total ? p.done / p.total * 100 : 0, s.color)}
      <small class="muted">Zajęcia: ${p.done}/${p.total}${s.ects ? ` · ${s.ects} ECTS` : ''} · otwarte zadania: ${open}${avg !== null ? ` · średnia ${avg.toFixed(2)}` : ''}</small>
      <div class="notepeek">📝 Notatki: ${noteCount(s.short)}</div>
    </div>`;
  }).join('');
  return `${semesterCard()}
    <div class="toolbar"><h2>Moje przedmioty</h2><button class="btn primary" data-action="newSubject">＋ Przedmiot</button></div>
    ${cards || '<p class="muted">Brak przedmiotów.</p>'}`;
}

actions.newSubject = () => openSubjectDialog(null);
actions.editSubject = (el) => openSubjectDialog(subjectOf(el.dataset.id));

function openSubjectDialog(s) {
  const x = s || { short: '', name: '', color: nextColor(), ects: 0, passed: false };
  openModal(`
    <form data-form="subjectForm" class="modal-form">
      <input type="hidden" name="orig" value="${esc(s?.short || '')}">
      <h3>${s ? 'Edytuj przedmiot' : 'Nowy przedmiot'}</h3>
      ${field('Nazwa', `<input name="name" value="${esc(x.name)}" required maxlength="100">`)}
      <div class="row2">
        ${field('Skrót', `<input name="short" value="${esc(x.short)}" required maxlength="12" ${s?.fromSchedule ? 'readonly' : ''}>`)}
        ${field('Punkty ECTS', `<input type="number" name="ects" min="0" max="30" step="0.5" value="${x.ects}">`)}
      </div>
      <div class="row2">
        ${field('Kolor', `<input type="color" name="color" value="${esc(x.color)}">`)}
        <label class="field check"><input type="checkbox" name="passed" ${x.passed ? 'checked' : ''}><span>Zaliczony</span></label>
      </div>
      <p class="muted">Notatki i pliki do przedmiotu znajdziesz w menu po prawej: Notatki.</p>
      ${modalButtons(s && !s.fromSchedule ? `<button type="button" class="btn danger" data-action="deleteSubject" data-id="${esc(s.short)}">Usuń</button>` : '')}
    </form>`);
}

forms.subjectForm = (f) => {
  const orig = f.get('orig');
  const data = {
    name: f.get('name').trim(), short: f.get('short').trim(), color: f.get('color'),
    ects: Number(f.get('ects')) || 0, passed: f.get('passed') === 'on',
  };
  if (!data.name || !data.short) return toast('Podaj nazwę i skrót.');
  if (!orig && S.subjects.some((x) => x.short === data.short)) return toast('Taki skrót już istnieje.');
  if (orig) Object.assign(subjectOf(orig), data);
  else S.subjects.push({ ...data, fromSchedule: false });
  save(); closeModal(); rerender();
};

actions.deleteSubject = async (el) => {
  const short = el.dataset.id;
  if (!confirm('Usunąć przedmiot razem z jego własnymi zajęciami, ocenami, notatkami i plikami? Zadania zostaną bez przedmiotu.')) return;
  for (const n of S.notes.filter((x) => x.short === short)) for (const id of noteFileIds(n)) await delFile(id).catch(() => {});
  S.notes = S.notes.filter((n) => n.short !== short);
  S.subjects = S.subjects.filter((s) => s.short !== short);
  S.customClasses = S.customClasses.filter((c) => c.short !== short);
  S.grades = S.grades.filter((g) => g.short !== short);
  S.tasks.forEach((t) => { if (t.subject === short) t.subject = ''; });
  save(); closeModal(); rerender();
};

// ---------- Oceny ----------
function renderGrades() {
  const overall = overallAvg();
  const groups = S.subjects.map((s) => ({ s, g: S.grades.filter((x) => x.short === s.short).sort((a, b) => a.date.localeCompare(b.date)) })).filter((x) => x.g.length);
  return `
    <div class="hero">
      <small>Średnia ważona${S.subjects.some((s) => s.ects > 0) ? ' (wagi: ECTS)' : ''}</small>
      <div class="big">${overall !== null ? overall.toFixed(2) : '—'}</div>
      <small>${S.grades.length} ocen w ${groups.length} przedmiotach</small>
    </div>
    <div class="toolbar"><h2>Oceny</h2><button class="btn primary" data-action="newGrade">＋ Ocena</button></div>
    ${groups.map(({ s, g }) => `
      <div class="card" style="--c:${s.color}">
        <div class="subj-head"><strong>${esc(s.name)}</strong><span class="badge">śr. ${subjectAvg(s.short).toFixed(2)}</span></div>
        ${g.map((x) => `<div class="grade" role="button" tabindex="0" data-action="editGrade" data-id="${esc(x.id)}">
          <span class="gval">${x.value}</span><span class="gname">${esc(x.name || 'Ocena')}</span>
          <small class="muted">waga ${x.weight} · ${fmtDM(x.date)}</small></div>`).join('')}
      </div>`).join('') || '<p class="muted">Nie dodano jeszcze ocen.</p>'}`;
}

actions.newGrade = () => openGradeDialog(null);
actions.editGrade = (el) => openGradeDialog(S.grades.find((g) => g.id === el.dataset.id));

function openGradeDialog(g) {
  const x = g || { short: S.subjects[0]?.short || '', name: '', value: 4, weight: 1, date: todayISO() };
  openModal(`
    <form data-form="gradeForm" class="modal-form">
      <input type="hidden" name="id" value="${esc(g?.id || '')}">
      <h3>${g ? 'Edytuj ocenę' : 'Nowa ocena'}</h3>
      ${field('Przedmiot', `<select name="short" required>${options(S.subjects.map((s) => [s.short, s.name]), x.short)}</select>`)}
      ${field('Za co', `<input name="name" value="${esc(x.name)}" maxlength="80" placeholder="np. Kolokwium 1">`)}
      <div class="row2">
        ${field('Ocena', `<input type="number" name="value" min="1" max="100" step="0.5" value="${x.value}" required>`)}
        ${field('Waga', `<input type="number" name="weight" min="0.1" max="100" step="0.1" value="${x.weight}" required>`)}
      </div>
      ${field('Data', `<input type="date" name="date" value="${esc(x.date)}" required>`)}
      ${modalButtons(g ? `<button type="button" class="btn danger" data-action="deleteGrade" data-id="${esc(g.id)}">Usuń</button>` : '')}
    </form>`);
}

forms.gradeForm = (f) => {
  const data = { short: f.get('short'), name: f.get('name').trim(), value: Number(f.get('value')), weight: Number(f.get('weight')) || 1, date: f.get('date') };
  if (!data.short) return toast('Najpierw dodaj przedmiot.');
  const id = f.get('id');
  if (id) Object.assign(S.grades.find((x) => x.id === id), data);
  else S.grades.push({ id: uid(), ...data });
  save(); closeModal(); rerender();
};
actions.deleteGrade = (el) => {
  if (!confirm('Usunąć tę ocenę?')) return;
  S.grades = S.grades.filter((x) => x.id !== el.dataset.id);
  save(); closeModal(); rerender();
};
