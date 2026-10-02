// bookCalendar.js — страница «Календарь» (S-06): сетка текущего месяца по дате
// неба, сегодня — живая клетка, прошлое — заперто, будущего нет.
//
// «Сегодня» берётся только у неба — getEffectiveSkyDateInt() (сутки с 05:00,
// M-09, плюс dev-смещение и харнесс). Своих часов страница не читает: с 00:00
// до 05:00 клетка «сегодня» несёт вчерашнее число, на 1-е в эти часы сетка
// ещё прошлого месяца.
//
// Контракт клетки (для S-07): клетка, за которой стоит небо, несёт data-slot —
// id слота S-05; data-selected="true" — у клетки активного слота
// (getActiveSkySlotId()), не у «клетки сегодня». Полосу Пролога S-07 вставит
// над сеткой.

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
 * Состояния клетки: `today` · `past` (от первого дня игрока до вчера) ·
 * `none` (пустое место). Дата ушла назад (today < firstSkyDate) — прошлых нет,
 * только сегодня; сохранённое поле при этом не трогается.
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
        let state = 'none';
        if (d === todayD) state = 'today';
        else if (first > 0 && date >= first && date < today) state = 'past';
        // Число стоит только у дней от первого дня игрока до сегодня — дни до
        // первого запуска и будущие остаются пустыми местами сетки.
        if (state === 'none') cells.push({ state, day: 0, date: 0, slot: null });
        else cells.push({ state, day: d, date, slot: state === 'today' ? todaySlot : null });
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
 * Общий выбор неба из календаря — имя согласовано со S-07, которая заменит тело
 * вызовом selectSky. В S-06 небо одно — сегодняшнее: его слот закрывает книгу
 * (небо на экране уже то же), любой другой слот — отказ без эффекта.
 * @returns {boolean} принят ли выбор
 */
function selectSkyFromCalendar(slotId) {
    if (slotId !== getTodaySkySlotId()) return false;
    if (typeof closeBookAnimated === 'function') closeBookAnimated();
    else closeBook();
    return true;
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
    } else if (cell.state === 'past') {
        el.setAttribute('aria-disabled', 'true');
        el.appendChild(glyphSign('lock', 10, 'book-cal-lock'));
    }
    return el;
}

function renderBookCalendar() {
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
