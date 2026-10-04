// bookCalendar.js — страница «Календарь» (S-06): сетка текущего месяца по дате
// неба, сегодня — живая клетка, остальные числа месяца — серые, не нажимаются.
//
// «Сегодня» берётся только у неба — getEffectiveSkyDateInt() (сутки с 05:00,
// M-09, плюс dev-смещение и харнесс). Своих часов страница не читает: с 00:00
// до 05:00 клетка «сегодня» несёт вчерашнее число, на 1-е в эти часы сетка
// ещё прошлого месяца.
//
// Контракт клетки (для S-07): клетка, за которой стоит небо, несёт data-slot —
// id слота S-05; data-selected="true" — у клетки активного слота
// (getActiveSkySlotId()), не у «клетки сегодня». Над сеткой — полоса Пролога
// (S-07) с тем же контрактом клетки.

function calendarDateParts(dateInt) {
    return {
        y: Math.floor(dateInt / 10000),
        m: Math.floor((dateInt % 10000) / 100),
        d: dateInt % 100
    };
}

function calendarDateInt(y, m, d) {
    return y * 10000 + m * 100 + d;
}

function getCalendarIntlLocale() {
    return getLocale() === 'ru' ? 'ru' : 'en-US';
}

/** «October 2026» / «Октябрь 2026»: месяц словом в именительном, год числом. */
function formatCalendarMonthTitle(y, m) {
    let month = '';
    try {
        month = new Intl.DateTimeFormat(getCalendarIntlLocale(), { month: 'long' }).format(new Date(y, m - 1, 1));
    } catch (e) {
        month = String(m).padStart(2, '0');
    }
    return month.charAt(0).toLocaleUpperCase(getCalendarIntlLocale()) + month.slice(1) + ' ' + y;
}

/** Заголовок дней недели с понедельника (в обеих локалях) — Intl, не словарь. */
function getCalendarWeekdayLabels() {
    const labels = [];
    for (let i = 0; i < 7; i++) {
        // 1 января 2024 — понедельник.
        const date = new Date(2024, 0, 1 + i);
        let s = '';
        try {
            s = new Intl.DateTimeFormat(getCalendarIntlLocale(), { weekday: 'short' }).format(date);
        } catch (e) {
            s = String(i + 1);
        }
        labels.push(s.replace('.', ''));
    }
    return labels;
}

/**
 * Модель сетки — чистая от DOM, её же отдаёт харнесс `__test.calendar()`.
 * Состояния клетки: `today` · `past` (до сегодня) · `future` (после) ·
 * `none` (пустое место сетки до 1-го и после последнего числа). Число стоит
 * у каждого дня месяца; всё, кроме сегодня, — серое и не нажимается
 * (правка S-06 после устройства). firstSkyDate сетку больше не ограничивает —
 * поле живёт в сейве и отдаётся в модели как есть.
 */
function getCalendarModel() {
    const today = getEffectiveSkyDateInt();
    const first = typeof getFirstSkyDate === 'function' ? getFirstSkyDate() : 0;
    const { y, m, d: todayD } = calendarDateParts(today);
    const daysInMonth = new Date(y, m, 0).getDate();
    // Понедельник — первый столбец: getDay() 0 (вс) → 6.
    const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
    const todaySlot = typeof getTodaySkySlotId === 'function' ? getTodaySkySlotId() : 'day:' + today;
    const activeSlot = typeof getActiveSkySlotId === 'function' ? getActiveSkySlotId() : todaySlot;

    const cells = [];
    for (let i = 0; i < lead; i++) cells.push({ state: 'none', day: 0, date: 0, slot: null });
    for (let d = 1; d <= daysInMonth; d++) {
        const date = calendarDateInt(y, m, d);
        const state = d === todayD ? 'today' : (d < todayD ? 'past' : 'future');
        cells.push({ state, day: d, date, slot: state === 'today' ? todaySlot : null });
    }
    while (cells.length % 7) cells.push({ state: 'none', day: 0, date: 0, slot: null });

    for (const c of cells) c.selected = !!c.slot && c.slot === activeSlot;

    return {
        today,
        firstSkyDate: first,
        year: y,
        month: m,
        title: formatCalendarMonthTitle(y, m),
        weekdays: getCalendarWeekdayLabels(),
        rows: cells.length / 7,
        cells
    };
}

function getCalendarPageTitle() {
    const { y, m } = calendarDateParts(getEffectiveSkyDateInt());
    return formatCalendarMonthTitle(y, m);
}

