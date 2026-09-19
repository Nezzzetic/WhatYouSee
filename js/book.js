// book.js — каркас книги K-06: состояние и высечки, шапка и шкала света,
// пейджер, рендер/открытие/закрытие, жесты ленты и страницы (R-05).

// =============================================================================
// K-06: КНИГА — общий каркас (пять высечек, шкала света у корешка)
// =============================================================================
//
// Шторка U-09 (85vh, рельс страниц, сегмент Atlas/Rewards/Observatory) стала
// полноэкранной книгой. Навигация плоская: любая высечка из любой, без
// промежуточных разделов. Под-страницы атласа и наград листаются
// пейджер-кнопками в подвале и горизонтальным свайпом (K-28, вернул то, что
// K-06 когда-то убрал целиком) — оба пути ведут через один stepBookPage.
// Свайп же на краю раздела не останавливается, а переводит в соседнюю
// высечку (swipeBookPage) — сквозная последовательность страниц всей книги.

// K-14: 'settings' — валидная цель openBook/switchBookCut, но не шестая
// высечка — вход только строкой из «Index» (решение заказчика 2026-08-25:
// высечек пять, см. K-06). Своей кнопки в #bookTabs у неё нет и не будет.
const BOOK_CUT_LIST = ['today', 'index', 'atlas', 'stamps', 'exlibris', 'settings'];

let bookCut = 'today';
let bookOpen = false;
// U-10/M-05: «Сутки» (REWARD_PAGES[0]) — на «Сегодня», а не в Штампах, поэтому
// bookPageIndices.rewards ходит по [1, REWARD_PAGE_COUNT - 1].
let bookPageIndices = { atlas: 0, rewards: 1 };
let bookHandlersBound = false;

function getBookPageCount(section) {
    if (section === 'rewards') return REWARD_PAGE_COUNT - 1;
    return ATLAS_PAGE_COUNT;
}

function getBookPageIndex(section) {
    if (section === 'rewards') {
        return Math.max(1, Math.min(REWARD_PAGE_COUNT - 1, bookPageIndices.rewards || 1));
    }
    return Math.max(0, Math.min(ATLAS_PAGE_COUNT - 1, bookPageIndices.atlas || 0));
}

function setBookPageIndex(section, index) {
    if (section === 'rewards') {
        bookPageIndices.rewards = Math.max(1, Math.min(REWARD_PAGE_COUNT - 1, index));
        return;
    }
    bookPageIndices.atlas = Math.max(0, Math.min(ATLAS_PAGE_COUNT - 1, index));
}

function isBookOpen() {
    return bookOpen;
}

/** K-19: римские цифры генерируются, не заводятся в словарь — до VII хватает. */
function toRoman(n) {
    const table = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let s = '';
    for (const [v, sym] of table) {
        while (n >= v) { s += sym; n -= v; }
    }
    return s;
}

/**
 * K-10: модель нумерации страниц — единая формула, общая для шапки книги и
 * оглавления. Считается детерминированно от состава глав, в сейве не живёт.
 */
function getAtlasChapterFolio(idx) {
    return 3 + idx;
}

function getStampsChapterFolio(idx) {
    return 3 + ATLAS_PAGE_COUNT + (idx - 1);
}

function getExLibrisFolio() {
    return 3 + ATLAS_PAGE_COUNT + (REWARD_PAGE_COUNT - 1);
}

/** K-14: настройки — последняя колонцифра книги, строкой после Ex Libris. */
function getSettingsFolio() {
    return getExLibrisFolio() + 1;
}

/** Шапка страницы: над-заголовок, титул, колонцифра — синтетическая, но сквозная. */
function renderBookHead() {
    const eyebrowEl = document.getElementById('bookEyebrow');
    const titleEl = document.getElementById('bookTitle');
    const footLeftEl = document.getElementById('bookFootLeft');
    const folioEl = document.getElementById('bookFolio');
    const prevBtn = document.getElementById('bookFootPrev');
    const nextBtn = document.getElementById('bookFootNext');
    if (!eyebrowEl || !titleEl || !footLeftEl || !folioEl) return;

    let eyebrow = '';
    let title = '';
    let folioN = 1;
    let footLeft = t('book.brand');
    // K-18: подвал атласа/штампов вместо ALMANAC несёт прогресс главы слева;
    // справа — колонцифра текущей страницы. K-28: стрелки пейджера теперь
    // видны на любом развороте (сквозной swipeBookPage), не только на атласе
    // и штампах — прячутся только на истинных краях книги (см. ниже).

    if (bookCut === 'today') {
        // K-09/U-16: надзаголовок — дата эффективных суток без номера ночи;
        // титул страницы остаётся «Tonight».
        const dateStr = typeof getEffectiveSkyDateInt === 'function' && typeof formatSkyDateLong === 'function'
            ? formatSkyDateLong(getEffectiveSkyDateInt())
            : '';
        eyebrow = t('book.eyebrowToday', { date: dateStr });
        title = t('book.headToday');
        folioN = 1;
    } else if (bookCut === 'index') {
        title = t('book.headIndex');
        folioN = 2;
    } else if (bookCut === 'atlas') {
        // K-11: заголовок страницы стал литературным названием главы;
        // нумерация уехала в надзаголовок. K-19: «of M» из надзаголовка снято
        // и номер стал римским — сколько всего, отвечает оглавление.
        const idx = getBookPageIndex('atlas');
        eyebrow = t('book.eyebrowAtlasChapter', { n: toRoman(idx + 1) });
        title = t('atlas.chapterTitle' + idx);
        folioN = getAtlasChapterFolio(idx);
        // K-31: счётчик «N of M traced» в подвале снят — счёт главы остался
        // только в оглавлении (K-19); подвал атласа падает на бренд, как у
        // Today/Index/Ex Libris/Settings.
    } else if (bookCut === 'stamps') {
        // K-12: главы штампов пронумерованы так же, как главы атласа.
        const idx = getBookPageIndex('rewards');
        const page = REWARD_PAGES[idx];
        eyebrow = t('book.eyebrowStampsChapter', { n: toRoman(idx) });
        title = page ? page.title : '';
        folioN = getStampsChapterFolio(idx);
        // O-08: «N of M pressed» снято — подвал падает на бренд ALMANAC, как
        // на остальных страницах книги. Счёт главы остался в оглавлении (K-19).
    } else if (bookCut === 'exlibris') {
        eyebrow = t('book.eyebrowExLibris');
        title = t('book.headExLibris');
        folioN = getExLibrisFolio();
    } else if (bookCut === 'settings') {
        title = t('book.headSettings');
        folioN = getSettingsFolio();
    }

    eyebrowEl.textContent = eyebrow;
    titleEl.textContent = title;
    footLeftEl.textContent = footLeft;
    // S-03 (правка заказчика 2026-09-10): уровень — в подвале рядом с брендом
    // (на Штампах — рядом с прогрессом главы) на любой странице книги.
    const footLevelEl = document.getElementById('bookFootLevel');
    if (footLevelEl) footLevelEl.textContent = t('book.footLevel', { n: getPlayerLevel() });
    folioEl.textContent = t('book.folio', { n: folioN });

    if (prevBtn && nextBtn) {
        // K-28: пейджер общий на всю книгу — data-pager называет текущий раздел
        // (verify-atlas-spread.js смотрит на 'atlas' при клике), сама стрелка
        // прячется только там, где swipeBookPage(±1) действительно некуда вести.
        const pagerAttr = bookCut === 'stamps' ? 'rewards' : bookCut;
        prevBtn.dataset.pager = pagerAttr;
        nextBtn.dataset.pager = pagerAttr;
        prevBtn.hidden = !canSwipeBookPage(-1);
        nextBtn.hidden = !canSwipeBookPage(1);
    }
}

