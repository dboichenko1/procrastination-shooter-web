/* Сторож — прокрастинатор-шутер. Веб-версия, чистый ванильный JS без сборки,
   без зависимостей, без сети. Стоический сторож самого себя.

   Идея: ловишь себя на прокрастинации — жмёшь кнопку, и Сизиф берётся за камень
   и катит его в гору. Катит непрерывно, пока ты не нажмёшь «стоп» (вернулся к
   делу). Камень периодически срывается с вершины вниз — вечный бессмысленный
   труд как зеркало прокрастинации; на срыве приходит напоминание «Дядь, точно
   пора идти дела делать». Раз в час — колокол «А не прокрастинируешь ли ты,
   братец?». Приложение копит статистику: когда, что и сколько ты прокрастинировал.

   Архитектура: чистая логика (циклы Сизифа, агрегаты статистики, расписание
   уведомлений) вынесена в функции и экспортирована как globalThis.PSCore для
   Node-тестов (tests/_harness.js). DOM/SVG/звук/таймеры живут в boot() и ниже —
   в тестовой среде не трогаются. Спецификация — specs/SPEC.md. */
'use strict';

// ───────────────────────── Палитра (дублирует app.css для SVG) ─────────────────────────
var C = {
  paper: '#f1ead9', ink: '#17120e', accent: '#6a4ea3', teal: '#1fb3b3', yellow: '#f2c12e', red: '#e8485f',
  inkSoft: '#5b524a', muted: '#8a7f6f', hairline: '#cabf a9'.replace(' ',''),
};


// ───────────────────────── Константы ─────────────────────────
var CLIMB_MS = 60 * 1000;        // «официальный» цикл — учёт срывов и уведомлений
var ROLLBACK_MS = 1200;          // срыв камня вниз
var CYCLE_MS = CLIMB_MS + ROLLBACK_MS;
var VIS_CLIMB_MS = 8000;         // ВИЗУАЛЬНЫЙ цикл анимации: видно, как катит вверх и срывается
var VIS_FALL_MS = 1000;
var NUDGE_GAP_MS = 5 * 60 * 1000; // не чаще раза в 5 минут — уведомление о срыве
var AUTO_STOP_MS = 4 * 60 * 60 * 1000; // забытый таймер: авто-стоп после 4 часов
var CHECKIN_INTERVAL_MIN = 60;   // почасовой колокол сторожа
var MAX_SESSIONS = 500;          // глубина журнала

// ───────────────────────── Тексты (голос сторожа: спокойный, твёрдый, сухой) ─────────────────────────
var COPY = {
  brand: 'СТОРОЖ',
  tagline: 'Поймал себя — Сизиф покатил камень. Катит, пока ты не вернёшься к делу.',
  intro: 'Поймал себя на прокрастинации — жми «Я прокрастинирую». Сизиф возьмётся за камень и будет катить его в гору, пока ты не нажмёшь «Вернулся к делу». Камень всё равно сорвётся вниз — но смотреть на это не обязательно. — твой сторож',
  taskPlaceholder: 'что ты сейчас откладываешь? (Сизиф запомнит)',
  startBtn: 'Старт',
  stopBtn: 'Стоп',
  idle: 'Гора пуста, камень внизу, дозор спокоен. Жми, когда поймаешь себя.',
  rolling: [
    'Сизиф катит. Ты — откладываешь.',
    'Камень ползёт вверх. Время — вниз.',
    'Каждая секунда честно записывается.',
    'Ты ведь можешь остановиться. Прямо сейчас.',
    'Гора не станет ниже, пока ты смотришь.',
    'Это твой камень. Никто другой его не катит.',
  ],
  rollback: [
    'И снова вниз. Как всегда.',
    'Камень сорвался. Сизиф вздохнул и пошёл снова.',
    'Вершина не удержала. Ничего нового.',
    'Опять с нуля. Сизиф привык — а ты?',
    'Вверх, вниз, вверх, вниз. Узнаёшь?',
  ],
  nudgeTitle: 'Дядь. Точно пора идти дела делать.',
  nudgeBodyTask: '«{task}» всё ещё ждёт. Сизиф катит уже {t}. Вернись к делу.',
  nudgeBodyNoTask: 'Сизиф катит твой камень уже {t}. Камень всё равно сорвётся. Вернись к делу.',
  stopConfirmTask: 'Ты вернулся к делу. {t} ушло в труд Сизифа над «{task}». В следующий раз — короче.',
  stopConfirm: 'Ты вернулся к делу. {t} ушло впустую вверх по склону. В следующий раз — короче.',
  checkinTitle: 'А не прокрастинируешь ли ты, братец?',
  checkinBody: [
    'Только честно. Сторож и так уже знает.',
    'Сторож, который спит, — просто мужик на стуле.',
    'Как там дело, от которого ты бегал?',
    'Быстрый аудит: что ты сейчас делаешь — и то ли это самое?',
  ],
  autoStop: 'Таймер шёл больше 4 часов — Сизиф устал, остановил сам. Поправь в статистике, если что.',
  returns: 'вернулся к делу {n}× сегодня',
  todayLabel: 'сегодня: {t}',
  rollingLabel: 'катишь камень: {t}',
  statsHead: 'Когда, что и сколько ты откладывал. Камень это всё помнит.',
  emptyStats: 'Пока пусто. Поймай себя хоть раз — и здесь появится первая запись.',
  disclaimer: 'Напоминания приходят, пока приложение открыто или недавно использовалось. Ни сервера, ни слежки — только ты, наблюдающий за собой. Для верного сторожа — установи приложение и держи под рукой.',
  warden: 'Мы тебе не надзиратель. Ты сам себе надзиратель.',
};

