// @ts-nocheck
// ===== Funkcja "push": przypomnienia o zajęciach i terminach (Supabase Edge Function) =====
// Uruchamia ją co minutę harmonogram w bazie (pg_cron, patrz supabase/push.sql). Dla każdego użytkownika:
//   1. liczy, które przypomnienia mają właśnie nadejść (zajęcia, zadania, kolokwia),
//   2. wysyła powiadomienia na jego urządzenia zapisane w tabeli push_subscriptions,
//   3. zapisuje wysłane przypomnienia w push_sent, żeby nie wysyłać ich dwa razy.
// Dodatkowo: GET zwraca publiczny klucz VAPID dla aplikacji, a POST ?run=test wysyła próbne powiadomienie.
// Klucze VAPID i sekret harmonogramu trzyma tabela push_config (funkcja tworzy klucze przy pierwszym użyciu).

const TZ = 'Europe/Warsaw';
const SITE = 'https://moje-studia.vercel.app';

// ---------- Twoje zasady przypomnień ----------
export const RULES = {
  classMinutesBefore: 30,          // zajęcia: 30 minut przed
  taskHoursBefore: [24, 5],        // zadania: dzień wcześniej i 5 godzin wcześniej
  examDaysBefore: [7, 3, 1],       // kolokwia i egzaminy: tydzień, 3 dni i dzień przed
  examHour: '08:00',               // o której godzinie przychodzą przypomnienia o kolokwiach
  dateOnlyDayBefore: '18:00',      // zadanie bez godziny: "dzień wcześniej" przychodzi o 18:00 dnia poprzedniego
  dateOnlyDeadline: '23:59',       // zadanie bez godziny: termin liczony do końca dnia
  graceMinutes: 15,                // spóźnione uruchomienie harmonogramu nadrabia do 15 minut wstecz
};

// ---------- Czas lokalny (Polska, z czasem letnim) ----------
const pad = (n) => String(n).padStart(2, '0');
function tzOffsetMs(utcMs) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const g = (t) => Number(parts.find((p) => p.type === t).value);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - utcMs;
}
// "2026-10-20" + "11:30" (czas polski) -> moment w milisekundach UTC
export function localToMs(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm);
  let t = naive - tzOffsetMs(naive);
  t = naive - tzOffsetMs(t);
  return t;
}
function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
}
const dm = (date) => { const [, m, d] = date.split('-'); return `${Number(d)}.${m}`; };

// ---------- Liczenie przypomnień (czysta logika, testowana osobno) ----------
export function buildClasses(schedule, data) {
  const names = Object.fromEntries((data.subjects || []).map((s) => [s.short, s.name]));
  const overrides = data.overrides || {};
  const base = schedule.map((c) => {
    const o = overrides[c.id] || {};
    return { ...c, ...o, status: o.status || 'ok', subject: names[c.short] || c.subject };
  });
  const own = (data.customClasses || []).map((c) => ({ status: 'ok', ...c, subject: names[c.short] || c.short }));
  return [...base, ...own];
}

// Zwraca przypomnienia, które powinny nadejść teraz (w oknie od "teraz - grace" do "teraz")
export function computeReminders(nowMs, schedule, data) {
  const out = [];
  const add = (key, fireMs, title, body) => {
    if (fireMs <= nowMs && fireMs > nowMs - RULES.graceMinutes * 60000) out.push({ key, fireMs, title, body, tag: key, url: '/' });
  };

  for (const c of buildClasses(schedule, data)) {
    if (c.status === 'cancelled' || !c.date || !c.start) continue;
    const start = localToMs(c.date, c.start);
    add(`c:${c.id}:${c.date}:${c.start}`, start - RULES.classMinutesBefore * 60000,
      `${c.subject} za ${RULES.classMinutesBefore} min`,
      [c.type, c.start, c.room ? `sala ${c.room}` : ''].filter(Boolean).join(' · '));
  }

  for (const t of data.tasks || []) {
    if (t.done || !t.due) continue;
    const exam = t.type === 'kolokwium' || t.type === 'egzamin';
    const when = `${dm(t.due)}${t.time ? ` o ${t.time}` : ''}`;
    if (exam) {
      const label = t.type === 'egzamin' ? 'Egzamin' : 'Kolokwium';
      for (const n of RULES.examDaysBefore) {
        add(`x:${t.id}:${t.due}:${t.time || ''}:${n}d`, localToMs(addDays(t.due, -n), RULES.examHour),
          `${label}: ${t.title}`, `Za ${n} ${n === 1 ? 'dzień' : 'dni'} (${when})`);
      }
      continue;
    }
    const deadline = localToMs(t.due, t.time || RULES.dateOnlyDeadline);
    const [dayBefore, hoursBefore] = RULES.taskHoursBefore;
    // dzień wcześniej: dla zadania z godziną dokładnie 24 h przed, dla zadania bez godziny o 18:00 poprzedniego dnia
    add(`t:${t.id}:${t.due}:${t.time || ''}:${dayBefore}h`,
      t.time ? deadline - dayBefore * 3600000 : localToMs(addDays(t.due, -1), RULES.dateOnlyDayBefore),
      `Zadanie: ${t.title}`, `Termin jutro (${when})`);
    // 5 godzin przed terminem (zadanie bez godziny: termin = koniec dnia, więc przypomnienie ok. 19:00)
    add(`t:${t.id}:${t.due}:${t.time || ''}:${hoursBefore}h`, deadline - hoursBefore * 3600000,
      `Zadanie: ${t.title}`, `Termin za ${hoursBefore} godzin (${when})`);
  }
  return out;
}