/**
 * V-20: корешок вместо шкалы света (K-06/K-17/K-25 — две засечки-сотни,
 * флажок с числом, слово «следующий уровень»). Дети: номер уровня в головке,
 * пунктирная нить, бусина на доле пути (`getLevelProgress().ratio`), скрытый
 * по умолчанию счёт «earned / ceil» (показывает его showBookSpineScore()).
 * Ни чисел ✦, ни засечек, ни знаков — решение заказчика по развилке 8/9
 * дока: нить не заливается «пройденной» частью, направление задаёт номер
 * уровня выше.
 */
let bookSpineScoreTimer = null;

function renderBookGauge() {
    const el = document.getElementById('bookGauge');
    if (!el) return;
    el.innerHTML = '';

    const { earned, level, ceil, ratio } = getLevelProgress();

    // Фидбек с телефона 2026-09-17: в головке корешка — куда ведёт нить,
    // следующий уровень (было так и до V-20, у прежней шкалы K-06/K-17),
    // а не текущий — тот уже назван в подвале («ALMANAC · LEVEL N»).
    const levelEl = document.createElement('div');
    levelEl.className = 'book-spine-level';
    levelEl.textContent = t('book.spineLevel', { n: level + 1 });
    el.appendChild(levelEl);

    const thread = document.createElement('div');
    thread.className = 'book-spine-thread';
    el.appendChild(thread);

    const bead = document.createElement('div');
    bead.className = 'book-spine-bead';
    // Видна и на нуле (K-25: цель полёта первого в жизни игрока забора —
    // она же, устаревшего прямоугольника скрытой книгой цели быть не должно).
    bead.style.bottom = `${Math.round(ratio * 100)}%`;
    thread.appendChild(bead);

    const score = document.createElement('div');
    score.className = 'book-spine-score';
    score.textContent = t('book.spineScore', { earned, ceil });
    bead.appendChild(score);
}

/**
 * V-20: касание нити и забор награды при открытой книге проявляют «earned /
 * ceil» на BOOK_SPINE_SCORE_HOLD_MS у бусины; повтор продлевает показ, а не
 * переигрывает проявление (класс уже стоит — повторное добавление не триггерит
 * transition заново). `prefers-reduced-motion` — без переходов (общее правило
 * *,*::before,*::after в style.css уже сжимает transition-duration до 1мс).
 */
function showBookSpineScore() {
    const score = document.querySelector('#bookGauge .book-spine-score');
    if (!score) return;
    if (bookSpineScoreTimer) clearTimeout(bookSpineScoreTimer);
    score.classList.add('book-spine-score-on');
    bookSpineScoreTimer = setTimeout(() => {
        score.classList.remove('book-spine-score-on');
        bookSpineScoreTimer = null;
    }, BOOK_SPINE_SCORE_HOLD_MS);
}

/**
 * Штампы, кроме суточных — те живут на «Сегодня» и точку высечки не зажигают.
 * K-12: неразрезанная глава в счёт не идёт — до неё нельзя долистать и нечего
 * прижать, капля сургуча звала бы туда, куда сама книга ещё не пускает.
 */
function stampsHaveClaimable() {
    if (typeof rewardPageHasClaimable !== 'function') return false;
    for (let i = 1; i < REWARD_PAGE_COUNT; i++) {
        if (!isRewardPageUnlocked(i)) continue;
        if (rewardPageHasClaimable(i)) return true;
    }
    return false;
}

/**
 * K-17: второй раздел с настоящим «взять» — «Сегодня». U-25: точка только за
 * готовую суточную марку (REWARD_PAGES[0]) — непрочитанное событие мира больше
 * её не зажигает (иначе она горела почти после каждой новой фигуры и переставала
 * что-то значить). U-33 свела к тому же условию каплю на ленте (`hasSkyWaxSignal`) —
 * оба сигнала книги теперь смотрят только на готовую марку.
 */
function todayHasSignal() {
    return typeof rewardPageHasClaimable === 'function' && rewardPageHasClaimable(0);
}

/**
 * Пять высечек: подсветка активной и капля сургуча там, где есть готовое
 * (концепт, Табл. III-VI). У «Атласа» и «Оглавления» забора нет — точка им
 * не полагается никогда: она зовёт прижать, а прижимать там нечего.
 */
function renderBookTabs() {
    document.querySelectorAll('.book-tab').forEach(btn => {
        btn.classList.toggle('book-tab-on', btn.dataset.cut === bookCut);
    });
    // U-34: звёздочка горит классом, а не hidden — место под неё в высечке
    // занято всегда, и слово не прыгает, когда сигнал загорается/гаснет (K-23).
    const stampsWax = document.getElementById('bookTabStampsWax');
    if (stampsWax) stampsWax.classList.toggle('book-tab-wax-lit', stampsHaveClaimable());
    const todayWax = document.getElementById('bookTabTodayWax');
    if (todayWax) todayWax.classList.toggle('book-tab-wax-lit', todayHasSignal());
}