// Стоические цитаты + миф о Сизифе (ротация).
var QUOTES = [
  { t: 'Ты властен над своим умом, но не над внешними событиями. Осознай это — и обретёшь силу.', a: 'Марк Аврелий, «Размышления»', who: 'marcus' },
  { t: 'Ограничь себя настоящим.', a: 'Марк Аврелий, «Размышления», VII', who: 'marcus' },
  { t: 'Перестань рассуждать, каким должен быть достойный человек. Будь им.', a: 'Марк Аврелий, «Размышления», X', who: 'marcus' },
  { t: 'Препятствие действию двигает действие вперёд. Что стоит на пути — становится путём.', a: 'Марк Аврелий, «Размышления», V', who: 'marcus' },
  { t: 'Сбившись с пути, всякий раз возвращайся к философии.', a: 'Марк Аврелий, «Размышления», IV.31', who: 'marcus' },
  { t: 'Ты можешь покинуть жизнь прямо сейчас. Пусть это решает, что ты делаешь, говоришь и думаешь.', a: 'Марк Аврелий, «Размышления», II.11', who: 'marcus' },
  { t: 'Мы располагаем не малым временем, а теряем многое.', a: 'Сенека, «О краткости жизни»', who: 'seneca' },
  { t: 'Пока мы откладываем, жизнь проносится мимо.', a: 'Сенека, «Письма»', who: 'seneca' },
  { t: 'Начни жить сейчас и считай каждый день отдельной жизнью.', a: 'Сенека, «Письма»', who: 'seneca' },
  { t: 'Откладывание — самая большая трата жизни.', a: 'Сенека, «О краткости жизни»', who: 'seneca' },
  { t: 'Свободен лишь тот, кто властвует собой.', a: 'Эпиктет', who: 'epictetus' },
  { t: 'Сперва скажи себе, кем хочешь быть; потом делай, что должно.', a: 'Эпиктет, «Беседы»', who: 'epictetus' },
  { t: 'Долго ли ещё ты будешь откладывать, прежде чем потребуешь от себя лучшего?', a: 'Эпиктет, «Энхиридион»', who: 'epictetus' },
  { t: 'Не толкуй свою философию. Воплощай её.', a: 'Эпиктет', who: 'epictetus' },
  { t: 'Одной борьбы за вершину достаточно, чтобы наполнить сердце. Стоит представлять себе Сизифа счастливым.', a: 'Альбер Камю, «Миф о Сизифе»', who: 'camus' },
  { t: 'Сизиф учит высшей верности, которая отрицает богов и поднимает камни.', a: 'Альбер Камю, «Миф о Сизифе»', who: 'camus' },
];
var PATRON_BUST = { marcus: '🏛️', seneca: '✍️', epictetus: '⛓️', camus: '🪨' };

// ════════════════════════════════════════════════════════════════════
//  ЧИСТАЯ ЛОГИКА  (тестируется в Node; без DOM)
// ════════════════════════════════════════════════════════════════════

function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
function nextIndex(i, len) { return ((i | 0) + 1) % len; }

// Положение камня в цикле Сизифа по времени активной сессии.
// climb: t 0→1 (вверх), затем rollback: t 1→0 (срыв вниз).
function cyclePosition(runningMs, climbMs, rollbackMs) {
  var cyc = climbMs + rollbackMs;
  if (runningMs < 0) runningMs = 0;
  var inCyc = runningMs % cyc;
  if (inCyc < climbMs) return { phase: 'climb', t: inCyc / climbMs, cycle: Math.floor(runningMs / cyc) };
  return { phase: 'rollback', t: 1 - (inCyc - climbMs) / rollbackMs, cycle: Math.floor(runningMs / cyc) };
}
// Сколько раз камень докатился до вершины (срывов) за время T.
function crestCount(runningMs, climbMs, rollbackMs) {
  if (runningMs < climbMs) return 0;
  return Math.floor((runningMs - climbMs) / (climbMs + rollbackMs)) + 1;
}

// «2м 14с» — короткий формат (живой таймер сессии).
function formatDuration(ms) {
  var s = Math.max(0, Math.floor(ms / 1000));
  var m = Math.floor(s / 60); s = s % 60;
  if (m <= 0) return s + 'с';
  return m + 'м ' + s + 'с';
}
// «1ч 05м» / «12м» / «45с» — для сумм в статистике.
function formatHM(ms) {
  var s = Math.max(0, Math.floor(ms / 1000));
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  if (h > 0) return h + 'ч ' + (m < 10 ? '0' : '') + m + 'м';
  if (m > 0) return m + 'м';
  return s + 'с';
}
// «5:00» — обратный отсчёт (не используется в v2, оставлено как утилита).
function formatClock(ms) {
  var s = Math.max(0, Math.ceil(ms / 1000));
  var m = Math.floor(s / 60); s = s % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function localDateStr(d) {
  var y = d.getFullYear(), mo = ('0' + (d.getMonth() + 1)).slice(-2), da = ('0' + d.getDate()).slice(-2);
  return y + '-' + mo + '-' + da;
}
function hhmmToMin(s) { var p = String(s || '').split(':'); return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0); }
function inQuietHours(minutesOfDay, quiet) {
  if (!quiet || !quiet.enabled) return false;
  var a = hhmmToMin(quiet.start), b = hhmmToMin(quiet.end);
  if (a === b) return false;
  if (a < b) return minutesOfDay >= a && minutesOfDay < b;
  return minutesOfDay >= a || minutesOfDay < b;
}
function shouldFireCheckin(lastCheckinTs, now, nowMinutes, quiet) {
  if (inQuietHours(nowMinutes, quiet)) return false;
  if (!lastCheckinTs) return false;
  return (now - lastCheckinTs) >= CHECKIN_INTERVAL_MIN * 60000;
}
function msUntilNextCheckin(lastCheckinTs, now) {
  if (!lastCheckinTs) return CHECKIN_INTERVAL_MIN * 60000;
  return Math.max(0, lastCheckinTs + CHECKIN_INTERVAL_MIN * 60000 - now);
}
// Можно ли слать уведомление о срыве (лимит частоты).
function shouldNudge(lastNudgeTs, now, nowMinutes, quiet) {
  if (inQuietHours(nowMinutes, quiet)) return false;
  return !lastNudgeTs || (now - lastNudgeTs) >= NUDGE_GAP_MS;
}

// ───────────────────────── Статистика (агрегаты из журнала сессий) ─────────────────────────
function sessionRollbacks(s) {
  return (s && typeof s.rollbacks === 'number') ? s.rollbacks : crestCount((s && s.ms) || 0, CLIMB_MS, ROLLBACK_MS);
}
// Суммы по дням за последние n дней (включая сегодня), от старых к новым.
function dayTotals(sessions, n, now) {
  var out = [];
  for (var i = n - 1; i >= 0; i--) {
    var d = new Date(now); d.setDate(d.getDate() - i);
    out.push({ date: localDateStr(d), ms: 0, count: 0 });
  }
  var byDate = {};
  out.forEach(function (o) { byDate[o.date] = o; });
  (sessions || []).forEach(function (s) {
    var o = byDate[s.date];
    if (o) { o.ms += s.ms || 0; o.count += 1; }
  });
  return out;
}
// Сводка: сегодня и за всё время.
function summarize(sessions, lifetime, now) {
  var today = localDateStr(new Date(now));
  var todayMs = 0, todayCount = 0, longestMs = 0;
  (sessions || []).forEach(function (s) {
    if (s.ms > longestMs) longestMs = s.ms;
    if (s.date === today) { todayMs += s.ms || 0; todayCount += 1; }
  });
  return {
    todayMs: todayMs, todayCount: todayCount, longestMs: longestMs,
    totalMs: (lifetime && lifetime.totalMs) || 0,
    totalSessions: (lifetime && lifetime.totalSessions) || 0,
    totalRollbacks: (lifetime && lifetime.totalRollbacks) || 0,
  };
}