// ---------- Poniżej tylko środowisko Supabase (nie uruchamia się w testach) ----------
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const env = (k) => Deno.env.get(k);

let scheduleCache = { at: 0, data: [] };
async function getSchedule() {
  if (Date.now() - scheduleCache.at < 3600000 && scheduleCache.data.length) return scheduleCache.data;
  const r = await fetch(env('SCHEDULE_URL') || `${SITE}/schedule.json`);
  if (!r.ok) throw new Error(`schedule.json: HTTP ${r.status}`);
  scheduleCache = { at: Date.now(), data: await r.json() };
  return scheduleCache.data;
}

async function getAdmin() {
  const { createClient } = await import('npm:@supabase/supabase-js@2');
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
}

// Klucze VAPID powstają raz i zostają w bazie (prywatny nie opuszcza Supabase)
async function loadConfig(admin) {
  const webpush = (await import('npm:web-push@3.6.7')).default;
  let { data, error } = await admin.from('push_config').select('*').eq('id', 1).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Brak wiersza push_config: uruchom supabase/push.sql');
  if (!data.vapid_public || !data.vapid_private) {
    const keys = webpush.generateVAPIDKeys();
    const up = await admin.from('push_config').update({ vapid_public: keys.publicKey, vapid_private: keys.privateKey }).eq('id', 1).select('*').single();
    if (up.error) throw up.error;
    data = up.data;
  }
  webpush.setVapidDetails(SITE, data.vapid_public, data.vapid_private);
  return { cfg: data, webpush };
}

async function sendToAll(webpush, admin, subs, payload) {
  let sent = 0;
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint); // urządzenie wypisane
      else console.error('push error', e.statusCode, e.body || e.message);
    }
  }
  return sent;
}

async function runReminders(admin, webpush) {
  const schedule = await getSchedule();
  const { data: rows, error } = await admin.from('user_state').select('user_id,data');
  if (error) throw error;
  const result = { users: rows.length, due: 0, sent: 0 };
  for (const row of rows) {
    const reminders = computeReminders(Date.now(), schedule, row.data || {});
    if (!reminders.length) continue;
    const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', row.user_id);
    if (!subs?.length) continue;
    for (const r of reminders) {
      // najpierw zapis w push_sent: jeśli już tam jest, ktoś wysłał to przypomnienie wcześniej
      const ins = await admin.from('push_sent').insert({ user_id: row.user_id, key: r.key });
      if (ins.error) { if (ins.error.code !== '23505') console.error('push_sent', ins.error); continue; }
      result.due++;
      result.sent += await sendToAll(webpush, admin, subs, { title: r.title, body: r.body, tag: r.tag, url: r.url });
    }
  }
  if (Math.random() < 0.01) await admin.from('push_sent').delete().lt('sent_at', new Date(Date.now() - 30 * 86400000).toISOString());
  return result;
}

async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const url = new URL(req.url);
    const admin = await getAdmin();
    const { cfg, webpush } = await loadConfig(admin);

    if (req.method === 'GET') return json({ publicKey: cfg.vapid_public });

    const run = url.searchParams.get('run');
    if (run === 'reminders') {
      if (req.headers.get('x-cron-secret') !== cfg.cron_secret) return json({ error: 'forbidden' }, 403);
      return json(await runReminders(admin, webpush));
    }
    if (run === 'test') { // próbne powiadomienie dla zalogowanego użytkownika
      const token = (req.headers.get('authorization') || '').replace(/^Bearer /i, '');
      const { data: u, error } = await admin.auth.getUser(token);
      if (error || !u?.user) return json({ error: 'unauthorized' }, 401);
      const { data: subs } = await admin.from('push_subscriptions').select('*').eq('user_id', u.user.id);
      if (!subs?.length) return json({ sent: 0, note: 'Brak włączonych urządzeń' });
      const sent = await sendToAll(webpush, admin, subs, { title: 'Moje Studia', body: 'Powiadomienia działają ✔', tag: 'test', url: '/' });
      return json({ sent, devices: subs.length });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String(e?.message || e) }, 500);
  }
}

if (typeof Deno !== 'undefined' && Deno.serve) Deno.serve(handler);