function stepBookPage(delta) {
    if (bookCut === 'atlas') {
        const idx = getBookPageIndex('atlas') + delta;
        if (idx < 0 || idx >= ATLAS_PAGE_COUNT) return false;
        setBookPageIndex('atlas', idx);
        renderBook();
        return true;
    }
    if (bookCut === 'stamps') {
        const idx = getBookPageIndex('rewards') + delta;
        if (idx < 1 || idx >= REWARD_PAGE_COUNT) return false;
        setBookPageIndex('rewards', idx);
        renderBook();
        return true;
    }
    return false;
}

/**
 * K-28: горизонтальный переход по книге — общий и для свайпа, и для кнопок
 * пейджера в подвале. Внутри атласа/штампов — то же самое, что было раньше:
 * stepBookPage. На краю раздела — или там, где страниц нет вовсе («Today»/
 * «Index»/«Ex Libris») — переходит в соседнюю высечку по порядку
 * BOOK_CUT_LIST, входя в атлас/штампы с той стороны, откуда пришли, чтобы
 * номера страниц шли подряд по всей книге. «Settings» в эту цепочку не входит
 * (K-14, решение заказчика — высечек пять); край книги (до «Today», после
 * «Ex Libris») жест молчит, без зацикливания.
 */
function swipeBookPage(delta) {
    if (stepBookPage(delta)) return;
    const order = BOOK_CUT_LIST.filter(cut => cut !== 'settings');
    const i = order.indexOf(bookCut);
    if (i === -1) return; // 'settings' — вне сквозного порядка, свайп молчит
    const nextCut = order[i + delta];
    if (!nextCut) return;
    if (nextCut === 'atlas') setBookPageIndex('atlas', delta > 0 ? 0 : ATLAS_PAGE_COUNT - 1);
    else if (nextCut === 'stamps') setBookPageIndex('rewards', delta > 0 ? 1 : REWARD_PAGE_COUNT - 1);
    switchBookCut(nextCut);
}

/**
 * K-28: было бы swipeBookPage(delta) сейчас куда-то вести, без побочных
 * эффектов — только чтобы решить, показывать ли стрелку пейджера. Логика
 * зеркалит stepBookPage/swipeBookPage: внутри атласа/штампов смотрит на
 * границы главы, иначе — на порядок высечек (BOOK_CUT_LIST без 'settings').
 */
function canSwipeBookPage(delta) {
    if (bookCut === 'atlas') {
        const idx = getBookPageIndex('atlas') + delta;
        if (idx >= 0 && idx < ATLAS_PAGE_COUNT) return true;
    } else if (bookCut === 'stamps') {
        const idx = getBookPageIndex('rewards') + delta;
        if (idx >= 1 && idx < REWARD_PAGE_COUNT) return true;
    }
    const order = BOOK_CUT_LIST.filter(cut => cut !== 'settings');
    const i = order.indexOf(bookCut);
    return i !== -1 && !!order[i + delta];
}

// =============================================================================
// K-06: РЕНДЕР И ОТКРЫТИЕ/ЗАКРЫТИЕ КНИГИ
// =============================================================================

function renderBook() {
    const sections = {
        today: document.getElementById('bookToday'),
        index: document.getElementById('bookIndex'),
        atlas: document.getElementById('bookAtlasSection'),
        stamps: document.getElementById('bookStampsSection'),
        exlibris: document.getElementById('bookExLibris'),
        settings: document.getElementById('bookSettingsSection')
    };
    for (const cut in sections) {
        if (sections[cut]) sections[cut].hidden = cut !== bookCut;
    }
    // O-03: тик живёт только на «Сегодня» — уходим с раздела, отсчёт снимается
    // (renderBookToday() его при надобности заведёт заново).
    if (bookCut !== 'today') stopBookTodayDawnTimer();

    recomputeAchievementsClaimable();

    if (bookCut === 'today') {
        renderBookToday();
    } else if (bookCut === 'index') {
        renderBookIndex();
    } else if (bookCut === 'atlas') {
        renderAtlasList();
    } else if (bookCut === 'stamps') {
        renderAchievementsList();
    } else if (bookCut === 'exlibris') {
        renderBookExLibris();
    } else if (bookCut === 'settings') {
        renderBookSettings();
    }

    renderBookHead();
    renderBookGauge();
    renderBookTabs();
    updateScoreUI();
    updateRibbonSignal();

    const body = document.getElementById('bookBody');
    if (body) body.scrollTop = 0;
}

function refreshBookIfOpen() {
    if (bookOpen) renderBook();
}

/**
 * U-21: самое первое за игру открытие книги приходится на разворот атласа —
 * иначе новичок не находит его вовсе: сигнала у высечки у атласа нет и не
 * будет (бейджей он не показывает никогда), а глава I бесплатна, то есть
 * разворот не пустой ни у кого. Дальше книга открывается там, где игрок был
 * в прошлый раз (K-05). Флаг тратится только на путях игрока — тап по ленте,
 * потягивание, Enter, — они зовут openBook() без аргумента; харнесс с явным
 * разделом первое открытие не съедает.
 */
function isFirstBookOpenPending() {
    return typeof achievementCounters !== 'undefined' && !!achievementCounters
        && !achievementCounters.bookFirstOpenDone;
}

/**
 * Ставит раздел, но флага НЕ тратит: зовётся в момент, когда книга только
 * становится видимой (потягивание ленты за палец), — иначе игрок тянет вверх
 * «Сегодня», а по приезде страница на его глазах подменяется атласом. Если
 * жест бросили на полпути, флаг цел, а `bookCut` уже атлас — следующее
 * открытие приведёт туда же, и подмены снова не будет.
 */
function applyFirstBookOpenCut() {
    if (!isFirstBookOpenPending()) return false;
    bookCut = 'atlas';
    return true;
}

/** Книга действительно открылась — первое открытие израсходовано. */
function markFirstBookOpenDone() {
    if (!isFirstBookOpenPending()) return;
    achievementCounters.bookFirstOpenDone = true;
    if (typeof saveProgression === 'function') saveProgression();
}