// ───────────────────────── Состояние ─────────────────────────
var STORE_KEY = 'ps.v2';

function defaultState(now) {
  return {
    schemaVersion: 2,
    settings: {
      soundOn: true, patron: 'rotate', notificationsEnabled: false,
      quietHours: { start: '22:00', end: '08:00', enabled: true },
    },
    task: { text: '', setAt: 0 },
    current: { running: false, startTs: null },
    sessions: [],
    streak: { returnsToday: 0, returnsDate: '' },
    lifetime: { totalMs: 0, totalSessions: 0, totalRollbacks: 0, firstUseDate: '' },
    notif: { permission: 'default', lastCheckinTs: 0, lastNudgeTs: 0 },
    quoteIndex: 0,
    seenIntro: false,
  };
}

function deepMerge(dst, src) {
  var out = Array.isArray(dst) ? dst.slice() : Object.assign({}, dst);
  if (!src || typeof src !== 'object') return out;
  for (var k in src) {
    if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
    var sv = src[k], dv = out[k];
    if (sv && typeof sv === 'object' && !Array.isArray(sv) && dv && typeof dv === 'object' && !Array.isArray(dv)) out[k] = deepMerge(dv, sv);
    else if (sv !== undefined) out[k] = sv;
  }
  return out;
}

function loadState(raw, now) {
  var base = defaultState(now);
  var parsed = null;
  if (raw) { try { parsed = JSON.parse(raw); } catch (e) { parsed = null; } }
  if (!parsed || typeof parsed !== 'object') {
    base.lifetime.firstUseDate = localDateStr(new Date(now));
    base.notif.lastCheckinTs = now;
    return base;
  }
  var s = deepMerge(base, parsed);
  s.schemaVersion = 2;
  if (!Array.isArray(s.sessions)) s.sessions = [];
  s.current.startTs = +s.current.startTs || null;
  s.current.running = !!s.current.running && !!s.current.startTs;
  if (!s.lifetime.firstUseDate) s.lifetime.firstUseDate = localDateStr(new Date(now));
  if (!s.notif.lastCheckinTs) s.notif.lastCheckinTs = now;
  return s;
}

// Экспорт чистых функций для Node-тестов и отладки. В браузере безвреден.
if (typeof globalThis !== 'undefined') {
  globalThis.PSCore = {
    clamp, nextIndex, cyclePosition, crestCount,
    formatDuration, formatHM, formatClock,
    localDateStr, hhmmToMin, inQuietHours, shouldFireCheckin, msUntilNextCheckin, shouldNudge,
    sessionRollbacks, dayTotals, summarize,
    defaultState, deepMerge, loadState,
    CLIMB_MS, ROLLBACK_MS, CYCLE_MS, NUDGE_GAP_MS, AUTO_STOP_MS, CHECKIN_INTERVAL_MIN,
    QUOTES, COPY,
  };
}

// ════════════════════════════════════════════════════════════════════
//  БРАУЗЕРНАЯ ЧАСТЬ  (DOM / SVG / звук / уведомления / цикл)
//  Ниже всё запускается из boot(); в тестовой среде не исполняется.
// ════════════════════════════════════════════════════════════════════

var S, els = {};
var reduceMotion = false;
var checkinTimer = null, lastQuote = null, deferredInstall = null;
var saveTimer = null, memoryFallback = false;
var crestSeen = 0;          // сколько срывов уже «увидели» (чтобы не слать пачку уведомлений)
var rollbackFlashUntil = 0; // момент, до которого подсвечиваем срыв

// ── Геометрия сцены (склон Сизифа) ──
var SVG_W = 300, SVG_H = 360;
// спрайт «человек+камень» (вырезан из фото); едет по склону вверх и срывается вниз
var SCENE_W = 152, SCENE_H = 270, SCENE_X = 14, SCENE_Y = 74;
var BX0 = 66, BY0 = 318, BX1 = 262, BY1 = 120;   // низ → вершина склона
var BOULDER_R = 30;                              // крупный валун (как в референсе)
var SLEN = Math.sqrt((BX1 - BX0) * (BX1 - BX0) + (BY1 - BY0) * (BY1 - BY0));
var UX = (BX1 - BX0) / SLEN, UY = (BY1 - BY0) / SLEN;   // вдоль склона (вверх)
var NX = UY, NY = -UX;                                  // нормаль «в воздух» (вверх-влево) — валун лежит на склоне сверху
var SLOPE_DEG = Math.atan2(BY1 - BY0, BX1 - BX0) * 180 / Math.PI;
var VU = [UX, UY], VD = [-UX, -UY], VN = [NX, NY];      // вдоль склона / вниз по склону / в воздух
var TWO_PI = Math.PI * 2;
var STRIDE_MS = 720;                                    // длительность шага (цикл ног)

