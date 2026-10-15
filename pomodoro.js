// ===== Licznik nauki (pomodoro) =====
import { S, save } from './store.js';
import { esc, todayISO, addDaysISO, mondayOf, toISO, uid, pad } from './util.js';
import { subjectOf, studyMinutes, fmtMin } from './data.js';
import { actions, changes, rerender, toast, options, progressBar } from './ui.js';

const T = () => S.timer;
export const secondsLeft = () => (T().running ? Math.max(0, Math.ceil((T().endAt - Date.now()) / 1000)) : T().left);
const fmt = (s) => `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((delay) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; g.gain.value = 0.15;
      o.start(ctx.currentTime + delay); o.stop(ctx.currentTime + delay + 0.18);
    });
  } catch {}
  try { navigator.vibrate?.([200, 100, 200]); } catch {}
}

function finish() {
  const t = T();
  if (t.mode === 'work') {
    S.studyLog.push({ id: uid(), date: todayISO(), short: t.short, minutes: S.settings.pomoWork });
    t.mode = 'break'; t.left = S.settings.pomoBreak * 60;
  } else {
    t.mode = 'work'; t.left = S.settings.pomoWork * 60;
  }
  t.running = false;
  save(); beep();
  const msg = t.mode === 'break' ? 'Koniec nauki, czas na przerwę! ☕' : 'Koniec przerwy, wracamy do nauki 📚';
  try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Moje Studia', { body: msg }); } catch {}
  toast(msg);
  rerender();
}

// Wywoływane co sekundę z app.js
export function tick() {
  const t = T();
  const clock = document.getElementById('clock');
  const left = secondsLeft();
  if (clock) clock.textContent = fmt(left);
  document.title = t.running ? `${t.mode === 'work' ? '📚' : '☕'} ${fmt(left)} · Moje Studia` : 'Moje Studia';
  if (t.running && left <= 0) finish();
}

actions.pomoStart = () => {
  const t = T();
  if ('Notification' in window && Notification.permission === 'default') { try { Notification.requestPermission(); } catch {} }
  t.endAt = Date.now() + t.left * 1000; t.running = true;
  save(); rerender();
};
actions.pomoPause = () => { const t = T(); t.left = secondsLeft(); t.running = false; save(); rerender(); };
actions.pomoReset = () => { const t = T(); t.mode = 'work'; t.running = false; t.left = S.settings.pomoWork * 60; save(); rerender(); };
actions.pomoSkip = () => {
  const t = T();
  t.mode = t.mode === 'work' ? 'break' : 'work';
  t.running = false; t.left = (t.mode === 'work' ? S.settings.pomoWork : S.settings.pomoBreak) * 60;
  save(); rerender();
};
changes.pomoSubject = (el) => { T().short = el.value; save(); };
changes.pomoMinutes = (el) => {
  const v = Math.max(1, Math.min(180, Number(el.value) || 1));
  S.settings[el.dataset.key] = v;
  if (!T().running) T().left = (T().mode === 'work' ? S.settings.pomoWork : S.settings.pomoBreak) * 60;
  save(); rerender();
};

export function renderPomodoro() {
  const t = T();
  const td = todayISO();
  const mon = toISO(mondayOf(new Date()));
  const perSubject = S.subjects
    .map((s) => ({ s, m: studyMinutes(mon, addDaysISO(mon, 6), s.short) }))
    .filter((x) => x.m > 0).sort((a, b) => b.m - a.m);
  const unassigned = studyMinutes(mon, addDaysISO(mon, 6), '');
  const weekTotal = studyMinutes(mon, addDaysISO(mon, 6));
  const max = Math.max(1, ...perSubject.map((x) => x.m), unassigned);
  return `
    <div class="pomo ${t.mode}">
      <div class="mode">${t.mode === 'work' ? '📚 Nauka' : '☕ Przerwa'}</div>
      <div class="clock" id="clock">${fmt(secondsLeft())}</div>
      <select data-change="pomoSubject" aria-label="Przedmiot">${options([['', 'Przedmiot (opcjonalnie)'], ...S.subjects.map((s) => [s.short, s.name])], t.short)}</select>
      <div class="pomo-btns">
        ${t.running ? '<button class="btn" data-action="pomoPause">⏸ Pauza</button>' : '<button class="btn primary" data-action="pomoStart">▶ Start</button>'}
        <button class="btn" data-action="pomoSkip">⏭ Pomiń</button>
        <button class="btn" data-action="pomoReset">↺ Reset</button>
      </div>
    </div>
    <div class="row2 pomo-set">
      <label class="field"><span>Nauka (min)</span><input type="number" min="1" max="180" value="${S.settings.pomoWork}" data-change="pomoMinutes" data-key="pomoWork"></label>
      <label class="field"><span>Przerwa (min)</span><input type="number" min="1" max="60" value="${S.settings.pomoBreak}" data-change="pomoMinutes" data-key="pomoBreak"></label>
    </div>
    <h2>Czas nauki</h2>
    <div class="stats">
      <div class="stat"><strong>${fmtMin(studyMinutes(td, td))}</strong><small>dziś</small></div>
      <div class="stat"><strong>${fmtMin(weekTotal)}</strong><small>w tym tygodniu</small></div>
    </div>
    ${perSubject.map((x) => `<div class="stat-row"><span>${esc(x.s.name)}</span><small>${fmtMin(x.m)}</small>${progressBar(x.m / max * 100, x.s.color)}</div>`).join('')}
    ${unassigned ? `<div class="stat-row"><span>Bez przedmiotu</span><small>${fmtMin(unassigned)}</small>${progressBar(unassigned / max * 100, 'var(--muted)')}</div>` : ''}
    ${weekTotal ? '' : '<p class="muted">Po pierwszej ukończonej sesji pojawią się tu statystyki.</p>'}`;
}
