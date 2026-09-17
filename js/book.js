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
 * Шкала света у корешка (риск 3 дока K-06). S-03: окно — ступень лестницы
 * уровней: нижняя засечка — порог текущего уровня, верхняя — следующего,
 * флажок — `lifetimeMetaEarned`. Засечка сама и есть порог, поэтому знаков на
 * шкале нет ни одного — нож у засечки (открытый вопрос K-06) снят решением
 * заказчика 2026-09-10.
 */
function renderBookGauge() {
    const el = document.getElementById('bookGauge');
    if (!el) return;
    const trackH = el.getBoundingClientRect().height;
    el.innerHTML = '';

    const { earned, level, floor, ceil, ratio } = getLevelProgress();

    const fill = document.createElement('div');
    fill.className = 'book-gauge-fill';
    // K-25: заливка перекрывает обе риски запасом BOOK_GAUGE_OVERSHOOT_PX
    // вместо того, чтобы упираться точно в их координату.
    fill.style.bottom = `-${BOOK_GAUGE_OVERSHOOT_PX}px`;
    fill.style.height = `calc(${Math.round(ratio * 100)}% + ${BOOK_GAUGE_OVERSHOOT_PX * 2}px)`;
    el.appendChild(fill);

    const topTick = document.createElement('div');
    topTick.className = 'book-gauge-tick book-gauge-tick-top';
    topTick.textContent = String(ceil);
    el.appendChild(topTick);

    // S-03 (правка заказчика 2026-09-10): над верхней засечкой — куда она
    // ведёт, номером следующего уровня. Текст, не знак.
    const next = document.createElement('div');
    next.className = 'book-gauge-next';
    next.textContent = t('book.gaugeNextLevel', { n: level + 1 });
    el.appendChild(next);

    const bottomTick = document.createElement('div');
    bottomTick.className = 'book-gauge-tick book-gauge-tick-bottom';
    bottomTick.textContent = String(floor);
    el.appendChild(bottomTick);

    const flag = document.createElement('div');
    // На нуле флажку нечего показывать — «● 0» рядом с нижней риской выглядит
    // как случайная деталь, а не как метка прогресса, которого ещё нет. Узел
    // остаётся в разметке (visibility, не display/innerHTML) — на нём стоит
    // getClaimFlightTargetRect(), и первый в жизни игрока забор не должен
    // целиться в устаревший (и уже скрытый книгой) прямоугольник ленты.
    flag.className = earned > 0 ? 'book-gauge-flag' : 'book-gauge-flag book-gauge-flag-empty';
    // K-25: честная ratio-координата, но не ближе BOOK_GAUGE_FLAG_MIN_GAP_PX
    // к любой из рисок — иначе цифра нижнего значения садится на риску текстом.
    const minRatio = trackH > 0 ? Math.min(0.5, BOOK_GAUGE_FLAG_MIN_GAP_PX / trackH) : 0;
    const flagRatio = Math.min(Math.max(ratio, minRatio), 1 - minRatio);
    flag.style.bottom = `${flagRatio * 100}%`;
    flag.textContent = String(earned);
    el.appendChild(flag);
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
    const stampsWax = document.getElementById('bookTabStampsWax');
    if (stampsWax) stampsWax.hidden = !stampsHaveClaimable();
    const todayWax = document.getElementById('bookTabTodayWax');
    if (todayWax) todayWax.hidden = !todayHasSignal();
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
    renderBook();
    syncExLibrisAppMode();
}