// мини-вектора для анатомической фигурки
function surfPt(tt) { return [BX0 + (BX1 - BX0) * tt, BY0 + (BY1 - BY0) * tt]; }
function vadd(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
function vmul(a, s) { return [a[0] * s, a[1] * s]; }
function vmid(a, b) { return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; }
function setLine(e, a, b) { e.setAttribute('x1', a[0]); e.setAttribute('y1', a[1]); e.setAttribute('x2', b[0]); e.setAttribute('y2', b[1]); }
function setDot(e, p) { e.setAttribute('cx', p[0]); e.setAttribute('cy', p[1]); }

// Суставы Сизифа в экранных координатах. mode: 'push' (толкает вверх), 'fall'
// (камень сорвался — отшатнулся), 'idle' (стоит у камня). bc — центр камня, t —
// положение на склоне, wp — фаза шага 0..1.
function figureJoints(bc, t, wp, mode) {
  var R = BOULDER_R;
  var hip, sh, head, hand, elbow, footR, footL, kneeR, kneeL;
  if (mode === 'push') {
    // фигура стоит НИЖЕ-ЛЕВЕЕ валуна (сбоку), упирается снизу вверх: корпус подан
    // в камень, руки тянутся к его нижне-тыльной грани, ноги в выпаде, лёгкое качание.
    var bob = Math.sin(TWO_PI * wp * 2) * 1.4;
    var fa = clamp(t - 0.22, -0.14, 1);
    hip = vadd(surfPt(fa + 0.02), vmul(VN, 15 + bob));
    sh = vadd(hip, vadd(vmul(VU, 11), vmul(VN, 13)));              // плечи поданы вверх по склону в камень
    head = vadd(sh, vadd(vmul(VN, 7), vmul(VU, 1)));
    hand = vadd(bc, vadd(vmul(VD, R * 0.9), vmul(VN, R * 0.18)));  // ладони на нижне-тыльной грани валуна
    elbow = vadd(vmid(sh, hand), vmul(VN, 2));
    var pr = TWO_PI * wp, pl = TWO_PI * (wp + 0.5), sA = 0.035;
    footR = vadd(surfPt(fa + 0.06 + sA * Math.sin(pr)), vmul(VN, Math.max(0, Math.sin(pr)) * 5)); // нога впереди
    footL = vadd(surfPt(fa - 0.05 + sA * Math.sin(pl)), vmul(VN, Math.max(0, Math.sin(pl)) * 5)); // нога сзади (толчок)
    kneeR = vadd(vmid(hip, footR), vmul(VN, 7));
    kneeL = vadd(vmid(hip, footL), vmul(VN, 7));
  } else if (mode === 'fall') {
    var fb = clamp(t - 0.18, -0.12, 1);
    hip = vadd(surfPt(fb), vmul(VN, 14));
    sh = vadd(hip, vadd(vmul(VD, 4), vmul(VN, 16)));               // отшатнулся назад-вверх
    head = vadd(sh, vadd(vmul(VD, 2), vmul(VN, 7)));
    hand = vadd(sh, vadd(vmul(VU, 2), vmul(VN, 10)));              // руки вскинуты
    elbow = vadd(vmid(sh, hand), vmul(VN, 3));
    footR = vadd(surfPt(fb + 0.05), vmul(VN, 1));
    footL = vadd(surfPt(fb - 0.05), vmul(VN, 1));
    kneeR = vadd(vmid(hip, footR), vmul(VN, 6));
    kneeL = vadd(vmid(hip, footL), vmul(VN, 6));
  } else { // idle — стоит у валуна сбоку, рука на нём
    var fa2 = clamp(t - 0.22, -0.14, 1);
    hip = vadd(surfPt(fa2 + 0.02), vmul(VN, 16));
    sh = vadd(hip, vmul(VN, 18));
    head = vadd(sh, vmul(VN, 8));
    hand = vadd(bc, vadd(vmul(VD, R * 0.9), vmul(VN, -R * 0.05))); // рука покоится на валуне
    elbow = vadd(vmid(sh, hand), vmul(VN, -1));
    footR = vadd(surfPt(fa2 + 0.04), vmul(VN, 0.5));
    footL = vadd(surfPt(fa2 - 0.04), vmul(VN, 0.5));
    kneeR = vadd(vmid(hip, footR), vmul(VN, 3));
    kneeL = vadd(vmid(hip, footL), vmul(VN, 3));
  }
  return { hip: hip, sh: sh, head: head, hand: hand, elbow: elbow, footR: footR, footL: footL, kneeR: kneeR, kneeL: kneeL };
}

function svgNS() { return 'http://www.w3.org/2000/svg'; }
function el(tag, attrs, kids) { var n = document.createElement(tag); applyAttrs(n, attrs); appendKids(n, kids); return n; }
function sel(tag, attrs, kids) { var n = document.createElementNS(svgNS(), tag); applyAttrs(n, attrs, true); appendKids(n, kids); return n; }
function applyAttrs(n, attrs, isSvg) {
  if (!attrs) return;
  for (var k in attrs) {
    if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
    var v = attrs[k];
    if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'class') (isSvg ? n.setAttribute('class', v) : (n.className = v));
    else if (k === 'style' && !isSvg) n.style.cssText = v;
    else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) n.setAttribute(k, v);
  }
}
function appendKids(n, kids) {
  if (!kids) return;
  if (!Array.isArray(kids)) kids = [kids];
  kids.forEach(function (k) { if (k != null) n.appendChild(typeof k === 'string' ? document.createTextNode(k) : k); });
}

// ───────────────────────── Сборка интерфейса ─────────────────────────
function buildUI() {
  var root = document.getElementById('root');
  root.innerHTML = '';
  var wrap = el('div', { class: 'wrap minimal' });

  // сцена + кнопка СТАРТ/СТОП + явная кнопка статистики; настройки — иконка в углу.
  var well = el('div', { class: 'well' }, [buildSvg(), el('div', { class: 'vignette' })]);
  els.well = well;
  var corner = el('div', { class: 'corner' }, [
    el('button', { class: 'corner-btn', type: 'button', 'aria-label': 'настройки', title: 'настройки', text: '⚙', onclick: openSettings }),
  ]);
  well.appendChild(corner);

  var timer = el('div', { class: 'timer' }, '0:00');   // видимое время сессии
  els.timer = timer;

  var action = el('button', { class: 'action', type: 'button' });
  els.action = action;
  wireAction(action);

  var statsBtn = el('button', { class: 'subaction', type: 'button', text: 'Статистика', onclick: openStats });

  appendKids(wrap, [well, timer, action, statsBtn]);
  root.appendChild(wrap);

  els.sr = el('div', { class: 'sr-only', 'aria-live': 'assertive' });
  root.appendChild(els.sr);

  updateActionButton();
  updateMeta();
}

