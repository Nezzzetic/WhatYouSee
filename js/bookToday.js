// bookToday.js — страница «Сегодня»: новости мира, состояние ночи, до рассвета O-03 (R-05).

/** «Сегодня»: ежедневка — то же достижение на две ступени, что и штампы (REWARD_PAGES[0]). */
function renderBookToday() {
    const list = document.getElementById('bookTodayList');
    if (list) {
        list.innerHTML = '';
        for (const chain of getRewardPageChains(0)) {
            list.appendChild(createAchievementRow(chain));
        }
    }
    renderBookTodayDawn();
    renderBookTodayNews();
    renderBookTodayState();
}

/**
 * K-09: события мира обычной строкой — единственное место, где игра рассказывает
 * новости. Список ведётся за текущую ночь (`achievementCounters.daily.newsLog`)
 * и переписывается наутро вместе с сутками; до первого события список пуст —
 * это нормальная пустая ночь, не сломанная вёрстка (риск 3 дока).
 */
function renderBookTodayNews() {
    const el = document.getElementById('bookTodayNews');
    if (!el) return;
    el.innerHTML = '';
    const daily = (achievementCounters && achievementCounters.daily) || null;
    const log = daily && Array.isArray(daily.newsLog) ? daily.newsLog : [];
    for (const entry of log) {
        const row = document.createElement('div');
        row.className = 'book-news-row';
        row.textContent = t(entry.key, entry.params);
        el.appendChild(row);
    }
}

/**
 * K-17: две строки состояния страницы — сколько звёзд на небе ещё не соединено
 * и что заложено закладкой. В концепте они стоят на «Сегодня» рядом с событиями
 * ночи, но событиями не являются: в `newsLog` не пишутся, в сейв не идут и
 * считаются заново на каждом рендере — поэтому и блок у них свой.
 *
 * Номер главы здесь арабский (`book.todayBookmark`) — это отсылка к главе
 * внутри предложения, не заголовок; римской цифрой (K-19) набираются только
 * надзаголовок разворота и строка оглавления.
 */
function renderBookTodayState() {
    const el = document.getElementById('bookTodayState');
    if (!el) return;
    el.innerHTML = '';

    const addRow = (text) => {
        const row = document.createElement('div');
        row.className = 'book-state-row';
        row.textContent = text;
        el.appendChild(row);
    };

    // O-03: на доигранной ночи звёзды остаются (часть подавлена, часть погашена —
    // M-07), просто пар для них больше нет; «ещё не соединено N звёзд» про такое
    // небо врёт, поэтому строка снимается, а не дополняется.
    const nightComplete = typeof isLevelComplete === 'function' && isLevelComplete();
    if (!nightComplete) {
        const free = typeof getPlayableStars === 'function' ? getPlayableStars().length : 0;
        addRow(tp('book.todayStarsLeft', free));
    }

    const shapeId = typeof getBookmarkedShape === 'function' ? getBookmarkedShape() : null;
    if (!shapeId) return; // закладки нет — строки тоже нет, пустой строкой не занимаем
    const name = getDisplayShapeName(shapeId);
    const pattern = typeof SHAPE_PATTERNS !== 'undefined' ? SHAPE_PATTERNS[shapeId] : null;
    const starCount = pattern && Array.isArray(pattern.stars) ? pattern.stars.length : 0;
    const chapter = typeof getAtlasPageForShape === 'function' ? getAtlasPageForShape(shapeId) : -1;
    // Закладку ставят с карточки разворота, то есть у фигуры всегда есть и
    // чертёж, и глава; страховка — на случай закладки из будущего источника.
    if (starCount > 0 && chapter >= 0) {
        addRow(tp('book.todayBookmark', starCount, { name, ch: chapter + 1 }));
    } else {
        addRow(t('book.todayBookmarkPlain', { name }));
    }
}