function openBook(cut) {
    closeObservatoryRenameField();
    if (BOOK_CUT_LIST.includes(cut)) {
        bookCut = cut;
    } else {
        applyFirstBookOpenCut();
        markFirstBookOpenDone();
    }
    bookOpen = true;
    const book = document.getElementById('book');
    if (book) book.hidden = false;
    if (document.body) document.body.classList.add('book-open-body');
    // V-20: открыта — притемнение сразу полное. Гесты уже довели его до 1 к
    // этому моменту (settle/settleRibbonOpen) — здесь оно на всякий путь,
    // включая мгновенные (харнесс, тап по высечке минуя жест).
    setBookScrimOpen(1);
    renderBook();
    syncExLibrisAppMode();
    // U-31: лента одна — на любом исходе (харнесс, Escape, доводы жеста) обе
    // стороны обязаны прийти в покой, иначе книжная рискует не появиться.
    resetRibbons();
}

function closeBook() {
    if (!bookOpen) return;
    closeObservatoryRenameField();
    dismissLevelBanner(true); // V-16/U-29: баннер не переживает закрытие книги
    stopBookTodayDawnTimer(); // O-03: закрыли книгу — тик посекундно никому не нужен
    bookOpen = false;
    const book = document.getElementById('book');
    if (book) {
        setBookTransition(book, '');
        setBookTransform(book, '');
        book.hidden = true;
    }
    // V-20: закрыто — притемнение гасится явно, а не выводится из ty=0
    // (тот читался бы как «открыта»); риск дока — слой не должен застрять
    // видимым ни на одном исходе закрытия (Escape, харнесс, довод ниже порога).
    setBookScrimOpen(0);
    if (document.body) document.body.classList.remove('book-open-body');
    syncExLibrisAppMode();
    resetRibbons(); // U-31: см. openBook()
}

function switchBookCut(cut) {
    if (!BOOK_CUT_LIST.includes(cut) || bookCut === cut) return;
    closeObservatoryRenameField();
    bookCut = cut;
    renderBook();
    syncExLibrisAppMode();
}

// =============================================================================
// K-06: ЖЕСТЫ КНИГИ
// =============================================================================

/** Единая точка координат: работает и для мыши, и для пальца. */
function getGesturePoint(event) {
    if (event.touches && event.touches.length) return event.touches[0];
    if (event.changedTouches && event.changedTouches.length) return event.changedTouches[0];
    if (typeof event.clientX === 'number') return event;
    return null;
}

function isMultiTouch(event) {
    return !!(event.touches && event.touches.length > 1);
}

/**
 * U-35: нижний инсет системной панели в px. `--safe-bottom` из JS напрямую не
 * прочесть (см. getBottomUIHeight в sketch.js) — меряем узлом с `height:
 * var(--safe-bottom)`. В браузере ноль; на Redmi с навигационной панелью 48.
 */
function bottomInsetPx() {
    let probe = document.getElementById('bottomInsetProbe');
    if (!probe) {
        probe = document.createElement('div');
        probe.id = 'bottomInsetProbe';
        probe.setAttribute('aria-hidden', 'true');
        probe.style.cssText = 'position:fixed;left:0;bottom:0;width:1px;height:var(--safe-bottom);'
            + 'visibility:hidden;pointer-events:none;';
        document.body.appendChild(probe);
    }
    return Math.round(probe.getBoundingClientRect().height) || 0;
}

/**
 * K-26: во столько px книга уходит вниз до закрытого положения.
 * U-35: отсчёт — от низа ленты, а не от низа экрана. Лента стоит на
 * `bottom: var(--safe-bottom)`, то есть выше края экрана на нижний инсет;
 * без вычета верх листа шёл за лентой с постоянным зазором в этот инсет
 * (на телефоне с навигационной панелью — 48 px, «лента отстаёт от книги»).
 */
function bookTravelPx() {
    const full = window.innerHeight || document.documentElement.clientHeight || 800;
    return Math.max(1, full - bottomInsetPx());
}

/**
 * V-20: притемнение неба (#bookScrim) идёт за ходом книги — 0, когда она за
 * нижним краем, 1, когда открыта. `ty` — снятый из transform сдвиг вниз,
 * `travel` — на сколько px книга уходит за край целиком; при ty=0 результат
 * не зависит от travel вовсе (риск 3 дока: во время жеста travel обязан быть
 * тем же единожды снятым числом, что вело книгу, — его передаёт вызывающий).
 */
function setBookScrimOpen(ratio) {
    if (document.documentElement) {
        document.documentElement.style.setProperty('--book-open', String(ratio));
    }
}

function computeBookOpenRatio(ty, travel) {
    if (ty <= 0) return 1;
    const t = travel > 0 ? travel : bookTravelPx();
    if (t <= 0) return 0;
    return Math.min(1, Math.max(0, 1 - ty / t));
}

function parseBookTranslateY(transform) {
    if (!transform) return 0;
    const m = /translateY\(([-\d.]+)px\)/.exec(transform);
    return m ? parseFloat(m[1]) : 0;
}

/**
 * K-35: книге ставят transform только через это. Встроенный холст экслибриса
 * лежит поверх книги отдельным fixed-узлом (K-13) и за ней сам не поедет — ход
 * книги повторяется на нём и на рамке гравюры. Вне экслибриса обе функции
 * работают ровно как прежняя присвоенная строка.
 *
 * V-20: заодно двигает притемнение неба — `travel` (необязателен) передаёт тот
 * же единожды снятый замер, что ведёт саму протяжку, см. computeBookOpenRatio.
 */
function setBookTransform(book, transform, travel) {
    if (book) book.style.transform = transform;
    if (typeof setExLibrisFollowTransform === 'function') setExLibrisFollowTransform(transform);
    setBookScrimOpen(computeBookOpenRatio(parseBookTranslateY(transform), travel));
}

function setBookTransition(book, transition) {
    if (book) book.style.transition = transition;
    if (typeof setExLibrisFollowTransition === 'function') setExLibrisFollowTransition(transition);
    const scrim = document.getElementById('bookScrim');
    if (scrim) scrim.style.transition = transition ? transition.replace('transform', 'opacity') : 'none';
}