// Сцена в стиле постмодерн/Мемфис (CSS+SVG анимация Сизифа из «Sisyphus Postmodern»).
// Камень катится вверх по склону и срывается вниз — чистые CSS-кейфреймы, без ассетов.
function buildSvg() {
  var svg = sel('svg', { viewBox: '0 0 760 520', class: 'scene', role: 'img', 'aria-label': 'Сизиф катит камень в гору' });
  var defs = sel('defs', {});
  var clip = sel('clipPath', { id: 'panClip' });
  clip.appendChild(sel('rect', { x: 0, y: 0, width: 760, height: 520 }));
  defs.appendChild(clip);
  svg.appendChild(defs);
  var g = sel('g', { 'clip-path': 'url(#panClip)' });

  g.appendChild(sel('rect', { x: 0, y: 0, width: 760, height: 520, fill: C.paper }));               // бумага
  // цветовые плоскости
  g.appendChild(sel('rect', { x: 300, y: -40, width: 230, height: 150, fill: C.teal, transform: 'rotate(-9 415 35)' }));
  g.appendChild(sel('rect', { x: 54, y: 74, width: 236, height: 62, fill: C.accent, transform: 'rotate(-6 172 105)' }));
  g.appendChild(sel('circle', { cx: 710, cy: 470, r: 100, fill: C.yellow }));
  // дот-грид
  var dots = sel('g', { fill: C.ink });
  for (var ry = 0; ry < 3; ry++) for (var rx = 0; rx < 4; rx++) dots.appendChild(sel('circle', { cx: 592 + rx * 22, cy: 350 + ry * 22, r: 5 }));
  g.appendChild(dots);
  // диагональные штрихи
  var st = sel('g', { stroke: C.accent, 'stroke-width': 4, 'stroke-linecap': 'round' });
  st.appendChild(sel('line', { x1: 470, y1: 440, x2: 510, y2: 400 }));
  st.appendChild(sel('line', { x1: 484, y1: 448, x2: 528, y2: 404 }));
  st.appendChild(sel('line', { x1: 498, y1: 456, x2: 546, y2: 408 }));
  g.appendChild(st);
  g.appendChild(sel('circle', { cx: 690, cy: 250, r: 34, fill: 'none', stroke: C.teal, 'stroke-width': 5 }));   // кольцо
  g.appendChild(sel('path', { d: 'M150,470 l22,-38 l22,38 z', fill: 'none', stroke: C.ink, 'stroke-width': 4 })); // треугольник
  // зигзаг (wob) + загогулина (drift)
  var zig = sel('g', { class: 'm-wob', transform: 'translate(70,188)' });
  zig.appendChild(sel('polyline', { points: '2,30 22,8 42,30 62,8 82,30 102,8 122,30 142,8', fill: 'none', stroke: C.red, 'stroke-width': 5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  g.appendChild(zig);
  var sq = sel('g', { class: 'm-drift', transform: 'translate(460,150)' });
  sq.appendChild(sel('path', { d: 'M4,20 C24,2 44,38 64,20 S104,2 124,20 S164,38 176,20', fill: 'none', stroke: C.ink, 'stroke-width': 5, 'stroke-linecap': 'round' }));
  g.appendChild(sq);
  // парящие акценты
  var yq = sel('g', { class: 'm-spin' }); yq.appendChild(sel('rect', { x: 250, y: 60, width: 18, height: 18, fill: C.yellow })); g.appendChild(yq);
  var td = sel('g', { class: 'm-pulse' }); td.appendChild(sel('circle', { cx: 68, cy: 308, r: 8, fill: C.teal })); g.appendChild(td);
  var tri = sel('g', { class: 'm-drift' }); tri.appendChild(sel('path', { d: 'M551,300 l11,19 l-22,0 z', fill: C.red })); g.appendChild(tri);
  // склон
  g.appendChild(sel('line', { x1: 56, y1: 402, x2: 704, y2: 150, stroke: C.ink, 'stroke-width': 9, 'stroke-linecap': 'round' }));
  g.appendChild(sel('line', { x1: 704, y1: 150, x2: 812, y2: 108, stroke: C.ink, 'stroke-width': 9, 'stroke-linecap': 'round', 'stroke-dasharray': '3 18', opacity: 0.5 }));
  g.appendChild(sel('path', { d: 'M150,360 q-72,-118 -98,42', fill: 'none', stroke: C.ink, 'stroke-width': 2.5, 'stroke-dasharray': '2 10', opacity: 0.3 }));

  // КЛАЙМБЕР: базовая позиция → анимируемая группа (climb) → камень (roll) + фигура
  var base = sel('g', { transform: 'translate(150,365)' });
  var climber = sel('g', { class: 'm-climb' });
  var bpos = sel('g', { transform: 'translate(60,-130)' });
  var boulder = sel('g', { class: 'm-roll' });
  boulder.appendChild(sel('circle', { cx: 60, cy: 60, r: 53, fill: C.paper, stroke: C.ink, 'stroke-width': 6 }));
  boulder.appendChild(sel('path', { d: 'M60,7 A53,53 0 0 1 60,113 Z', fill: C.accent }));
  boulder.appendChild(sel('circle', { cx: 38, cy: 42, r: 5, fill: C.ink }));
  boulder.appendChild(sel('circle', { cx: 60, cy: 60, r: 4, fill: C.ink }));
  bpos.appendChild(boulder); climber.appendChild(bpos);
  var fig = sel('g', { transform: 'translate(-24,-173)' });
  var fg = sel('g', { fill: 'none', stroke: C.ink, 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  ['M32,108 L13,140 L2,172', 'M32,108 L50,138 L45,174', 'M32,108 L54,60', 'M50,66 L84,80 L108,98'].forEach(function (d) { fg.appendChild(sel('path', { d: d })); });
  fig.appendChild(fg);
  fig.appendChild(sel('circle', { cx: 60, cy: 45, r: 13, fill: C.ink }));
  climber.appendChild(fig); base.appendChild(climber); g.appendChild(base);

  svg.appendChild(g);
  els.svg = svg;
  return svg;
}

// ───────────────────────── Рендер сцены ─────────────────────────
// Вся анимация — на CSS-кейфреймах (climb/roll и Мемфис-мотивы). JS лишь
// переключает классы: .rolling (катит) и .rollback (вспышка срыва).
function renderScene() {
  var running = S.current.running && S.current.startTs;
  var flashing = now() < rollbackFlashUntil;
  els.well.className = 'well' + (running && !reduceMotion ? ' rolling' : '') + (flashing ? ' rollback' : '');
}

// ───────────────────────── Старт / стоп ─────────────────────────
function wireAction(btn) {
  btn.addEventListener('click', toggleRolling);
  btn.addEventListener('keydown', function (e) {
    if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); toggleRolling(); }
  });
}
function toggleRolling() { if (S.current.running) stopRolling(); else startRolling(); }

function startRolling() {
  if (S.current.running) return;
  S.current.running = true;
  S.current.startTs = now();
  S.current.sessionStartTs = S.current.startTs;
  crestSeen = 0;
  if (navigator.vibrate) { try { navigator.vibrate(14); } catch (e) {} }
  updateActionButton();
  updateMeta();
  announce('Сизиф покатил камень. Таймер прокрастинации пошёл.');
  scheduleSave(true);
}

function stopRolling(silent) {
  if (!S.current.running) return;
  var end = now();
  var start = S.current.startTs || end;
  var ms = Math.max(0, end - start);
  var task = (S.task.text || '').trim();
  var rb = crestCount(ms, CLIMB_MS, ROLLBACK_MS);
  S.sessions.push({ start: start, end: end, ms: ms, task: task, date: localDateStr(new Date(start)), rollbacks: rb });
  if (S.sessions.length > MAX_SESSIONS) S.sessions = S.sessions.slice(-MAX_SESSIONS);
  S.lifetime.totalMs += ms;
  S.lifetime.totalSessions += 1;
  S.lifetime.totalRollbacks += rb;
  var d = localDateStr(new Date(end));
  if (S.streak.returnsDate !== d) { S.streak.returnsToday = 0; S.streak.returnsDate = d; }
  S.streak.returnsToday += 1;

  S.current.running = false;
  S.current.startTs = null;
  crestSeen = 0;
  updateActionButton();
  updateMeta();
  scheduleSave(true);
  if (!silent) announce('Стоп. ' + formatDuration(ms) + ' прокрастинации записано.');
}

function updateActionButton() {
  var running = S.current.running;
  els.action.textContent = running ? COPY.stopBtn : COPY.startBtn;
  els.action.className = 'action' + (running ? ' running' : '');
  els.action.setAttribute('aria-pressed', running ? 'true' : 'false');
  els.action.setAttribute('aria-label', running ? 'вернуться к делу — остановить Сизифа' : 'я прокрастинирую — пустить Сизифа катить камень');
}

// ───────────────────────── Срыв камня + уведомление ─────────────────────────
function onCrest() {
  if (!reduceMotion) rollbackFlashUntil = now() + 700;
  // уведомление о срыве — с лимитом частоты и вне тихих часов
  var d = new Date(now()), mins = d.getHours() * 60 + d.getMinutes();
  if (canNotify() && Notification.permission === 'granted' && shouldNudge(S.notif.lastNudgeTs, now(), mins, S.settings.quietHours)) {
    var elapsed = now() - (S.current.startTs || now());
    var task = (S.task.text || '').trim();
    var body = (task ? COPY.nudgeBodyTask.replace('{task}', task) : COPY.nudgeBodyNoTask).replace('{t}', formatDuration(elapsed));
    notify(COPY.nudgeTitle, body, 'ps-nudge');
    S.notif.lastNudgeTs = now();
    scheduleSave();
  }
}

// ───────────────────────── Строка мысли ─────────────────────────
var quoteTimer = null;
function showQuoteLine(q, holdMs) {
  if (!els.stoicQuote) return;   // в минимальном интерфейсе строки мысли нет
  if (quoteTimer) { clearTimeout(quoteTimer); quoteTimer = null; }
  els.stoicQuote.textContent = q.t;
  els.stoicAttr.textContent = q.a || '';
  els.stoic.classList.toggle('flash', !q.a && q.t !== COPY.idle && q.t !== COPY.intro);
  if (holdMs) quoteTimer = setTimeout(showIdleOrQuote, holdMs);
}
function showIdleOrQuote() {
  if (S.current.running) showRollingLine();
  else showQuoteLine(currentAnchorQuote());   // в покое экран держит стоическая мысль
}
function currentAnchorQuote() { if (!lastQuote) lastQuote = pickQuoteForPatron(); return lastQuote; }
function showRollingLine() {
  var t = COPY.rolling[Math.floor(Math.random() * COPY.rolling.length)];
  showQuoteLine({ t: t, a: '' });
}
function nextQuote() { lastQuote = pickQuoteForPatron(); S.quoteIndex = nextIndex(S.quoteIndex, QUOTES.length); scheduleSave(); return lastQuote; }
function pickQuoteForPatron() {
  var pool = QUOTES;
  if (S.settings.patron && S.settings.patron !== 'rotate') pool = QUOTES.filter(function (q) { return q.who === S.settings.patron; });
  if (!pool.length) pool = QUOTES;
  return pool[S.quoteIndex % pool.length];
}
function announce(t) { if (els.sr) els.sr.textContent = t; }

// ───────────────────────── Уведомления ─────────────────────────
function canNotify() { return typeof Notification !== 'undefined'; }
function requestNotifPermission() {
  if (!canNotify()) { toast('Браузер не умеет уведомления — но приложение работает и так.'); return; }
  Notification.requestPermission().then(function (perm) {
    S.notif.permission = perm;
    S.settings.notificationsEnabled = perm === 'granted';
    scheduleSave(true);
    if (perm === 'granted') { primeCheckin(); registerPeriodicCheckin(); toast('Колокол сторожа на посту.'); }
    else toast('Без уведомлений — но сторож по-прежнему здесь, в самом приложении.');
    updateCheckinFooter();
  }).catch(function () {});
}
function registerPeriodicCheckin() {
  if (!navigator.serviceWorker || !navigator.serviceWorker.ready) return;
  navigator.serviceWorker.ready.then(function (reg) { if (reg.periodicSync && reg.periodicSync.register) reg.periodicSync.register('checkin', { minInterval: 60 * 60 * 1000 }).catch(function () {}); }).catch(function () {});
}
function notify(title, body, tag) {
  if (!canNotify() || Notification.permission !== 'granted') return false;
  try {
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready.then(function (reg) { reg.showNotification(title, { body: body, tag: tag, icon: 'icons/icon-192.png', badge: 'icons/favicon-32.png' }); }).catch(function () { new Notification(title, { body: body, tag: tag }); });
    } else { new Notification(title, { body: body, tag: tag }); }
    return true;
  } catch (e) { return false; }
}
function primeCheckin() { if (!S.notif.lastCheckinTs) S.notif.lastCheckinTs = now(); scheduleCheckinTimer(); }
function catchUpCheckin() {
  if (!canNotify() || Notification.permission !== 'granted') { scheduleCheckinTimer(); updateCheckinFooter(); return; }
  var d = new Date(now()), mins = d.getHours() * 60 + d.getMinutes();
  if (shouldFireCheckin(S.notif.lastCheckinTs, now(), mins, S.settings.quietHours)) {
    notify(COPY.checkinTitle, COPY.checkinBody[Math.floor(Math.random() * COPY.checkinBody.length)], 'ps-checkin');
    S.notif.lastCheckinTs = now(); scheduleSave(true);
  }
  scheduleCheckinTimer(); updateCheckinFooter();
}
function scheduleCheckinTimer() {
  if (checkinTimer) clearTimeout(checkinTimer);
  var wait = msUntilNextCheckin(S.notif.lastCheckinTs, now());
  checkinTimer = setTimeout(catchUpCheckin, Math.min(wait + 500, 25 * 60000));
}
function updateCheckinFooter() {
  if (!els.checkinIn) return;
  if (!canNotify() || Notification.permission !== 'granted') { els.checkinIn.textContent = 'колокол сторожа выключен'; return; }
  var mins = Math.round(msUntilNextCheckin(S.notif.lastCheckinTs, now()) / 60000);
  els.checkinIn.textContent = 'следующий колокол ~' + mins + ' мин';
}

// ───────────────────────── Листы (настройки / статистика) ─────────────────────────
function showSheet(cardEl, extraClass) {
  hideSheet();
  els.sheetReturnFocus = document.activeElement;
  cardEl.setAttribute('role', 'dialog'); cardEl.setAttribute('aria-modal', 'true');
  if (!cardEl.getAttribute('tabindex')) cardEl.setAttribute('tabindex', '-1');
  var back = el('div', { class: 'sheet-backdrop' + (extraClass ? ' ' + extraClass : '') }, [cardEl]);
  back.addEventListener('click', function (e) { if (e.target === back) hideSheet(); });
  document.body.appendChild(back);
  els.sheet = back; els.sheetKind = extraClass || null;
  var root = document.getElementById('root');
  if (root) { root.setAttribute('aria-hidden', 'true'); try { root.inert = true; } catch (e) {} }
  requestAnimationFrame(function () { requestAnimationFrame(function () { back.classList.add('show'); var f = cardEl.querySelector('.btn, button, input, select, [tabindex]') || cardEl; try { f.focus(); } catch (e) {} }); });
}
function hideSheet() {
  if (!els.sheet) return;
  var b = els.sheet; els.sheet = null; els.sheetKind = null;
  b.classList.remove('show');
  var root = document.getElementById('root');
  if (root) { root.removeAttribute('aria-hidden'); try { root.inert = false; } catch (e) {} }
  var ret = els.sheetReturnFocus; els.sheetReturnFocus = null;
  if (ret && ret.focus) { try { ret.focus(); } catch (e) {} }
  setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 400);
}
var bannerTimer = null;
function toast(msg) {
  var b = els.banner;
  if (!b) { b = el('div', { class: 'banner' }); document.body.appendChild(b); els.banner = b; }
  b.textContent = msg; b.classList.add('show');
  if (bannerTimer) clearTimeout(bannerTimer);
  bannerTimer = setTimeout(function () { b.classList.remove('show'); }, 3400);
}

// ───────────────────────── Статистика ─────────────────────────
function openStats() {
  var sum = summarize(S.sessions, S.lifetime, now());
  var card = el('div', { class: 'card stats-card' }, [
    el('h2', { text: 'Статистика' }),
    el('p', { class: 'mirror-cap', text: COPY.statsHead }),
    statTiles(sum),
    buildDayChart(),
    buildSessionLog(),
    el('p', { class: 'lifetime', text: 'за всё время: ' + formatHM(sum.totalMs) + ' · сессий ' + sum.totalSessions + ' · срывов камня ' + sum.totalRollbacks }),
    el('div', { style: 'text-align:center;margin-top:16px' }, [el('button', { class: 'btn', type: 'button', text: 'закрыть', onclick: hideSheet })]),
  ]);
  showSheet(card, 'settings');
}
function statTiles(sum) {
  function tile(v, label) { return el('div', { class: 'tile' }, [el('div', { class: 'tile-v', text: v }), el('div', { class: 'tile-l', text: label })]); }
  return el('div', { class: 'tiles' }, [
    tile(formatHM(sum.todayMs), 'сегодня'),
    tile(String(sum.todayCount), 'сессий сегодня'),
    tile(formatHM(sum.longestMs), 'рекорд сессии'),
    tile(String(S.streak.returnsToday || 0) + '×', 'вернулся к делу'),
  ]);
}
function buildDayChart() {
  var rows = dayTotals(S.sessions, 14, now());
  var todayStr = localDateStr(new Date(now()));
  var maxMs = rows.reduce(function (m, r) { return Math.max(m, r.ms); }, 0) || 1;
  var vbW = rows.length * 20, vbH = 76;
  var svg = sel('svg', { viewBox: '0 0 ' + vbW + ' ' + vbH, role: 'img', 'aria-label': 'прокрастинация по дням (минуты)' });
  rows.forEach(function (d, i) {
    var h = clamp(d.ms / maxMs, 0, 1) * 50;
    var x = i * 20 + 3, y = 58 - h;
    svg.appendChild(sel('rect', { x: x, y: y, width: 14, height: Math.max(d.ms > 0 ? 2 : 1, h), fill: d.ms > 0 ? C.terracotta : C.hairline, opacity: d.date === todayStr ? 1 : 0.8, rx: 1 }));
    var dd = d.date.slice(8);
    svg.appendChild(sel('text', { x: x + 7, y: 68, 'font-size': 6, fill: C.muted, 'text-anchor': 'middle', 'font-family': 'Georgia, serif' }, [dd]));
  });
  svg.appendChild(sel('line', { x1: 0, y1: 58, x2: vbW, y2: 58, stroke: C.hairline, 'stroke-width': 0.6 }));
  return el('div', { class: 'mirror' }, [el('h3', { text: 'По дням (минуты прокрастинации)' }), svg]);
}
function buildSessionLog() {
  var list = el('div', { class: 'log' });
  var recent = S.sessions.slice().reverse().slice(0, 30);
  if (!recent.length) { list.appendChild(el('p', { class: 'mirror-cap', text: COPY.emptyStats })); return el('div', { class: 'mirror' }, [el('h3', { text: 'Журнал' }), list]); }
  recent.forEach(function (s) {
    var dt = new Date(s.start);
    var when = (s.date === localDateStr(new Date(now())) ? 'сегодня' : s.date.slice(5).replace('-', '.')) + ' ' + ('0' + dt.getHours()).slice(-2) + ':' + ('0' + dt.getMinutes()).slice(-2);
    var del = el('button', { class: 'log-del', type: 'button', title: 'удалить запись', 'aria-label': 'удалить запись', text: '✕', onclick: function () { deleteSession(s.start); } });
    list.appendChild(el('div', { class: 'log-row' }, [
      el('span', { class: 'log-when', text: when }),
      el('span', { class: 'log-dur', text: formatHM(s.ms) }),
      el('span', { class: 'log-task', text: s.task ? '«' + s.task + '»' : '—' }),
      del,
    ]));
  });
  return el('div', { class: 'mirror' }, [el('h3', { text: 'Журнал (последние ' + recent.length + ')' }), list]);
}
function deleteSession(startTs) {
  var idx = -1;
  for (var i = 0; i < S.sessions.length; i++) { if (S.sessions[i].start === startTs) { idx = i; break; } }
  if (idx < 0) return;
  var s = S.sessions[idx];
  S.lifetime.totalMs = Math.max(0, S.lifetime.totalMs - (s.ms || 0));
  S.lifetime.totalSessions = Math.max(0, S.lifetime.totalSessions - 1);
  S.lifetime.totalRollbacks = Math.max(0, S.lifetime.totalRollbacks - sessionRollbacks(s));
  S.sessions.splice(idx, 1);
  scheduleSave(true);
  hideSheet(); openStats();
}

// ───────────────────────── Настройки ─────────────────────────
function openSettings() {
  var rows = [];
  var notifOn = canNotify() && Notification.permission === 'granted';
  rows.push(settingsRow('Колокол сторожа', notifOn ? 'почасовая проверка совести включена' : 'почасовое «не прокрастинируешь ли, братец?»',
    switchCtl(notifOn, function (on, input) { if (on) requestNotifPermission(); else { toast('Отозвать разрешение можно в настройках браузера.'); input.checked = notifOn; } }, 'Колокол сторожа')));
  var qh = S.settings.quietHours;
  var startInp = el('input', { class: 'time-input', type: 'time', value: qh.start, 'aria-label': 'начало тихих часов', onchange: function () { qh.start = startInp.value; scheduleSave(true); } });
  var endInp = el('input', { class: 'time-input', type: 'time', value: qh.end, 'aria-label': 'конец тихих часов', onchange: function () { qh.end = endInp.value; scheduleSave(true); } });
  rows.push(settingsRow('Тихие часы', 'колокол молчит', el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;align-items:center' }, [switchCtl(qh.enabled, function (on) { qh.enabled = on; scheduleSave(true); }, 'Тихие часы'), startInp, el('span', { text: '–' }), endInp])));

  var exportBtn = el('button', { class: 'link-btn', type: 'button', text: 'экспорт данных', onclick: exportData });
  var importBtn = el('button', { class: 'link-btn', type: 'button', text: 'импорт', onclick: importData });
  var installBtn = deferredInstall ? el('button', { class: 'link-btn', type: 'button', text: 'установить приложение', onclick: doInstall }) : null;
  rows.push(el('div', { class: 'row', style: 'flex-direction:column;align-items:stretch;gap:8px' }, [
    el('div', {}, [el('div', { class: 'label', text: 'Данные' }), el('span', { class: 'hint', text: 'всё хранится только у тебя, локально' })]),
    el('div', { style: 'display:flex;gap:16px;flex-wrap:wrap' }, [exportBtn, importBtn, installBtn].filter(Boolean)),
  ]));

  var card = el('div', { class: 'card' }, [
    el('h2', { text: 'Сторож' }),
    el('div', {}, rows),
    el('p', { class: 'disclaimer', text: COPY.disclaimer }),
    el('p', { class: 'warden', text: COPY.warden }),
    el('div', { style: 'text-align:center;margin-top:16px' }, [el('button', { class: 'btn', type: 'button', text: 'закрыть', onclick: hideSheet })]),
  ]);
  showSheet(card, 'settings');
}
function settingsRow(label, hint, ctl) {
  return el('div', { class: 'row' }, [el('div', {}, [el('div', { class: 'label', text: label }), el('span', { class: 'hint', text: hint })]), el('div', { class: 'ctl' }, [ctl])]);
}
function switchCtl(checked, onChange, label) {
  var input = el('input', { type: 'checkbox' });
  if (label) input.setAttribute('aria-label', label);
  input.checked = !!checked;
  input.addEventListener('change', function () { onChange(input.checked, input); });
  return el('label', { class: 'switch' }, [input, el('span', { class: 'track' }), el('span', { class: 'thumb' })]);
}
function exportData() {
  try {
    var blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: 'storozh-data.json' });
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); if (a.parentNode) a.parentNode.removeChild(a); }, 100);
  } catch (e) { toast('Не вышло выгрузить данные.'); }
}
function importData() {
  var inp = el('input', { type: 'file', accept: 'application/json', style: 'display:none' });
  inp.addEventListener('change', function () {
    var f = inp.files && inp.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () { try { S = loadState(String(r.result), now()); scheduleSave(true); hideSheet(); buildUI(); updateCheckinFooter(); toast('Данные восстановлены.'); } catch (e) { toast('Файл не распознан.'); } };
    r.readAsText(f);
  });
  document.body.appendChild(inp); inp.click(); setTimeout(function () { if (inp.parentNode) inp.parentNode.removeChild(inp); }, 1000);
}

