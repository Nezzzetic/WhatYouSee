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

// U-38: строку про закладку (`book.todayBookmark`/`book.todayBookmarkPlain`)
// заказчик снял отдельной правкой — сама закладка (булавка на карточке
// атласа, чертёж в углу неба, K-11) не трогалась, ушла только эта отметка.
//
// O-11: мелкая строка «ещё не соединено N звёзд» (K-17, `renderBookTodayState`,
// `#bookTodayState`) снята вместе с ключом `book.todayStarsLeft` целиком — тот
// же факт теперь крупно стоит в `#bookTodayDawn` (см. ниже), один факт в одном
// месте, а не в двух кеглях сразу.

// =============================================================================
// O-03/O-11: «СЕГОДНЯ» — СЧЁТ ДО КОНЦА НОЧИ ИЛИ ДО СЛЕДУЮЩЕЙ
// =============================================================================
// Небо молчит (решение заказчика: K-15 не отменяется, тоста не будет). Блок
// `#bookTodayDawn` стоит на «Сегодня» сразу после ежедневки и виден **всегда**
// (O-11 сняла `hidden` по `isLevelComplete()`) — у него два состояния: ночь
// играется — крупный счёт соединимых звёзд, доиграна — ожидание нового неба,
// как раньше (O-03).

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

/** Тик и первая отрисовка ожидания. На нуле сам закрывает себя и дёргает штатную смену дня — только на доигранном поле, где терять нечего. */
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
 * O-11: число «осталось звёзд» кладём в `.book-dawn-clock` в одиночестве, а
 * слова вокруг него — в `.book-dawn-label` до и после (порядок слов у числа
 * в локалях разный: «{n} stars left» против «Осталось {n} звёзд»). `tp()`
 * этого не даёт — она уже подставляет число внутрь готовой строки, поэтому
 * шаблон плюральной формы берём напрямую и режем по литералу «{n}» сами.
 */
function splitPluralAroundN(key, n) {
    const entry = typeof lookupI18nEntry === 'function' ? lookupI18nEntry(key) : null;
    let template = key;
    if (entry !== null && entry !== undefined) {
        if (typeof entry === 'object') {
            const category = getI18nPluralRules().select(Number(n));
            template = entry[category] || entry.other || entry.many || entry.few || entry.one || '';
        } else {
            template = entry;
        }
    }
    const idx = template.indexOf('{n}');
    if (idx < 0) return { before: template, after: '' };
    return { before: template.slice(0, idx).trim(), after: template.slice(idx + 3).trim() };
}

/** Пишет три узла блока разом — общая точка и для счёта звёзд, и для ожидания. */
function setBookTodayDawnParts(before, clock, after) {
    const beforeEl = document.getElementById('bookTodayDawnBefore');
    const clockEl = document.getElementById('bookTodayDawnClock');
    const afterEl = document.getElementById('bookTodayDawnAfter');
    if (beforeEl) { beforeEl.textContent = before || ''; beforeEl.hidden = !before; }
    if (clockEl) clockEl.textContent = clock;
    if (afterEl) { afterEl.textContent = after || ''; afterEl.hidden = !after; }
}

/**
 * Ночь играется: крупно число соединимых звёзд (`getConnectableStarIds`,
 * O-11) — не всех играбельных, чтобы счёт доходил ровно до нуля в момент
 * конца ночи и не врал про звёзды, которым пары уже нет.
 */
function renderDawnStarsLeft() {
    stopBookTodayDawnTimer();
    const n = typeof getConnectableStarIds === 'function' ? getConnectableStarIds().size : 0;
    const { before, after } = splitPluralAroundN('book.starsLeft', n);
    setBookTodayDawnParts(before, String(n), after);
}

/** Ночь доиграна: часы до следующей — прежнее поведение O-03, тик раз в минуту. */
function renderDawnCountdown() {
    setBookTodayDawnParts(t('book.dawnIn'), '', '');
    updateBookTodayDawnText();
    if (!bookTodayDawnTimer) {
        bookTodayDawnTimer = setInterval(updateBookTodayDawnText, BOOK_DAWN_TICK_MS);
    }
}

/**
 * Идемпотентна: `refreshBookIfOpen()` зовут из мест, не связанных с концом
 * ночи (коммит/откат, забор марки, `afterAchievementStateChanged`), и
 * повторный вызов не должен ни ронять уже идущий интервал, ни плодить
 * второй — только переключать состояние (например, откат последнего
 * созвездия вернул ночь из «доиграна» в «играется», и счёт звёзд сменяет
 * собой ожидание). Блок больше не прячется целиком — `hidden` по
 * `isLevelComplete()` снят вместе со второй строкой (O-11).
 */
function renderBookTodayDawn() {
    const el = document.getElementById('bookTodayDawn');
    if (!el) return;
    const complete = typeof isLevelComplete === 'function' && isLevelComplete();
    if (complete) {
        renderDawnCountdown();
    } else {
        renderDawnStarsLeft();
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