/**
 * K-26: довод жеста книги — от текущей позиции translateY плавно к цели
 * (или мгновенно при «уменьшить движение»), потом зовёт onSettled. Общая
 * точка для открытия и закрытия: раньше на отпускании transform сбрасывался
 * и hidden ставился в один тик без всякой доводки — движение обрывалось.
 */
function settleBookTransform(book, targetPx, onSettled) {
    if (!book) { onSettled(); return; }
    const finalTransform = targetPx ? `translateY(${targetPx}px)` : '';
    if (prefersReducedMotion()) {
        setBookTransition(book, '');
        setBookTransform(book, finalTransform, targetPx);
        onSettled();
        return;
    }
    let done = false;
    const finish = () => {
        if (done) return;
        done = true;
        book.removeEventListener('transitionend', onEnd);
        clearTimeout(timer);
        setBookTransition(book, '');
        onSettled();
    };
    const onEnd = (event) => { if (event.target === book && event.propertyName === 'transform') finish(); };
    book.addEventListener('transitionend', onEnd);
    const timer = setTimeout(finish, BOOK_SETTLE_MS + 120);
    setBookTransition(book, `transform ${BOOK_SETTLE_MS}ms var(--ease)`);
    // Форсированный рефлоу — браузер обязан зафиксировать стартовую (тянутую
    // пальцем) позицию до смены на целевую, иначе переход схлопнется в один
    // кадр без анимации. rAF для этого не годится — в фоновой/скрытой вкладке
    // кадров нет вовсе, и жест завис бы там намертво.
    void book.offsetHeight;
    setBookTransform(book, finalTransform, targetPx);
}

/**
 * K-26: тап по ленте и Enter — короткая дорога к открытию, но не должны
 * выглядеть рывком: страница едет с закрытой позиции тем же ходом, что и
 * потягивание. openBook() остаётся синхронным (нужно тестовому харнессу и
 * программным вызовам) — это чисто визуальная доводка поверх готового состояния.
 *
 * U-31: без фазы протяжки — небесная сторона едет вместе с книгой в длине
 * покоя (`--ribbon-pull` не трогаем, только `--ribbon-follow` от 0 до полного
 * проезда), той же длительностью, что и сама книга; книжная сторона скрыта
 * классом `book-opening`, пока довод не закончился, — тот же приём, что у
 * протяжки за палец (setupRibbonPullGesture).
 */
function openBookAnimated(cut) {
    const book = document.getElementById('book');
    const ribbon = document.getElementById('skyRibbon');
    const canAnimate = !!book && !prefersReducedMotion();
    // K-35: открываем ДО подстановки стартовой позиции — раньше было наоборот.
    // Внутри openBook() холст экслибриса встраивается по замеру прямоугольника
    // страницы, и замер обязан пройти по книге в покое: с уже подставленным
    // сдвигом слот мерялся уехавшим вниз на целый экран, и небо оставалось за
    // нижним краем до ближайшего ресайза. Кадра между открытием и сдвигом не
    // будет — обе строки в одном тике, до первой отрисовки.
    openBook(cut); // резет ленты внутри — ничему не мешает, ниже переставим сами
    if (!canAnimate) return;
    const travel = bookTravelPx(); // один замер на весь довод, см. setupRibbonPullGesture
    // V-20 (фидбек с устройства 2026-09-17, круг 2): та же поправка, что у
    // интерактивной протяжки (setupRibbonPullGesture) — без нее лента тут
    // тоже доезжала бы дальше книги и улетала за экран.
    const strip = document.getElementById('bookSkyStrip');
    const stripPx = strip ? strip.getBoundingClientRect().height : 0;
    document.body.classList.add('book-opening');
    setBookTransition(book, 'none');
    setBookTransform(book, `translateY(${travel}px)`, travel);
    setRibbonPull(ribbon, 0, 0);
    const tail = ribbon && ribbon.querySelector('.ribbon-tail');
    void book.offsetHeight; // рефлоу теперь, когда книга уже видима — фиксирует старт
    setBookTransition(book, `transform ${BOOK_SETTLE_MS}ms var(--ease)`);
    if (tail) tail.style.transition = `transform ${BOOK_SETTLE_MS}ms var(--ease)`;
    setBookTransform(book, '');
    setRibbonPull(ribbon, 0, Math.max(0, travel - stripPx));
    const onEnd = (event) => {
        if (event.target !== book || event.propertyName !== 'transform') return;
        book.removeEventListener('transitionend', onEnd);
        setBookTransition(book, '');
        if (tail) tail.style.transition = '';
        resetRibbons();
        document.body.classList.remove('book-opening');
    };
    book.addEventListener('transitionend', onEnd);
}

/**
 * O-07: тап по постоянному знаку закрытия — тот же довод, что у потягивания
 * страницы вниз (settleBookTransform в setupBookCloseGesture), а не мгновенный
 * closeBook(): жест и знак обязаны выглядеть одним и тем же движением.
 */
function closeBookAnimated() {
    const book = document.getElementById('book');
    settleBookTransform(book, bookTravelPx(), () => closeBook());
}

/**
 * Два жеста книги на одном обработчике, разведённые по оси (BOOK_AXIS_DECIDE_PX,
 * риск 1 дока K-28 — тот же приём, что уже развёл закрытие книги (вниз) и
 * потягивание ленты (вверх), см. setupRibbonPullGesture):
 *
 * — вертикаль: потягивание вниз закрывает книгу с любой страницы (риск 4
 *   дока K-06 — возврат на небо обязан быть таким же дешёвым, как вход).
 *   Тянут вниз в самом верху прокрутки страницы — закрытие; тянут в середине
 *   списка — обычная прокрутка, жест её не трогает.
 * — горизонталь (K-28): свайп листает страницу — swipeBookPage(), тот же
 *   переход, что у пейджер-кнопки в подвале, плюс переход в соседний раздел
 *   на краю текущего. Без протяжки страницы за пальцем — решение осознанно
 *   (см. «Согласованный план» дока K-28): раздел просто перерисовывается,
 *   как от кнопки.
 *
 * Мультитач и щипок зума (isMultiTouch) не считаются ни тем, ни другим жестом.
 */
