// ===== Logika danych: grafik + Twoje zmiany, przedmioty, zadania, oceny =====
import { S, save } from './store.js';
import { todayISO, nowTime, daysBetween, addDaysISO, fromISO, toISO, fmtDM, prettyDate } from './util.js';

export const TYPES = {
  zadanie: 'Zadanie', sprawozdanie: 'Sprawozdanie', projekt: 'Projekt',
  kolokwium: 'Kolokwium', egzamin: 'Egzamin', inne: 'Inne',
};
export const CLASS_TYPES = ['Wykład', 'Ćwiczenia', 'Laboratorium', 'Projekt', 'Seminarium', 'Konsultacje', 'Inne'];
export const isExam = (t) => t.type === 'kolokwium' || t.type === 'egzamin';

const PALETTE = ['#4f46e5', '#0891b2', '#ea580c', '#16a34a', '#db2777', '#7c3aed', '#ca8a04', '#64748b', '#dc2626', '#0d9488'];
const DEFAULT_COLORS = {
  MatI: '#4f46e5', ChO: '#0891b2', Met: '#ea580c', PI: '#16a34a',
  ZKiGI: '#db2777', PBCAD: '#7c3aed', PEiBHP: '#ca8a04', OWI: '#64748b',
};

// ---------- Grafik z PDF ----------
let schedule = [];
export const setSchedule = (data) => { schedule = data; };

export function initSubjects() {
  const seen = new Map();
  for (const c of schedule) if (!seen.has(c.short)) seen.set(c.short, c.subject);
  let i = S.subjects.length;
  for (const [short, name] of seen) {
    if (S.subjects.some((s) => s.short === short)) continue;
    S.subjects.push({
      short, name, color: DEFAULT_COLORS[short] || PALETTE[i++ % PALETTE.length],
      ects: 0, passed: false, notes: '', fromSchedule: true,
    });
  }
  save();
}

export const subjectOf = (short) => S.subjects.find((s) => s.short === short);
export const colorOf = (short) => subjectOf(short)?.color || '#94a3b8';
export const nameOf = (short) => subjectOf(short)?.name || short || '';
export const nextColor = () => PALETTE[S.subjects.length % PALETTE.length];

const byDateTime = (a, b) => (a.date + a.start).localeCompare(b.date + b.start);

// Wszystkie zajęcia: z PDF (z Twoimi poprawkami) + własne
export function allClasses() {
  const base = schedule.map((c) => {
    const o = S.overrides[c.id] || {};
    return { ...c, ...o, status: o.status || 'ok', custom: false, orig: c, hasOverride: !!S.overrides[c.id], subject: nameOf(c.short) || c.subject };
  });
  const own = S.customClasses.map((c) => ({ status: 'ok', teacher: '', ...c, custom: true, subject: nameOf(c.short) }));
  return [...base, ...own].sort(byDateTime);
}

export const classesOn = (list, iso) => list.filter((c) => c.date === iso);

export function classProgress(short) {
  const mine = allClasses().filter((c) => c.short === short && c.status !== 'cancelled');
  const td = todayISO(), t = nowTime();
  const done = mine.filter((c) => c.date < td || (c.date === td && c.end <= t)).length;
  return { done, total: mine.length };
}

// ---------- Zadania ----------
export function dueLabel(t) {
  const td = todayISO();
  const diff = daysBetween(td, t.due);
  const time = t.time ? ` ${t.time}` : '';
  if (t.done) return { text: 'Zrobione', cls: '' };
  if (diff < 0) return { text: `Po terminie (${-diff} dni)`, cls: 'late' };
  if (diff === 0) return { text: `Dziś${time}!`, cls: 'soon' };
  if (diff === 1) return { text: `Jutro${time}`, cls: 'soon' };
  return { text: `Za ${diff} dni · ${prettyDate(fromISO(t.due))}${time}`, cls: diff <= 3 ? 'soon' : '' };
}

function advance(iso, repeat) {
  if (repeat === 'weekly') return addDaysISO(iso, 7);
  if (repeat === 'biweekly') return addDaysISO(iso, 14);
  const d = fromISO(iso); d.setMonth(d.getMonth() + 1); return toISO(d);
}

// Odhaczanie. Zadanie powtarzalne zamiast "zniknąć" przesuwa się na następny termin.
export function toggleTask(t) {
  if (!t.done && t.repeat && t.repeat !== 'none') {
    const td = todayISO();
    let next = advance(t.due, t.repeat);
    while (next < td) next = advance(next, t.repeat);
    t.doneCount = (t.doneCount || 0) + 1;
    t.due = next;
    t.subtasks.forEach((s) => { s.done = false; });
    return `Następny termin: ${fmtDM(next)}`;
  }
  t.done = !t.done;
  return null;
}

// ---------- Oceny ----------
export function subjectAvg(short) {
  const g = S.grades.filter((x) => x.short === short);
  const w = g.reduce((a, x) => a + x.weight, 0);
  return w ? g.reduce((a, x) => a + x.value * x.weight, 0) / w : null;
}

// Średnia ze wszystkich przedmiotów, ważona punktami ECTS (jeśli ich nie podasz, wszystkie liczą się tak samo)
export function overallAvg() {
  let sum = 0, w = 0;
  for (const s of S.subjects) {
    const a = subjectAvg(s.short);
    if (a === null) continue;
    const weight = s.ects > 0 ? s.ects : 1;
    sum += a * weight; w += weight;
  }
  return w ? sum / w : null;
}

// ---------- Czas nauki ----------
export function studyMinutes(from, to, short) {
  return S.studyLog
    .filter((x) => x.date >= from && x.date <= to && (!short || x.short === short))
    .reduce((a, x) => a + x.minutes, 0);
}
export const fmtMin = (m) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`);