// ───────────────────────── Сохранение ─────────────────────────
function scheduleSave(immediate) {
  if (immediate) { writeState(); return; }
  if (saveTimer) return;
  saveTimer = setTimeout(function () { saveTimer = null; writeState(); }, 150);
}
function writeState() {
  if (memoryFallback) return;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); }
  catch (e) { memoryFallback = true; toast('Хранилище недоступно — записи не переживут перезагрузку.'); }
}

// ───────────────────────── Время / сумерки / цикл ─────────────────────────
function now() { return Date.now(); }
function isDusk() {
  var qh = S.settings.quietHours; if (!qh || !qh.enabled) return false;
  var d = new Date(now()), m = d.getHours() * 60 + d.getMinutes();
  return inQuietHours(m, qh) || inQuietHours((m + 60) % 1440, qh);
}

var lastTimerText = 0;
function frame(t) {
  // срыв камня: следим за ростом числа достигнутых вершин
  if (S.current.running && S.current.startTs) {
    var crests = crestCount(now() - S.current.startTs, CLIMB_MS, ROLLBACK_MS);
    if (crests > crestSeen) { crestSeen = crests; onCrest(); }
  }
  renderScene();
  if (t - lastTimerText > 250) { lastTimerText = t; updateMeta(); }
  requestAnimationFrame(frame);
}

