// nextSkyLine.js — O-16: строка «Next sky» / «New sky in…» внизу итогового
// кадра раскрытой ночи.
//
// После пройденного неба игроку негде увидеть, куда идти дальше: кадр с
// картушем V-32 выглядит как конец игры. Внизу того же кадра — одна строка:
// «Next sky» (есть куда идти; тап открывает книгу на «Небесах», переход на
// небо игрок делает сам) или «New sky in N hours» (ждём новое небо дня,
// не нажимается). DOM-узел, не канвас: штатный <button>, замер рамки без
// своего хит-теста. Место под строку освобождает камера (резерв снизу,
// getCameraViewBand) — ни одной буквы поверх созвездий, правило V-32.

// Тапали ли по строке за эту вкладку — пока нет, активная строка дышит.
// В памяти, не в сейве (развилка 2 дока): после перезагрузки дышит снова.
let nextSkyLineTapped = false;
let nextSkyLineTimer = null;
// Последнее показанное состояние — для `__test.state().nextSkyLine` и чтобы
// не трогать DOM каждый кадр без причины.
let nextSkyLineState = { visible: false, mode: null, active: false, text: '', breathing: false, alpha: 0 };
let nextSkyLineFitKey = '';

/** Сколько px камера отдаёт снизу под строку — на любой раскрытой ночи, видна строка сейчас или нет. */
function getNextSkyLineReserve() {
    return typeof isCartoucheNight === 'function' && isCartoucheNight() ? NEXT_SKY_LINE_RESERVE_PX : 0;
}

/** Сегодняшнее небо дня пройдено: защёлка `daily.nightDone` на дате неба сегодня. */
function isTodayDailySkyDone() {
    const daily = typeof achievementCounters !== 'undefined' && achievementCounters
        ? achievementCounters.daily : null;
    if (!daily || !daily.nightDone) return false;
    return typeof getEffectiveSkyDateInt === 'function' && daily.date === getEffectiveSkyDateInt();
}

function hasAvailablePrologueLevel() {
    if (typeof getPrologueLevelState !== 'function') return false;
    for (let n = 1; n <= PROLOGUE_LEVEL_COUNT; n++) {
        if (getPrologueLevelState(n) === 'available') return true;
    }
    return false;
}

/**
 * 'next' | 'wait' — по таблице дока, первое подходящее. Ждём только когда
 * небо дня открыто и сегодня уже пройдено, а Пролог исчерпан; запертое
 * уровнем небо дня — тоже «Next sky»: «Небеса» покажут строку замка.
 */
function getNextSkyLineMode() {
    if (hasAvailablePrologueLevel()) return 'next';
    const unlocked = typeof isDailySkyUnlocked === 'function' && isDailySkyUnlocked();
    if (unlocked && isTodayDailySkyDone()) return 'wait';
    return 'next';
}

/** Правило показа: ночь с картушем, сцены нет, книга закрыта, тутора O-13 нет. */
function isNextSkyLineAllowed() {
    if (typeof isCartoucheNight !== 'function' || !isCartoucheNight()) return false;
    if (typeof isLevelFinaleActive === 'function' && isLevelFinaleActive()) return false;
    // Открытие книги (openBookAnimated) ставит bookOpen синхронно, до довода —
    // строка гаснет в момент начала открытия.
    if (typeof isBookOpen === 'function' && isBookOpen()) return false;
    if (typeof getFirstSkyStep === 'function' && getFirstSkyStep() !== 0) return false;
    return true;
}

function getNextSkyLineWaitText() {
    const ms = typeof msUntilNextSkyDay === 'function' ? msUntilNextSkyDay() : 0;
    return t('book.dawnIn') + ' ' + formatDawnDuration(ms);
}

function stopNextSkyLineTimer() {
    if (nextSkyLineTimer) {
        clearInterval(nextSkyLineTimer);
        nextSkyLineTimer = null;
    }
}

/** Тик ожидания, раз в минуту. На нуле — штатная смена дня, как у O-03. */
function tickNextSkyLine() {
    const ms = typeof msUntilNextSkyDay === 'function' ? msUntilNextSkyDay() : 0;
    if (ms <= 0) {
        stopNextSkyLineTimer();
        if (typeof checkSkyDateOnResume === 'function') checkSkyDateOnResume();
        return;
    }
    const el = document.getElementById('skyNextLine');
    if (el && nextSkyLineState.mode === 'wait') {
        nextSkyLineState.text = getNextSkyLineWaitText();
        el.textContent = nextSkyLineState.text;
        nextSkyLineFitKey = '';
    }
}

/**
 * Кегль ужимается до MIN, чтобы строка влезла в ширину между зонами ленты
 * (не переносится); не влезла и на минимуме — многоточие из CSS.
 */
