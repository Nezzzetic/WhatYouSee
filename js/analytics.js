// analytics.js — P-05: минимальная продуктовая аналитика.
//
// ГЛАВНОЕ ПРАВИЛО: с сетью и без сети игра ведёт себя одинаково. Отсюда всё
// устройство модуля:
//
//   • внешнего скрипта не подключается — только `fetch` на эндпоинт приёма.
//     Упавший или недоступный сервис не может помешать игре стартовать
//     в принципе: ему просто нечего у нас блокировать;
//   • модуль не стоит на игровом пути — ни одного `await`, всё в `try/catch`,
//     любая отправка fire-and-forget с проглоченной ошибкой;
//   • не доехавшее копится очередью в localStorage и уезжает следующим
//     запуском: ночь, сыгранная в самолёте, не теряется;
//   • ПУСТОЙ `host` = модуль инертен целиком. Ни запроса, ни очереди, ни
//     обработчиков, ни таймера. Так живёт `main` — у Pages и itch внешних
//     запросов ноль, и это утверждение проверяется машиной
//     (`verify-book-system.js`, AC1). Настоящий адрес подставляется только
//     при сборке APK (`scripts/build-www.js`, ветка `capacitor`).
//
// ЧЕГО ЗДЕСЬ НЕТ И БЫТЬ НЕ ДОЛЖНО: вмешательства в игровую логику. Модуль
// только ЧИТАЕТ готовые геттеры — ни одна игровая функция ради аналитики не
// изменена и не обёрнута. Вехи воронки ловятся редким таймером (раз в 10 с),
// а не хуками в `awardMetaScore` или в коммите созвездия: цена — задержка
// в пару секунд у события, которое случается один раз за всю жизнь игрока,
// выгода — нулевой риск сломать механику.
//
// ЧТО УХОДИТ: см. `snapshot()` — два десятка чисел, уже лежащих в сейве, плюс
// модель устройства и версия сборки. Ни текста, ни координат, ни имён фигур,
// ни чего-либо введённого игроком. `pid` — тот же анонимный локальный
// идентификатор, что игра генерит себе с самого начала (`ensurePlayerId`).
// Список полей — источник истины для страницы политики (P-06).
//
// ВЫКЛЮЧАТЕЛЬ: страница настроек книги (K-14). Выключен — не уходит ничего,
// включая ошибки, и очередь не копится.