function closeBook() {
    if (!bookOpen) return;
    closeObservatoryRenameField();
    dismissLevelBanner(true); // V-16/U-29: баннер не переживает закрытие книги
    stopBookTodayDawnTimer(); // O-03: закрыли книгу — тик посекундно никому не нужен
    bookOpen = false;
    const book = document.getElementById('book');
    if (book) {
        setBookTransform(book, '');
        book.hidden = true;
    }
    if (document.body) document.body.classList.remove('book-open-body');
    syncExLibrisAppMode();
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

/** K-26: во столько px книга уходит за нижний край экрана целиком. */
function bookTravelPx() {
    return window.innerHeight || document.documentElement.clientHeight || 800;
}

/**
 * K-35: книге ставят transform только через это. Встроенный холст экслибриса
 * лежит поверх книги отдельным fixed-узлом (K-13) и за ней сам не поедет — ход
 * книги повторяется на нём и на рамке гравюры. Вне экслибриса обе функции
 * работают ровно как прежняя присвоенная строка.
 */
function setBookTransform(book, transform) {
    if (book) book.style.transform = transform;
    if (typeof setExLibrisFollowTransform === 'function') setExLibrisFollowTransform(transform);
}

function setBookTransition(book, transition) {
    if (book) book.style.transition = transition;
    if (typeof setExLibrisFollowTransition === 'function') setExLibrisFollowTransition(transition);
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
        setBookTransform(book, finalTransform);
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
    setBookTransform(book, finalTransform);
}

/**
 * K-26: тап по ленте и Enter — короткая дорога к открытию, но не должны
 * выглядеть рывком: страница едет с закрытой позиции тем же ходом, что и
 * потягивание. openBook() остаётся синхронным (нужно тестовому харнессу и
 * программным вызовам) — это чисто визуальная доводка поверх готового состояния.
 */
function openBookAnimated(cut) {
    const book = document.getElementById('book');
    const canAnimate = !!book && !prefersReducedMotion();
    // K-35: открываем ДО подстановки стартовой позиции — раньше было наоборот.
    // Внутри openBook() холст экслибриса встраивается по замеру прямоугольника
    // страницы, и замер обязан пройти по книге в покое: с уже подставленным
    // сдвигом слот мерялся уехавшим вниз на целый экран, и небо оставалось за
    // нижним краем до ближайшего ресайза. Кадра между открытием и сдвигом не
    // будет — обе строки в одном тике, до первой отрисовки.
    openBook(cut);
    if (!canAnimate) return;
    setBookTransition(book, 'none');
    setBookTransform(book, `translateY(${bookTravelPx()}px)`);
    void book.offsetHeight; // рефлоу теперь, когда книга уже видима — фиксирует старт
    setBookTransition(book, `transform ${BOOK_SETTLE_MS}ms var(--ease)`);
    setBookTransform(book, '');
    const onEnd = (event) => {
        if (event.target !== book || event.propertyName !== 'transform') return;
        book.removeEventListener('transitionend', onEnd);
        setBookTransition(book, '');
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
    if (!book || !body) return;

    let startX = 0;
    let startY = 0;
    let axis = null; // 'vertical' | 'horizontal', решается на BOOK_AXIS_DECIDE_PX
    let closing = false;
    let tracking = false;

    const onStart = (event) => {
        if (isMultiTouch(event)) { tracking = false; return; }
        if (event.type === 'mousedown' && event.button !== 0) return;
        const p = getGesturePoint(event);
        if (!p) return;
        startX = p.clientX;
        startY = p.clientY;
        axis = null;
        closing = false;
        tracking = true;
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
        setBookTransform(book, `translateY(${Math.max(0, dy)}px)`);
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
            settleBookTransform(book, bookTravelPx(), () => closeBook());
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

    bookHandlersBound = true;
}

/**
 * K-05/K-26: тянем ленту-закладку вверх — книга едет за пальцем той же
 * формулой, что и закрытие (setupBookCloseGesture), и на отпускании либо
 * доводится до конца, либо падает обратно. Открывается на последней высечке.
 */
function setupRibbonPullGesture(ribbon) {
    const book = document.getElementById('book');
    let startY = 0;
    let startX = 0;
    let tracking = false;
    let decided = false;
    let dragging = false;
    let pulled = false;

    const beginDrag = () => {
        if (!book) return;
        dragging = true;
        pulled = true; // жест пошёл — тап после него не должен сработать отдельно
        setBookTransition(book, '');
        book.hidden = false;
        // U-21: раздел решается ДО первой отрисовки — страница едет за пальцем
        // уже атласом, а не подменяется им по приезде.
        applyFirstBookOpenCut();
        renderBook();
        setBookTransform(book, `translateY(${bookTravelPx()}px)`);
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
        setBookTransform(book, `translateY(${Math.max(0, bookTravelPx() - dy)}px)`);
    };

    const end = (event) => {
        if (!tracking) { tracking = false; return; }
        tracking = false;
        if (!dragging) return;
        const p = getGesturePoint(event);
        const dy = p ? startY - p.clientY : 0;
        dragging = false;

        if (dy >= BOOK_OPEN_SWIPE_MIN_PX) {
            // K-26: довод — доезжаем вверх до конца тем же ходом, что вёл
            // за пальцем, и только потом открываем по-настоящему.
            settleBookTransform(book, 0, () => openBook());
        } else {
            // ниже порога — страница падает обратно, книга остаётся закрытой
            settleBookTransform(book, bookTravelPx(), () => { if (book) book.hidden = true; });
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