function setupBookCloseGesture() {
    if (bookHandlersBound) return;
    const book = document.getElementById('book');
    const body = document.getElementById('bookBody');
    const ribbon = document.getElementById('skyRibbon');
    const closeRibbon = document.getElementById('bookCloseRibbon');
    if (!book || !body) return;

    let startX = 0;
    let startY = 0;
    let axis = null; // 'vertical' | 'horizontal', решается на BOOK_AXIS_DECIDE_PX
    let closing = false;
    let tracking = false;
    let travel = 0; // V-20: снимается один раз на жест — см. setupRibbonPullGesture

    const onStart = (event) => {
        if (isMultiTouch(event)) { tracking = false; return; }
        if (event.type === 'mousedown' && event.button !== 0) return;
        // U-31: касание на книжной стороне ленты — это её собственный жест
        // (setupCloseRibbonPullGesture), а не потягивание страницы вниз.
        // stopPropagation там уже гасит это на большинстве путей — эта
        // проверка добавляет вторую страховку независимо от нашего порядка.
        if (event.target.closest && event.target.closest('#bookCloseRibbon')) {
            tracking = false;
            return;
        }
        const p = getGesturePoint(event);
        if (!p) return;
        startX = p.clientX;
        startY = p.clientY;
        axis = null;
        closing = false;
        tracking = true;
        travel = bookTravelPx();
    };

    const onMove = (event) => {
        if (!tracking || isMultiTouch(event)) return;
        const p = getGesturePoint(event);
        if (!p) return;
        const dx = p.clientX - startX;
        const dy = p.clientY - startY;

        if (!axis) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) < BOOK_AXIS_DECIDE_PX) return;
            if (Math.abs(dx) > Math.abs(dy)) {
                axis = 'horizontal';
            } else {
                axis = 'vertical';
                closing = dy > 0 && body.scrollTop <= 0;
            }
        }

        if (axis === 'horizontal') {
            // K-28: страница не тянется за пальцем — только preventDefault,
            // чтобы жест не ушёл в браузер; сам переход — на отпускании.
            if (event.cancelable) event.preventDefault();
            return;
        }
        if (!closing) return;
        if (event.cancelable) event.preventDefault();
        setBookTransform(book, `translateY(${Math.max(0, dy)}px)`, travel);
    };

    const onEnd = (event) => {
        if (!tracking) return;
        tracking = false;
        const p = getGesturePoint(event);

        if (axis === 'horizontal') {
            const dx = p ? p.clientX - startX : 0;
            if (Math.abs(dx) >= BOOK_PAGE_SWIPE_MIN_PX) swipeBookPage(dx < 0 ? 1 : -1);
            axis = null;
            return;
        }

        const dy = p ? Math.max(0, p.clientY - startY) : 0;
        if (closing && dy >= BOOK_CLOSE_SWIPE_MIN_PX) {
            // K-26: довод — доезжаем вниз до конца тем же ходом, что вёл за
            // пальцем, и только потом прячем; раньше это обрывалось тут же.
            settleBookTransform(book, travel, () => closeBook());
        } else if (closing) {
            // ниже порога — страница падает обратно тем же доводом
            settleBookTransform(book, 0, () => {});
        } else {
            setBookTransform(book, '');
        }
        closing = false;
        axis = null;
    };

    book.addEventListener('touchstart', onStart, { passive: true });
    book.addEventListener('touchmove', onMove, { passive: false });
    book.addEventListener('touchend', onEnd);
    book.addEventListener('touchcancel', onEnd);
    book.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    // K-05: потягивание ленты вверх — обратный жест к открытию книги
    if (ribbon) setupRibbonPullGesture(ribbon);
    // U-31: потягивание книжной стороны вниз — обратный жест к закрытию
    if (closeRibbon) setupCloseRibbonPullGesture(closeRibbon);

    bookHandlersBound = true;
}

/**
 * U-31: довод открытия сверх RIBBON_STRETCH_PX — книга едет к 0 обычным
 * settleBookTransform, небесная сторона следует тем же ходом (--ribbon-follow
 * от текущего значения до полного проезда), чтобы не отставать от края
 * книги. Общий хвост для протяжки за порог и короткой дороги (тап/Enter,
 * см. openBookAnimated) — обе кончаются одинаково.
 *
 * `travel` приходит СНАРУЖИ, а не считается здесь заново (фидбек с
 * устройства, см. beginDrag) — тот же замер, что вёл книгу весь жест.
 *
 * V-20 (фидбек с устройства 2026-09-17, круг 2): `follow` у ленты доезжал до
 * полного `travel`, а книга — только до `travel - stripPx` (см. move()) —
 * на самом отпускании лента «отрывалась» и улетала за экран ещё stripPx
 * после того, как книга уже встала. Довод ленты укорочен на ту же величину,
 * что и довод книги, — оба останавливаются в одной точке.
 */
function settleRibbonOpen(book, ribbon, travel, stripPx, onSettled) {
    const tail = ribbon && ribbon.querySelector('.ribbon-tail');
    if (tail && !prefersReducedMotion()) {
        tail.style.transition = `transform ${BOOK_SETTLE_MS}ms var(--ease)`;
        void tail.offsetHeight;
    }
    setRibbonPull(ribbon, RIBBON_STRETCH_PX, Math.max(0, travel - stripPx));
    settleBookTransform(book, 0, () => {
        if (tail) tail.style.transition = '';
        onSettled();
        document.body.classList.remove('book-opening');
    });
}

/**
 * K-05/K-26/U-31: тянем небесную сторону ленты вверх. Первые RIBBON_STRETCH_PX
 * тянется только сама лента (книга стоит за нижним краем); дальше книга едет
 * за пальцем, а лента — вместе с её верхним краем, как закреплённая на ней.
 * На отпускании — за порогом довод до конца (settleRibbonOpen), ниже порога
 * книга падает обратно (никуда не двигалась — follow был 0 весь жест), а
 * лента пружинит сама (settleRibbonPull, ui.js).
 *
 * U-31 (фидбек с устройства, круг 2): `bookTravelPx()` (= window.innerHeight)
 * замеряется РОВНО ОДИН РАЗ на жест — в beginDrag, в `travel`. Мобильный
 * браузер может скрыть/показать адресную строку посреди протяжки (не только
 * от скролла страницы — эвристика показа шторки у некоторых Chrome видит
 * любой продолжительный touchmove), и если `move()` каждый раз спрашивает
 * `bookTravelPx()` заново, книга скачком уезжает на разницу высоты — ровно
 * то расхождение ленты и книги, на которое пожаловался заказчик («лента
 * идёт сама» / «книга перекрывает»), воспроизведено headless-скриптом с
 * подменой viewport посреди жеста.
 */