// =============================================================================
// O-03: КОНЕЦ НОЧИ — ТОЛЬКО КНИГА, «СЕГОДНЯ»
// =============================================================================
// Небо молчит (решение заказчика: K-15 не отменяется, тоста не будет). Блок
// стоит на «Сегодня» сразу после ежедневки и виден только на доигранной ночи —
// F5 на уже завершённом небе его не прячет (это состояние, а не сцена V-13).

/** Чистая: ms до ближайшего начала суток неба — M-09, местные 05:00 (`SKY_DAY_START_HOUR`), а не полночь. До этого часа цель сегодняшняя, после — завтрашняя, ровно как у `getLocalCalendarSkyDateInt()`. Dev-офсет/харнесс-дата на замер не влияют — считается от настоящих часов устройства, локальный конструктор `new Date(y, m, d, h)` сам переживает переход на летнее время. */
function msUntilNextSkyDay() {
    const now = new Date();
    const startHour = typeof SKY_DAY_START_HOUR === 'number' ? SKY_DAY_START_HOUR : 0;
    const dayShift = now.getHours() < startHour ? 0 : 1;
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayShift, startHour);
    return next.getTime() - now.getTime();
}

/**
 * Чистая: ms → целые часы до границы, округление ВНИЗ — не обещать больше
 * времени, чем реально осталось (1ч59м не станет «2 часа»). `lessThanHour`
 * отдельным флагом, а не проверкой `hours === 0`, чтобы вызывающий код читался
 * как решение о тексте, а не как арифметика.
 */
function computeDawnHours(ms) {
    const hours = Math.max(0, Math.floor(ms / 3600000));
    return { hours, lessThanHour: hours < 1 };
}

/** ms → локализованная фраза «N hours» / «1 hour» / «less than an hour» (правка по живому фидбеку — было ЧЧ:ММ). */
function formatDawnDuration(ms) {
    const { hours, lessThanHour } = computeDawnHours(ms);
    return lessThanHour ? t('book.dawnLessHour') : tp('book.dawnHours', hours, { n: hours });
}

let bookTodayDawnTimer = null;

function stopBookTodayDawnTimer() {
    if (bookTodayDawnTimer) {
        clearInterval(bookTodayDawnTimer);
        bookTodayDawnTimer = null;
    }
}

/** Тик и первая отрисовка. На нуле сам закрывает себя и дёргает штатную смену дня — только на доигранном поле, где терять нечего. */
function updateBookTodayDawnText() {
    const clockEl = document.getElementById('bookTodayDawnClock');
    if (!clockEl) return;
    const ms = msUntilNextSkyDay();
    if (ms <= 0) {
        stopBookTodayDawnTimer();
        if (typeof checkSkyDateOnResume === 'function') checkSkyDateOnResume();
        return;
    }
    clockEl.textContent = formatDawnDuration(ms);
}

/**
 * Идемпотентна: `refreshBookIfOpen()` зовут из мест, не связанных с концом
 * ночи (забор марки, `afterAchievementStateChanged`), и повторный вызов не
 * должен ни ронять уже идущий интервал, ни плодить второй — только менять
 * видимость блока при смене состояния (например, откат последнего созвездия
 * вернул ночь из «доиграна» в «играется»).
 */
function renderBookTodayDawn() {
    const el = document.getElementById('bookTodayDawn');
    if (!el) return;
    const complete = typeof isLevelComplete === 'function' && isLevelComplete();
    el.hidden = !complete;
    if (!complete) {
        stopBookTodayDawnTimer();
        return;
    }
    updateBookTodayDawnText();
    if (!bookTodayDawnTimer) {
        bookTodayDawnTimer = setInterval(updateBookTodayDawnText, BOOK_DAWN_TICK_MS);
    }
}

// Вкладка ушла в фон — тик не нужен, пока его не видно; страница вернулась —
// досчитать заново тем же путём, что и обычный рендер книги.
if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopBookTodayDawnTimer();
        } else {
            refreshBookIfOpen();
        }
    });
}
