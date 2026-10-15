// ===== Powiadomienia push: włączanie na tym urządzeniu =====
// Serwer (funkcja "push" w Supabase) co minutę sprawdza grafik i zadania i wysyła przypomnienia
// na wszystkie urządzenia zapisane w tabeli push_subscriptions. Ten plik zapisuje i usuwa to urządzenie.
import { SUPABASE_URL, SUPABASE_KEY } from './supabase-config.js';
import { getClient, getUser, syncConfigured } from './sync.js';
import { actions, toast } from './ui.js';
import { esc } from './util.js';

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const FN = `${SUPABASE_URL}/functions/v1/push`;

const b64ToBytes = (b64) => {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};

async function currentSub() {
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

const RULES_HTML = `<ul class="rules">
  <li><strong>Zajęcia:</strong> 30 minut przed</li>
  <li><strong>Zadania:</strong> dzień wcześniej i 5 godzin przed terminem (bez godziny: o 18:00 dzień wcześniej i ok. 19:00 w dniu terminu)</li>
  <li><strong>Kolokwia i egzaminy:</strong> 7 dni, 3 dni i 1 dzień przed, o 8:00</li></ul>`;

// Karta w Ustawieniach (zawartość uzupełnia hydratePush, bo stan urządzenia sprawdzamy asynchronicznie)
export function renderPushCard() {
  return '<div class="card" id="push-card"><p class="muted">Sprawdzanie…</p></div>';
}

export async function hydratePush() {
  const box = document.getElementById('push-card');
  if (!box) return;
  const html = async () => {
    if (!syncConfigured) return '<p class="muted">Najpierw skonfiguruj synchronizację.</p>';
    if (!getUser()) return '<p class="muted">Zaloguj się powyżej, żeby włączyć powiadomienia na tym urządzeniu.</p>';
    if (!supported()) {
      return isIos && !standalone()
        ? '<p>Na iPhonie powiadomienia działają tylko w aplikacji dodanej do ekranu początkowego. W Safari kliknij <strong>Udostępnij → Do ekranu początkowego</strong>, otwórz aplikację z ikony i wróć tutaj.</p>'
        : '<p class="muted">Ta przeglądarka nie obsługuje powiadomień push.</p>';
    }
    if (Notification.permission === 'denied') {
      return '<p>Powiadomienia są zablokowane dla tej aplikacji. Odblokuj je w ustawieniach urządzenia (iPhone: Ustawienia → Powiadomienia → Studia; komputer: ikona kłódki przy adresie → Powiadomienia), a potem odśwież stronę.</p>';
    }
    const sub = await currentSub();
    if (sub) {
      return `<p>✅ Powiadomienia są <strong>włączone na tym urządzeniu</strong>.</p>${RULES_HTML}
        <div class="btn-row"><button class="btn" data-action="pushTest">🔔 Wyślij testowe powiadomienie</button>
        <button class="btn" data-action="pushDisable">Wyłącz na tym urządzeniu</button></div>`;
    }
    return `<p class="muted">Przypomnienia przyjdą także przy zamkniętej aplikacji.</p>${RULES_HTML}
      <div class="btn-row"><button class="btn primary" data-action="pushEnable">🔔 Włącz powiadomienia na tym urządzeniu</button></div>`;
  };
  try { box.innerHTML = await html(); } catch (e) { box.innerHTML = `<p class="muted">Nie udało się sprawdzić stanu: ${esc(e.message)}</p>`; }
}

async function fetchPublicKey() {
  const r = await fetch(FN, { headers: { apikey: SUPABASE_KEY } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.publicKey) throw new Error(j.error || `serwer powiadomień nie odpowiada (HTTP ${r.status})`);
  return j.publicKey;
}

actions.pushEnable = async () => {
  const sb = getClient(), user = getUser();
  if (!sb || !user) return toast('Najpierw się zaloguj.');
  try {
    const perm = await Notification.requestPermission(); // musi wynikać z kliknięcia
    if (perm !== 'granted') { toast('Bez zgody nie mogę wysyłać powiadomień.'); return hydratePush(); }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(await fetchPublicKey()) });
    }
    const j = sub.toJSON();
    const { error } = await sb.from('push_subscriptions').upsert({
      endpoint: j.endpoint, user_id: user.id, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200),
    }, { onConflict: 'endpoint' });
    if (error) throw error;
    toast('Powiadomienia włączone ✔');
  } catch (e) {
    toast(`Nie udało się: ${e.message}`);
  }
  hydratePush();
};

actions.pushDisable = async () => {
  try {
    const sub = await currentSub();
    if (sub) {
      await getClient().from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      await sub.unsubscribe();
    }
    toast('Powiadomienia wyłączone na tym urządzeniu');
  } catch (e) { toast(`Nie udało się: ${e.message}`); }
  hydratePush();
};

actions.pushTest = async () => {
  try {
    const { data } = await getClient().auth.getSession();
    const r = await fetch(`${FN}?run=test`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${data.session?.access_token}` },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    toast(j.sent ? 'Wysłano. Powiadomienie powinno przyjść za chwilę.' : (j.note || 'Serwer nie wysłał powiadomienia.'));
  } catch (e) { toast(`Test nie powiódł się: ${e.message}`); }
};