function setupRibbonPullGesture(ribbon) {
    const book = document.getElementById('book');
    let startY = 0;
    let startX = 0;
    let tracking = false;
    let decided = false;
    let dragging = false;
    let pulled = false;
    let travel = 0;
    let stripPx = 0;

    const beginDrag = () => {
        if (!book) return;
        dragging = true;
        pulled = true; // жест пошёл — тап после него не должен сработать отдельно
        travel = bookTravelPx(); // замер один раз на весь жест, см. комментарий выше
        document.body.classList.add('book-opening'); // книжной стороны не видно на ходу
        setBookTransition(book, '');
        const tail = ribbon.querySelector('.ribbon-tail');
        // U-31 (фидбек с устройства, круг 3): 'none' инлайн, а не '' — сброс
        // до пустой строки снимает ТОЛЬКО инлайн-переопределение и открывает
        // дорогу каскаду: залипший на тач-экране :hover (mouseleave не
        // наступает) навешивает свой transition на transform, и та же
        // протяжка, что двигает книгу мгновенно, для ленты растягивается
        // на 240 мс за кадр — она визуально «не идёт дальше», хотя follow
        // растёт. 'none' инлайн сильнее любого правила каскада независимо
        // от того, сработал ли @media(hover:hover) на конкретном устройстве.
        if (tail) tail.style.transition = 'none';
        book.hidden = false;
        // U-21: раздел решается ДО первой отрисовки — страница едет за пальцем
        // уже атласом, а не подменяется им по приезде.
        applyFirstBookOpenCut();
        renderBook();
        // V-20 (фидбек с устройства 2026-09-17): верх `.book` — теперь полоса
        // неба (`.book-sky-strip`), а не лист. Без поправки первые stripPx
        // протяжки открывали только её — прозрачную, — и лист не появлялся,
        // пока лента уже заметно отъехала: между лентой и книгой была видна
        // пустота. Замеряется, как и travel, один раз на весь жест — высота
        // строки зависит от --safe-top и не меняется посреди протяжки.
        const strip = document.getElementById('bookSkyStrip');
        stripPx = strip ? strip.getBoundingClientRect().height : 0;
        setBookTransform(book, `translateY(${travel}px)`, travel);
    };

    const start = (event) => {
        if (isMultiTouch(event) || bookOpen) { tracking = false; return; }
        if (event.type === 'mousedown' && event.button !== 0) return;
        const p = getGesturePoint(event);
        if (!p) return;
        startY = p.clientY;
        startX = p.clientX;
        tracking = true;
        decided = false;
        dragging = false;
        pulled = false;
    };

    const move = (event) => {
        if (!tracking || bookOpen || isMultiTouch(event)) return;
        const p = getGesturePoint(event);
        if (!p) return;
        const dy = startY - p.clientY;
        const dx = Math.abs(p.clientX - startX);

        if (!decided) {
            if (Math.max(dy, dx) < BOOK_AXIS_DECIDE_PX) return;
            decided = true;
            if (dy <= 0 || dy <= dx) { tracking = false; return; } // не вверх — не наш жест
            beginDrag();
        }

        if (!dragging) return;
        if (event.cancelable) event.preventDefault();
        const stretch = Math.min(dy, RIBBON_STRETCH_PX);
        const follow = Math.max(0, dy - RIBBON_STRETCH_PX);
        // Лист догоняет ленту сразу, без мёртвой зоны на высоту полосы неба
        // (stripPx) — см. комментарий в beginDrag.
        setBookTransform(book, `translateY(${Math.max(0, travel - follow - stripPx)}px)`, travel);
        setRibbonPull(ribbon, stretch, follow);
    };

    const end = (event) => {
        if (!tracking) { tracking = false; return; }
        tracking = false;
        if (!dragging) return;
        const p = getGesturePoint(event);
        const dy = p ? startY - p.clientY : 0;
        dragging = false;

        if (dy >= RIBBON_STRETCH_PX) {
            // K-26: довод — доезжаем вверх до конца тем же ходом, что вёл
            // за пальцем, и только потом открываем по-настоящему.
            settleRibbonOpen(book, ribbon, travel, stripPx, () => openBook());
        } else {
            // ниже порога книга не двигалась вовсе (follow был 0) — только
            // лента пружинит обратно в покой.
            settleBookTransform(book, travel, () => { if (book) book.hidden = true; });
            settleRibbonPull(ribbon);
            document.body.classList.remove('book-opening');
        }
    };

    ribbon.addEventListener('touchstart', start, { passive: true });
    ribbon.addEventListener('touchmove', move, { passive: false });
    ribbon.addEventListener('touchend', end);
    ribbon.addEventListener('touchcancel', end);
    ribbon.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);

    // Потянули — click по ленте под пальцем не должен сработать отдельно
    ribbon.addEventListener('click', (event) => {
        if (!pulled) return;
        pulled = false;
        event.stopPropagation();
        event.preventDefault();
    }, true);

    // Тап по ленте — короткая дорога, но с тем же доводом (K-26)
    ribbon.addEventListener('click', () => {
        if (bookOpen) return;
        openBookAnimated();
    });
}

/**
 * U-31: тянем книжную сторону ленты вниз — зеркало setupRibbonPullGesture.
 * Книжная сторона живёт внутри `#book` (DOM-потомок), поэтому не нуждается
 * в собственном «follow»-сдвиге — она едет с книгой сама через её же
 * transform; здесь считается только протяжка самой ленты (`stretch`) и
 * перемещение книги (`translateY(follow)`, вниз от открытого положения).
 * Работает при любой прокрутке страницы — в отличие от setupBookCloseGesture,
 * который закрывает только у самого верха списка.
 */