/**
 * Общий выбор неба из календаря (S-06) — тело S-07: selectSky (prologue.js).
 * Сегодняшний день и доступный уровень Пролога переключают небо и закрывают
 * книгу; прошлые дни, пройденные/запертые/«coming soon» уровни — отказ без эффекта.
 * @returns {boolean} принят ли выбор
 */
function selectSkyFromCalendar(slotId) {
    return selectSky(slotId, { animate: true }).ok;
}

// =============================================================================
// S-07: ПОЛОСА ПРОЛОГА — над сеткой месяца
// =============================================================================

const PROLOGUE_ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];

/** Модель полосы — та же, из которой строится DOM. */
function getPrologueStripModel() {
    const activeSlot = typeof getActiveSkySlotId === 'function' ? getActiveSkySlotId() : null;
    const levels = [];
    for (let n = 1; n <= PROLOGUE_LEVEL_COUNT; n++) {
        const state = getPrologueLevelState(n);
        const slot = n <= PROLOGUE_PICTURE_IDS.length ? 'prologue:' + n : null;
        levels.push({ n, state, slot, selected: !!slot && slot === activeSlot });
    }
    // Подпись: имя первого доступного уровня; доступных нет — «скоро ещё».
    const next = levels.find(l => l.state === 'available');
    const caption = next ? t('prologue.name' + next.n) : t('prologue.soon');
    return { levels, caption };
}

function createPrologueCell(level) {
    const clickable = level.state === 'available';
    const el = document.createElement(clickable ? 'button' : 'div');
    el.className = 'book-prologue-cell book-prologue-' + level.state;
    el.dataset.level = String(level.n);
    el.dataset.state = level.state;
    if (level.slot) el.dataset.slot = level.slot;
    if (level.selected) el.dataset.selected = 'true';
    el.setAttribute('aria-label', level.n <= PROLOGUE_PICTURE_IDS.length
        ? PROLOGUE_ROMAN[level.n - 1] + ' · ' + t('prologue.name' + level.n)
        : PROLOGUE_ROMAN[level.n - 1] + ' · ' + t('prologue.soon'));

    const num = document.createElement('span');
    num.className = 'book-prologue-num';
    num.textContent = PROLOGUE_ROMAN[level.n - 1];
    el.appendChild(num);

    if (clickable) {
        el.type = 'button';
        el.addEventListener('click', () => selectSkyFromCalendar(level.slot));
    } else {
        // Правка после устройства: замка нет — запертый уровень просто серый,
        // как числа месяца (правка S-06).
        el.setAttribute('aria-disabled', 'true');
    }
    return el;
}

function renderBookPrologueStrip() {
    const el = document.getElementById('bookCalendarPrologue');
    if (!el) return;
    el.innerHTML = '';
    const model = getPrologueStripModel();

    const title = document.createElement('div');
    title.className = 'book-prologue-title';
    title.textContent = t('prologue.title');
    el.appendChild(title);

    const row = document.createElement('div');
    row.className = 'book-prologue-row';
    for (const level of model.levels) row.appendChild(createPrologueCell(level));
    el.appendChild(row);

    const caption = document.createElement('div');
    caption.className = 'book-prologue-caption';
    caption.textContent = model.caption;
    el.appendChild(caption);
}

function createCalendarCell(cell) {
    const isToday = cell.state === 'today';
    const el = document.createElement(isToday ? 'button' : 'div');
    el.className = 'book-cal-cell book-cal-' + cell.state;
    el.dataset.state = cell.state;
    if (cell.slot) el.dataset.slot = cell.slot;
    if (cell.selected) el.dataset.selected = 'true';
    if (cell.day) {
        const num = document.createElement('span');
        num.className = 'book-cal-num';
        num.textContent = String(cell.day);
        el.appendChild(num);
    }
    if (isToday) {
        el.type = 'button';
        el.addEventListener('click', () => selectSkyFromCalendar(cell.slot));
    } else if (cell.day) {
        el.setAttribute('aria-disabled', 'true');
    }
    return el;
}

function renderBookCalendar() {
    renderBookPrologueStrip();
    const monthEl = document.getElementById('bookCalendarMonth');
    if (monthEl) monthEl.textContent = getCalendarPageTitle();
    const el = document.getElementById('bookCalendarGrid');
    if (!el) return;
    el.innerHTML = '';
    const model = getCalendarModel();

    for (const label of model.weekdays) {
        const wd = document.createElement('div');
        wd.className = 'book-cal-wd';
        wd.textContent = label;
        el.appendChild(wd);
    }
    for (const cell of model.cells) el.appendChild(createCalendarCell(cell));
}