function fitNextSkyLine(el) {
    const limit = Math.max(1, window.innerWidth - 2 * NEXT_SKY_LINE_SIDE_PX);
    const key = el.textContent + '|' + limit;
    if (key === nextSkyLineFitKey) return;
    nextSkyLineFitKey = key;
    el.style.maxWidth = limit + 'px';
    el.style.fontSize = NEXT_SKY_LINE_SIZE_PX + 'px';
    const w = el.scrollWidth;
    if (w > limit) {
        const size = Math.max(NEXT_SKY_LINE_MIN_SIZE_PX, Math.floor(NEXT_SKY_LINE_SIZE_PX * limit / w));
        el.style.fontSize = size + 'px';
    }
}

/**
 * Зовётся из draw() каждый кадр (и в обсерватории — там строка гаснет).
 * Текст «Next sky» берётся из локали каждый раз (смена языка), текст ожидания
 * пересчитывается на входе в режим и тиком.
 */
function updateNextSkyLine() {
    const el = document.getElementById('skyNextLine');
    if (!el) return;
    const allowed = isNextSkyLineAllowed();
    const alpha = allowed && typeof getCartoucheAlpha === 'function' ? getCartoucheAlpha() : 0;
    const visible = allowed && alpha > 0;
    const prev = nextSkyLineState;
    if (!visible) {
        stopNextSkyLineTimer();
        if (prev.visible || !el.hidden) {
            el.hidden = true;
            el.classList.remove('is-breathing');
        }
        nextSkyLineState = { visible: false, mode: allowed ? getNextSkyLineMode() : null,
            active: false, text: '', breathing: false, alpha };
        return;
    }
    const mode = getNextSkyLineMode();
    const active = mode === 'next';
    let text;
    if (active) text = t('sky.nextSky');
    else if (prev.visible && prev.mode === 'wait') text = prev.text;
    else text = getNextSkyLineWaitText();
    const breathing = active && !nextSkyLineTapped
        && !(typeof prefersReducedMotion === 'function' && prefersReducedMotion());

    el.hidden = false;
    if (el.textContent !== text) el.textContent = text;
    el.classList.toggle('is-wait', !active);
    el.classList.toggle('is-breathing', breathing);
    // Активная — кнопка; ожидание — просто строка текста.
    if (active) {
        el.setAttribute('role', 'button');
        el.removeAttribute('aria-disabled');
        el.tabIndex = 0;
    } else {
        el.removeAttribute('role');
        el.setAttribute('aria-disabled', 'true');
        el.removeAttribute('tabindex');
    }
    const op = String(Math.round(alpha * 1000) / 1000);
    if (el.style.opacity !== op) el.style.opacity = op;
    fitNextSkyLine(el);

    if (mode === 'wait') {
        if (!nextSkyLineTimer) nextSkyLineTimer = setInterval(tickNextSkyLine, BOOK_DAWN_TICK_MS);
    } else {
        stopNextSkyLineTimer();
    }
    nextSkyLineState = { visible: true, mode, active, text, breathing, alpha };
}

/** Тап: книга на «Небесах» тем же доводом, что тап по ленте. Ожидание тап глотает. */
function onNextSkyLineActivate(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    const st = nextSkyLineState;
    if (!st.visible || !st.active || st.alpha <= 0) return;
    if (typeof isBookOpen === 'function' && isBookOpen()) return;
    nextSkyLineTapped = true;
    if (typeof initAudio === 'function') initAudio();
    openBookAnimated('calendar');
    // Тап по строке — открытие книги: зов O-10 больше не нужен.
    if (typeof markFirstBookOpenDone === 'function') markFirstBookOpenDone();
    updateNextSkyLine();
}

function setupNextSkyLine() {
    const el = document.getElementById('skyNextLine');
    if (!el) return;
    el.addEventListener('click', onNextSkyLineActivate);
    el.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') onNextSkyLineActivate(event);
    });
    // Неактивная строка не пропускает касания под себя (поле, лента).
    const swallow = (event) => event.stopPropagation();
    el.addEventListener('pointerdown', swallow);
    el.addEventListener('touchstart', swallow, { passive: true });
}

/** Харнесс: срез для `__test.state().nextSkyLine`. */
function getNextSkyLineTestState() {
    // Свежий срез, а не прошлый кадр: харнесс зовёт state() сразу после
    // reset()/closeBook(), не дожидаясь draw().
    updateNextSkyLine();
    const st = nextSkyLineState;
    return {
        visible: st.visible,
        mode: st.visible ? st.mode : null,
        active: st.visible && st.active,
        text: st.visible ? st.text : '',
        breathing: st.visible && st.breathing,
        tickActive: !!nextSkyLineTimer
    };
}