function setupCloseRibbonPullGesture(closeRibbon) {
    const book = document.getElementById('book');
    let startY = 0;
    let tracking = false;
    let dragging = false;
    let pulled = false;
    let travel = 0; // V-20: снимается один раз на жест — см. setupRibbonPullGesture

    const start = (event) => {
        if (isMultiTouch(event) || !bookOpen) { tracking = false; return; }
        if (event.type === 'mousedown' && event.button !== 0) return;
        const p = getGesturePoint(event);
        if (!p) return;
        // Не даём setupBookCloseGesture поймать тот же жест на #book.
        event.stopPropagation();
        startY = p.clientY;
        tracking = true;
        dragging = true;
        pulled = false;
        travel = bookTravelPx();
        setBookTransition(book, '');
        const tail = closeRibbon.querySelector('.book-close-ribbon-tail');
        // U-31: 'none' инлайн — тот же приём, что в setupRibbonPullGesture,
        // на случай залипшего :hover (этой стороне не грозит --ribbon-follow,
        // но высота через --ribbon-pull всё равно не должна ловить транзишен).
        if (tail) tail.style.transition = 'none';
    };

    const move = (event) => {
        if (!tracking || !dragging || isMultiTouch(event)) return;
        const p = getGesturePoint(event);
        if (!p) return;
        const dy = Math.max(0, p.clientY - startY);
        if (dy > 0) pulled = true;
        if (event.cancelable) event.preventDefault();
        const stretch = Math.min(dy, RIBBON_STRETCH_PX);
        const follow = Math.max(0, dy - RIBBON_STRETCH_PX);
        setBookTransform(book, `translateY(${follow}px)`, travel);
        setRibbonPull(closeRibbon, stretch, 0);
    };

    const end = (event) => {
        if (!tracking) return;
        tracking = false;
        if (!dragging) return;
        dragging = false;
        const p = getGesturePoint(event);
        const dy = p ? Math.max(0, p.clientY - startY) : 0;

        if (dy >= RIBBON_STRETCH_PX) {
            settleBookTransform(book, travel, () => closeBook());
        } else {
            // ниже порога книга не двигалась (follow был 0) — лента пружинит.
            settleBookTransform(book, 0, () => {});
            settleRibbonPull(closeRibbon);
        }
    };

    closeRibbon.addEventListener('touchstart', start, { passive: true });
    closeRibbon.addEventListener('touchmove', move, { passive: false });
    closeRibbon.addEventListener('touchend', end);
    closeRibbon.addEventListener('touchcancel', end);
    closeRibbon.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);

    // Потянули — click по знаку не должен отдельно закрыть книгу без довода.
    closeRibbon.addEventListener('click', (event) => {
        if (!pulled) return;
        pulled = false;
        event.stopPropagation();
        event.preventDefault();
    }, true);
}

function setupBookControls() {
    // K-05: лента — единая цель: тап, потягивание вверх или Enter открывают
    // книгу на той высечке, где игрок был в прошлый раз.
    document.getElementById('skyRibbon')?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openBookAnimated();
    });

    // O-07: постоянный знак закрытия — тот же довод, что у потягивания вниз.
    document.getElementById('bookCloseRibbon')?.addEventListener('click', closeBookAnimated);

    // V-20: тап по полосе неба сверху — тот же довод. Развилка 6 дока: тап по
    // небу в обрезе справа (высечки) книгу не закрывает — тот узел отдельный.
    document.getElementById('bookSkyStrip')?.addEventListener('click', closeBookAnimated);

    // V-20: касание нити корешка проявляет счёт «earned / ceil» на 2 с.
    document.getElementById('bookGauge')?.addEventListener('click', showBookSpineScore);

    document.querySelectorAll('.book-tab').forEach(btn => {
        btn.addEventListener('click', () => switchBookCut(btn.dataset.cut));
    });

    // K-18: пейджер живёт в подвале книги, те же два узла на всех разворотах
    // (renderBookHead переставляет им data-pager/hidden). K-28: ведёт сквозной
    // swipeBookPage, а не stepBookPage — крутит и главы атласа/штампов, и
    // переходы между разделами, ровно как горизонтальный свайп.
    document.getElementById('bookFootPrev')?.addEventListener('click', (event) => {
        swipeBookPage(Number(event.currentTarget.dataset.dir));
    });
    document.getElementById('bookFootNext')?.addEventListener('click', (event) => {
        swipeBookPage(Number(event.currentTarget.dataset.dir));
    });

    // B-02: тумблер режима холста — тот же угол, где раньше жила кнопка отката (K-04)
    document.getElementById('obsModeConnectBtn')?.addEventListener('click', () => setObservatoryMode('connect'));
    document.getElementById('obsModeMoveBtn')?.addEventListener('click', () => setObservatoryMode('move'));

    // K-21: Enter коммитит и закрывает, Esc отменяет ввод (не коммитит) и
    // закрывает, потеря фокуса коммитит — тот же путь, что и Enter.
    const exLibrisRenameInput = document.getElementById('exLibrisRenameInput');
    if (exLibrisRenameInput) {
        // Enter/Esc зовут коммит/закрытие НАПРЯМУЮ, а не через .blur(): реальный
        // blur — это событие потери фокуса, и полагаться, что программный blur()
        // его вызовет, нельзя (в headless-браузере программный focus() не всегда
        // становится document.activeElement, и .blur() тогда молча ничего не
        // делает). blur() ниже — просто убрать курсор/клавиатуру, если фокус
        // всё-таки настоящий; сам путь Enter/Esc от этого не зависит.
        exLibrisRenameInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                commitObservatoryRenameField();
                closeObservatoryRenameField();
                exLibrisRenameInput.blur();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation(); // не даём window-хендлеру закрыть всю книгу
                closeObservatoryRenameField(); // без коммита — ввод отбрасывается
                exLibrisRenameInput.blur();
            }
        });
        // Реальная потеря фокуса (тап мимо поля) — коммитит тем же путём, что Enter.
        exLibrisRenameInput.addEventListener('blur', () => {
            commitObservatoryRenameField();
            closeObservatoryRenameField();
        });
    }

    setupBookCloseGesture();
}

function onGlobalPopupKeydown(event) {
    if (event.key === 'Escape') {
        closeBook();
        return;
    }
    if (!bookOpen) return;
    // K-28: клавиатура — тот же сквозной переход, что кнопка и свайп.
    if (event.key === 'ArrowLeft') swipeBookPage(-1);
    if (event.key === 'ArrowRight') swipeBookPage(1);
}