(function () {
    'use strict';

    // >>> P-05 CONFIG — блок целиком подменяется scripts/build-www.js при сборке APK.
    // Маркеры трогать нельзя: по ним же verify-analytics.js проверяет, что на
    // `main` адрес действительно пуст и утечь не может.
    const CONFIG = { host: '', key: '', channel: 'web', build: 'src' };
    // <<< P-05 CONFIG

    const STATE_KEY = 'starsReborn_analytics_v01';
    // Очередь — страховка от офлайна, а не архив: двадцати записей хватает на
    // несколько несетевых дней, а localStorage делится с небом (200–280 звёзд).
    const QUEUE_MAX = 20;
    // Исключение внутри draw() повторяется 60 раз в секунду. Кап и дедуп по
    // тексту — главная защита эндпоинта и трафика игрока.
    const ERRORS_PER_SESSION_MAX = 3;
    const MILESTONE_POLL_MS = 10000;
    const STACK_MAX = 500;

    let state = null;
    let sessionStartMs = 0;
    let errorsSent = 0;
    const errorSeen = new Set();
    const pendingErrors = [];
    let sending = false;
    let pollTimer = 0;
    let started = false;

    // =========================================================================
    // ГОТОВНОСТЬ
    // =========================================================================

    /** Настроен ли модуль вообще. Пустой host — штатное состояние `main`. */
    function configured() {
        return !!(CONFIG.host && CONFIG.key);
    }

    /** Настроен И разрешён игроком. Второе условие живёт на странице настроек. */
    function allowed() {
        if (!configured()) return false;
        try {
            return typeof isAnalyticsEnabled !== 'function' || isAnalyticsEnabled();
        } catch (e) {
            return false;
        }
    }

    // =========================================================================
    // СОСТОЯНИЕ МОДУЛЯ (свой ключ, сейв игры не трогает)
    // =========================================================================

    function defaultState() {
        return { first: 0, last: 0, days: 0, sess: 0, sent: [], queue: [] };
    }

    /**
     * ⚠ Этот блок НЕ гасится ни полным сбросом прогресса, ни `__test.reset()`.
     * Иначе один тестер, сбросивший прогресс трижды, выглядел бы тремя
     * новичками, и удержание считалось бы по выдумке.
     */
    function loadState() {
        const s = defaultState();
        try {
            const raw = localStorage.getItem(STATE_KEY);
            if (!raw) return s;
            const d = JSON.parse(raw) || {};
            s.first = Math.max(0, Number(d.first) || 0);
            s.last = Math.max(0, Number(d.last) || 0);
            s.days = Math.max(0, Number(d.days) || 0);
            s.sess = Math.max(0, Number(d.sess) || 0);
            s.sent = Array.isArray(d.sent) ? d.sent.filter(x => typeof x === 'string') : [];
            s.queue = Array.isArray(d.queue) ? d.queue.slice(-QUEUE_MAX) : [];
        } catch (e) { /* повреждённый блок — начинаем заново, игре это безразлично */ }
        return s;
    }

    function saveState() {
        try {
            localStorage.setItem(STATE_KEY, JSON.stringify(state));
        } catch (e) { /* квота или приватный режим — молча живём без очереди */ }
    }

    // =========================================================================
    // СНИМОК
    // =========================================================================

    function today() {
        try {
            return typeof getEffectiveSkyDateInt === 'function' ? getEffectiveSkyDateInt() : 0;
        } catch (e) {
            return 0;
        }
    }

    function counters() {
        return (typeof achievementCounters !== 'undefined' && achievementCounters) ? achievementCounters : null;
    }

    function int(v) {
        const n = Math.floor(Number(v));
        return Number.isFinite(n) && n > 0 ? n : 0;
    }

    /**
     * Модель устройства и версия Android — ради вёрстки и разбора ошибок.
     * Сырой User-Agent не уходит намеренно: он заметно приметнее пары
     * «модель + версия», а отвечает на вопросы ровно так же.
     */
    function deviceLabel() {
        const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
        const m = ua.match(/Android\s+([\d.]+);\s*([^;)]+?)(?:\s+Build\/[^;)]*)?\)/);
        if (m) return (m[2].trim() + ' / Android ' + m[1]).slice(0, 64);
        if (/Windows/.test(ua)) return 'Windows';
        if (/Macintosh|Mac OS X/.test(ua)) return 'macOS';
        if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
        if (/Linux/.test(ua)) return 'Linux';
        return 'other';
    }

    /** 0 — ни одной линии, 1 — соединил, но тутор не закрыт, 2 — тутор закрыт. */
    function tutorStage() {
        const ac = counters();
        if (!ac) return 0;
        try {
            if (typeof isTutorialDone === 'function' && isTutorialDone()) return 2;
        } catch (e) { /* ignore */ }
        return (ac.totalConstellations || 0) >= 1 ? 1 : 0;
    }

    function safe(fn, fallback) {
        try {
            const v = fn();
            return v === undefined ? fallback : v;
        } catch (e) {
            return fallback;
        }
    }

    /**
     * Полный список того, что уходит наружу. Других полей в отправке нет —
     * это проверяется статикой в verify-analytics.js и переносится дословно
     * на страницу политики (P-06).
     */
    function snapshot() {
        const ac = counters() || {};
        const scr = (typeof window !== 'undefined' && window.screen) || {};
        return {
            ch: CONFIG.channel,
            build: CONFIG.build,
            lang: safe(() => (typeof getLocale === 'function' ? getLocale() : ''), ''),
            dev: deviceLabel(),
            scr: (scr.width || 0) + 'x' + (scr.height || 0) + '@' + (window.devicePixelRatio || 1),
            day: today(),
            first: state.first,
            days: state.days,
            sess: state.sess,
            tut: tutorStage(),
            onb: int(ac.onboardingFieldsShown),
            nights: int(ac.levelsCompleted),
            cons: int(ac.totalConstellations),
            shapes: (typeof createdShapes !== 'undefined' && createdShapes) ? createdShapes.size : 0,
            pages: (typeof unlockedPageIndices !== 'undefined' && unlockedPageIndices) ? unlockedPageIndices.size : 0,
            meta: safe(() => (typeof getLifetimeMetaEarned === 'function' ? getLifetimeMetaEarned() : 0), 0),
            obs: safe(() => ((typeof isObservatoryUnlocked === 'function' && isObservatoryUnlocked()) ? 1 : 0), 0),
            book: ac.bookFirstOpenDone ? 1 : 0,
            q: safe(() => (typeof deriveDailyStepIndex === 'function' ? deriveDailyStepIndex() : 0), 0),
            snd: safe(() => ((typeof isSoundEnabled === 'function' && isSoundEnabled()) ? 1 : 0), 0),
            hap: safe(() => ((typeof isHapticEnabled === 'function' && isHapticEnabled()) ? 1 : 0), 0)
        };
    }

    // =========================================================================
    // ВЕХИ ВОРОНКИ
    // =========================================================================

    /**
     * Семь шагов пути новичка, каждый — один раз за всю жизнь игрока.
     * Все выводятся из уже существующего состояния, своих счётчиков не заводят.
     * Порядок в массиве = порядок в воронке.
     */
    const MILESTONES = [
        { id: 'first_line', reached: ac => (ac.totalConstellations || 0) >= 1 },
        { id: 'tutorial_done', reached: () => typeof isTutorialDone === 'function' && isTutorialDone() },
        { id: 'night_completed', reached: ac => (ac.levelsCompleted || 0) >= 1 },
        { id: 'book_opened', reached: ac => !!ac.bookFirstOpenDone },
        { id: 'first_claim', reached: () => typeof getLifetimeMetaEarned === 'function' && getLifetimeMetaEarned() > 0 },
        // Глава I бесплатна и открыта с первого запуска (B-04), поэтому разрез
        // засчитывается со ВТОРОЙ страницы — первая ничего не говорит об игроке.
        { id: 'page_cut', reached: () => typeof unlockedPageIndices !== 'undefined' && !!unlockedPageIndices && unlockedPageIndices.size >= 2 },
        { id: 'observatory', reached: () => typeof isObservatoryUnlocked === 'function' && isObservatoryUnlocked() }
    ];

    function checkMilestones() {
        if (!allowed() || !state) return;
        const ac = counters();
        if (!ac) return;
        let hit = false;
        for (const m of MILESTONES) {
            if (state.sent.indexOf(m.id) !== -1) continue;
            let ok = false;
            try { ok = !!m.reached(ac); } catch (e) { ok = false; }
            if (!ok) continue;
            state.sent.push(m.id);
            enqueue(m.id);
            hit = true;
        }
        if (hit) { saveState(); flush(); }
    }

    // =========================================================================
    // ОТПРАВКА
    // =========================================================================

    function uuid() {
        try {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        } catch (e) { /* ignore */ }
        return 'e_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }

    function distinctId() {
        try {
            if (typeof ensurePlayerId === 'function') return ensurePlayerId();
        } catch (e) { /* ignore */ }
        return 'unknown';
    }

    function buildEvent(name, extra) {
        const props = snapshot();
        if (extra) Object.assign(props, extra);
        // Person properties: последнее известное состояние игрока. Отсюда
        // строятся графики прогресса, не трогая события.
        props['$set'] = {
            ch: props.ch, build: props.build, dev: props.dev, lang: props.lang,
            tut: props.tut, nights: props.nights, cons: props.cons,
            shapes: props.shapes, pages: props.pages, meta: props.meta,
            obs: props.obs, book: props.book, days: props.days, first: props.first
        };
        return {
            uuid: uuid(),
            event: name,
            distinct_id: distinctId(),
            properties: props,
            timestamp: new Date().toISOString()
        };
    }

    function enqueue(name, extra) {
        if (!allowed() || !state) return null;
        let ev = null;
        try { ev = buildEvent(name, extra); } catch (e) { return null; }
        state.queue.push(ev);
        // Переполнение выбрасывает САМЫЕ СТАРЫЕ: свежее состояние игрока
        // ценнее позавчерашнего, а вехи всё равно продублируются снимком.
        if (state.queue.length > QUEUE_MAX) state.queue = state.queue.slice(-QUEUE_MAX);
        return ev;
    }

    function flush() {
        if (!allowed() || !state || sending || !state.queue.length) return;
        const batch = state.queue.slice();
        sending = true;
        let done = false;
        const settle = ok => {
            if (done) return;
            done = true;
            sending = false;
            if (!ok) return;
            // Удаляем ровно отправленное: за время запроса очередь могла
            // подрасти новой вехой или ошибкой.
            state.queue = state.queue.slice(batch.length);
            saveState();
        };
        try {
            fetch(CONFIG.host + '/batch/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: CONFIG.key, batch: batch }),
                keepalive: true
            }).then(res => settle(!!(res && res.ok))).catch(() => settle(false));
        } catch (e) {
            settle(false);
        }
    }

    /**
     * Закрытие сессии. Единственное, что есть только здесь, — длительность:
     * всё остальное состояние переснимется при следующем запуске, поэтому
     * очередь этим путём НЕ отправляется и не чистится. Beacon не доехал —
     * потеряна одна цифра, а не данные.
     */
    function sendClose() {
        if (!allowed() || !state) return;
        let body = '';
        try {
            const dur = Math.max(0, Math.round((Date.now() - sessionStartMs) / 1000));
            body = JSON.stringify({ api_key: CONFIG.key, batch: [buildEvent('night_close', { dur: dur })] });
        } catch (e) {
            return;
        }
        try {
            // text/plain намеренно: с application/json beacon потребовал бы
            // preflight, которого он делать не умеет, и молча не ушёл бы.
            const blob = new Blob([body], { type: 'text/plain' });
            if (navigator.sendBeacon && navigator.sendBeacon(CONFIG.host + '/batch/', blob)) return;
        } catch (e) { /* ignore */ }
        try {
            fetch(CONFIG.host + '/batch/', { method: 'POST', body: body, keepalive: true }).catch(() => {});
        } catch (e) { /* ignore */ }
    }

    // =========================================================================
    // ОШИБКИ
    // =========================================================================

    function reportError(msg, src, line, stack) {
        if (!allowed()) return;
        if (errorsSent >= ERRORS_PER_SESSION_MAX) return;
        const key = String(msg).slice(0, 120) + '|' + String(line || '');
        if (errorSeen.has(key)) return;
        errorSeen.add(key);
        errorsSent++;
        enqueue('js_error', {
            msg: String(msg).slice(0, 300),
            src: String(src || '').slice(0, 200),
            line: int(line),
            stack: String(stack || '').slice(0, STACK_MAX)
        });
        saveState();
        flush();
    }

    function handleRawError(rec) {
        if (started) reportError(rec.msg, rec.src, rec.line, rec.stack);
        else if (pendingErrors.length < ERRORS_PER_SESSION_MAX) pendingErrors.push(rec);
    }

    let errorReporterInstalled = false;

    function installErrorReporter() {
        if (errorReporterInstalled || typeof window === 'undefined') return;
        errorReporterInstalled = true;
        window.addEventListener('error', function (e) {
            handleRawError({
                msg: (e && (e.message || (e.error && e.error.message))) || 'error',
                src: e && e.filename,
                line: e && e.lineno,
                stack: e && e.error && e.error.stack
            });
        });
        window.addEventListener('unhandledrejection', function (e) {
            const r = e && e.reason;
            handleRawError({
                msg: (r && r.message) || String(r || 'unhandledrejection'),
                src: '',
                line: 0,
                stack: r && r.stack
            });
        });
    }

    // =========================================================================
    // ЖИЗНЕННЫЙ ЦИКЛ
    // =========================================================================

    /** Зовётся из setup() ПОСЛЕ loadProgression(): нужен playerId и счётчики. */
    function startAnalytics() {
        if (started || !configured()) return;
        started = true;
        sessionStartMs = Date.now();
        state = loadState();

        const d = today();
        state.sess += 1;
        if (!state.first) state.first = d;
        // «Сколько разных суток игрок открывал игру» — из этого и `first`
        // считается удержание, без серверной склейки сессий.
        if (state.last !== d) { state.days += 1; state.last = d; }
        saveState();

        if (!allowed()) return;

        // Очередь прошлых заходов уезжает вместе с первым событием этого.
        enqueue('night_open');
        while (pendingErrors.length) {
            const r = pendingErrors.shift();
            reportError(r.msg, r.src, r.line, r.stack);
        }
        // Вехи, взятые до этого запуска, уходят разом — иначе игрок с
        // прогрессом никогда бы не попал в воронку.
        checkMilestones();
        saveState();
        flush();

        pollTimer = setInterval(checkMilestones, MILESTONE_POLL_MS);

        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') sendClose();
        });
        window.addEventListener('pagehide', sendClose);
    }

    if (configured()) installErrorReporter();

    window.startAnalytics = startAnalytics;

    // =========================================================================
    // ХАРНЕСС (T-01): только при ?test=1, как и testApi.js
    // =========================================================================

    try {
        if (new URLSearchParams(window.location.search).get('test') === '1') {
            window.__analytics = {
                config: function () { return Object.assign({}, CONFIG); },
                state: function () { return state ? JSON.parse(JSON.stringify(state)) : null; },
                snapshot: function () { return state ? snapshot() : null; },
                milestones: function () { return MILESTONES.map(function (m) { return m.id; }); },
                errorsSent: function () { return errorsSent; },
                flush: flush,
                close: sendClose,
                poll: checkMilestones,
                start: startAnalytics,
                /** Подменяет адрес приёма, чтобы проверить отправку без живого эндпоинта. */
                configure: function (next) {
                    Object.assign(CONFIG, next || {});
                    installErrorReporter();
                },
                reset: function () {
                    try { localStorage.removeItem(STATE_KEY); } catch (e) { /* ignore */ }
                    state = null;
                    started = false;
                    errorsSent = 0;
                    errorSeen.clear();
                    pendingErrors.length = 0;
                    if (pollTimer) { clearInterval(pollTimer); pollTimer = 0; }
                }
            };
        }
    } catch (e) { /* ignore */ }
}());
