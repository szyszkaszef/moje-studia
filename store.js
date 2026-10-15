// ===== Wszystkie Twoje dane w jednym miejscu =====
// Zapisują się w przeglądarce (localStorage). W kroku z Supabase przeniesiemy je do chmury.

const KEY = 'studia.v2';

const defaults = () => ({
  v: 2,
  settings: {
    theme: 'auto',          // auto | light | dark
    accent: '#4f46e5',
    density: 'comfortable', // comfortable | compact
    showTeacher: true,
    notebook: 'dark',       // dark = ciemna tablica | paper = jasny papier
    pomoWork: 25,
    pomoBreak: 5,
  },
  subjects: [],      // {short, name, color, ects, passed, notes, fromSchedule}
  overrides: {},     // zmiany w zajęciach z PDF: { idZajęć: {status, room, start, end, note} }
  customClasses: [], // własne zajęcia dodane przez Ciebie
  tasks: [],
  notes: [],         // {id, short, title, text, attachments:[{id,name,type,size}], created, updated}
  grades: [],        // {id, short, name, value, weight, date}
  studyLog: [],      // {id, date, short, minutes}
  timer: { mode: 'work', running: false, endAt: 0, left: 25 * 60, short: '' },
  ui: { tab: 'today', scheduleView: 'week', filter: '', taskTab: 'todo', taskSubject: '', taskSort: 'due', learnTab: 'subjects', noteSubject: '', navOpen: { learn: false, notes: true }, navCollapsed: false, collapsed: {}, noteCols: 'auto', noteMode: 'read' },
});

export const normTask = (t) => ({
  type: 'zadanie', time: '', priority: 'normal', repeat: 'none', notes: '', subtasks: [], doneCount: 0, ...t,
});

function merge(base, saved) {
  return {
    ...base, ...saved,
    settings: { ...base.settings, ...saved.settings },
    ui: { ...base.ui, ...saved.ui },
    timer: { ...base.timer, ...saved.timer },
    tasks: (saved.tasks || []).map(normTask),
  };
}

function load() {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return merge(d, JSON.parse(raw));
  } catch {}
  // Migracja zadań z pierwszego prototypu
  try { d.tasks = JSON.parse(localStorage.getItem('tasks') || '[]').map(normTask); } catch {}
  return d;
}

export const S = load();

export function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {}
}

export function replaceState(obj) {
  const next = merge(defaults(), obj);
  for (const k of Object.keys(S)) delete S[k];
  Object.assign(S, next);
  save();
}

export function wipeAll() {
  try { localStorage.removeItem(KEY); localStorage.removeItem('tasks'); } catch {}
}