// Таймер «ч:мм:сс» / «м:сс» — видимое время текущей сессии прокрастинации.
function fmtTimer(ms) {
  var s = Math.max(0, Math.floor(ms / 1000));
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
  return h > 0 ? (h + ':' + p2(m) + ':' + p2(ss)) : (m + ':' + p2(ss));
}
function updateMeta() {
  if (els.timer) {
    var on = S.current.running && S.current.startTs;
    els.timer.textContent = on ? fmtTimer(now() - S.current.startTs) : '0:00';
    els.timer.className = 'timer' + (on ? ' on' : '');
  }
  updateCheckinFooter();
}

// ───────────────────────── Пробуждение ─────────────────────────
function onWake() {
  // забытый таймер: авто-стоп после AUTO_STOP_MS
  if (S.current.running && S.current.startTs && (now() - S.current.startTs) > AUTO_STOP_MS) {
    stopRolling(true);
    toast(COPY.autoStop);
  }
  if (S.current.running && S.current.startTs) crestSeen = crestCount(now() - S.current.startTs, CLIMB_MS, ROLLBACK_MS);
  catchUpCheckin();
  scheduleSave();
}

// ───────────────────────── Запуск ─────────────────────────
function boot() {
  reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var raw = null;
  try { raw = localStorage.getItem(STORE_KEY); } catch (e) { memoryFallback = true; }
  S = loadState(raw, now());
  S.notif.permission = canNotify() ? Notification.permission : 'unsupported';

  // забытый таймер при старте
  if (S.current.running && S.current.startTs && (now() - S.current.startTs) > AUTO_STOP_MS) { /* остановим после buildUI */ }

  buildUI();

  if (S.current.running && S.current.startTs && (now() - S.current.startTs) > AUTO_STOP_MS) { stopRolling(true); toast(COPY.autoStop); }
  if (S.current.running && S.current.startTs) crestSeen = crestCount(now() - S.current.startTs, CLIMB_MS, ROLLBACK_MS);

  updateMeta();
  scheduleSave(true);

  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (els.sheet) { hideSheet(); return; }
    if (S.current.running) stopRolling();
  });

  document.addEventListener('visibilitychange', function () { if (!document.hidden) onWake(); });
  window.addEventListener('focus', onWake);
  window.addEventListener('pagehide', function () { scheduleSave(true); });
  if (window.matchMedia) { try { window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function (e) { reduceMotion = e.matches; }); } catch (e) {} }
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; });
  window.addEventListener('ps-sw-update', function () { toast('Доступно обновление — перезагрузи страницу.'); });

  if (canNotify() && Notification.permission === 'granted') catchUpCheckin();
  else scheduleCheckinTimer();
  updateCheckinFooter();

  requestAnimationFrame(frame);
}

function doInstall() { if (!deferredInstall) return; deferredInstall.prompt(); deferredInstall.userChoice.finally(function () { deferredInstall = null; hideSheet(); }); }

boot();
