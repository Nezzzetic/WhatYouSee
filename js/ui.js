// ui.js — UI rendering for score, progression, hints and atlas

// =============================================================================
// SCORE UI
// =============================================================================

/** U-09: ✦ живёт только в шапке шторки — на поле счётчика нет. */
function updateScoreUI() {
    // A-03: пока к счётчику летит награда, число ждёт прилёта. Иначе перелёт
    // превращается в декорацию к уже случившемуся.
    if (_scoreHoldCount > 0) return;
    const sheetScoreEl = document.getElementById("sheetScoreValue");
    if (sheetScoreEl) sheetScoreEl.textContent = String(getMetaScore());
}

// =============================================================================
// A-03: ЗАЖИМ СЧЁТЧИКА ✦ И ПЕРЕЛЁТ НАГРАДЫ
// =============================================================================
//
// Зажим — счётчик, а не флаг, по двум причинам. Первая: к `updateScoreUI` ведут
// ДВА независимых пути — хвост `claimAchievementStep` и `updateProgressionUI`
// изнутри самого `awardMetaScore` (открытие страницы атласа, progression.js).
// Вторая: монет в воздухе бывает несколько, и число должно приехать после последней.
//
// ⚠️ Главный риск всей задачи — застрявший зажим: несостоявшийся прилёт заморозил бы
// счётчик навсегда. Страховок три: release идемпотентен, таймер снимает зажим
// безусловно, и `visibilitychange` сбрасывает его в ноль при уходе вкладки в фон.

let _scoreHoldCount = 0;
let _scoreHoldTimer = null;

function holdScoreDisplay() {
    _scoreHoldCount++;
    if (_scoreHoldTimer) clearTimeout(_scoreHoldTimer);
    _scoreHoldTimer = setTimeout(() => releaseScoreDisplay(true),
        CLAIM_COIN_MS + CLAIM_COIN_SAFETY_MS);
}

/** @param {boolean} [all] — снять зажим целиком (страховка), а не одну монету. */
function releaseScoreDisplay(all) {
    if (_scoreHoldCount <= 0) return;
    _scoreHoldCount = all ? 0 : _scoreHoldCount - 1;
    if (_scoreHoldCount > 0) return;
    if (_scoreHoldTimer) {
        clearTimeout(_scoreHoldTimer);
        _scoreHoldTimer = null;
    }
    updateScoreUI();
    pulseScoreDisplay();
}

/** Счётчик коротко вздрагивает: награда доехала именно сюда. */
function pulseScoreDisplay() {
    const el = document.querySelector('.sheet-score');
    if (!el) return;
    el.style.setProperty('--score-pulse-ms', `${CLAIM_SCORE_PULSE_MS}ms`);
    el.classList.remove('score-pulse');
    void el.offsetWidth; // reflow — иначе повторный пульс в серии не запустится
    el.classList.add('score-pulse');
    setTimeout(() => el.classList.remove('score-pulse'), CLAIM_SCORE_PULSE_MS);
}

function prefersReducedMotion() {
    try {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    } catch (e) {
        return false;
    }
}

/**
 * «Монета» с наградой летит от кнопки забора к счётчику ✦ в шапке шторки.
 *
 * @param {DOMRect|null} fromRect — прямоугольник кнопки, снятый ДО начисления:
 *        хвост забора зовёт `refreshSheetIfOpen()`, и к моменту полёта самого
 *        узла кнопки уже не существует.
 * @param {number} amount — размер награды. Летит именно она; счётчик на прилёте
 *        покажет реальный `getMetaScore()`, который после списания за страницу
 *        атласа бывает и меньше прежнего.
 * @returns {boolean} — взят ли зажим счётчика (false → число обновляется сразу).
 */
function flyClaimReward(fromRect, amount) {
    const target = document.querySelector('.sheet-score') || document.getElementById('sheetScoreValue');
    if (!fromRect || !target || prefersReducedMotion()) return false;
    if (document.querySelectorAll('.claim-coin').length >= CLAIM_COIN_MAX) return false;

    // Нулевой прямоугольник даёт скрытый элемент (свёрнутая dev-панель, строка
    // цепочки с другой страницы Наград). Лететь из угла экрана хуже, чем не лететь.
    if (!fromRect.width && !fromRect.height) return false;

    const toRect = target.getBoundingClientRect();
    if (!toRect.width && !toRect.height) return false; // шторка закрыта — лететь некуда

    const fromX = fromRect.left + fromRect.width / 2;
    const fromY = fromRect.top + fromRect.height / 2;

    const coin = document.createElement('div');
    coin.className = 'claim-coin';
    coin.style.left = `${fromX}px`;
    coin.style.top = `${fromY}px`;
    coin.style.setProperty('--claim-dx', `${toRect.left + toRect.width / 2 - fromX}px`);
    coin.style.setProperty('--claim-dy', `${toRect.top + toRect.height / 2 - fromY}px`);
    // Единственный источник длительности — константа: CSS её наследует, а уборка
    // узла считает от неё же, иначе анимация и `setTimeout` разъедутся.
    coin.style.setProperty('--claim-ms', `${CLAIM_COIN_MS}ms`);

    // Дуга без покадровки на JS: внешний узел едет по X линейно, средний —
    // по Y с ease-in. Сумма двух независимых осей и даёт параболу.
    const yAxis = document.createElement('div');
    yAxis.className = 'claim-coin-y';
    const pill = document.createElement('span');
    pill.className = 'claim-coin-pill';
    // Та же подпись, что на кнопке: она словно отрывается от неё и улетает.
    pill.textContent = `+${amount} ✦`;

    yAxis.appendChild(pill);
    coin.appendChild(yAxis);
    document.body.appendChild(coin);

    holdScoreDisplay();

    let done = false;
    const land = () => {
        if (done) return;
        done = true;
        if (coin.parentNode) coin.parentNode.removeChild(coin);
        releaseScoreDisplay();
    };
    // Как в `showInfoToast`: событие плюс страховочный таймер — `animationend`
    // не приходит, если узел снесли или вкладка ушла в фон.
    coin.addEventListener('animationend', (e) => { if (e.target === coin) land(); });
    setTimeout(land, CLAIM_COIN_MS + CLAIM_COIN_SAFETY_MS);
    return true;
}

// Вкладка ушла в фон — анимации замирают, `animationend` может не прийти вовсе.
// Счётчик оттаивает сразу: показать актуальное число важнее, чем долететь.
if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) releaseScoreDisplay(true);
    });
}

function updateMetaPageProgressUI() {
    /* progress to atlas pages shown only inside atlas overlay */
}

function updateFieldGoalsUI() {
    /* legacy — field goals disabled */
}

function renderFieldGoalClaimButtons() {
    /* legacy — field goals disabled */
}

// =============================================================================
// PROGRESSION UI
// =============================================================================

function updateProgressionUI() {
    updateScoreUI();
    updatePeekBar();
}

// M-05: строки «+30 за уровень» здесь больше нет — ✦ за ночь ушли в суточный
// квест «Ночь закрыта», и тост сообщает только сам факт завершения.
function showLevelCompleteToast() {
    const toast = document.getElementById("levelCompleteToast");
    if (!toast) return;

    const lines = [`<strong>${t('toast.levelComplete')}</strong>`];

    toast.innerHTML =
        `<button class="toast-close-btn" aria-label="${t('toast.close')}">×</button>` +
        lines.join('<br>');
    toast.hidden = false;

    toast.querySelector('.toast-close-btn').addEventListener('click', () => {
        toast.hidden = true;
    });
}

// =============================================================================
// CONSTELLATION HINTS
// =============================================================================

function setConstellationHintsPanelVisible(visible) {
    const el = document.getElementById('constellation-hints');
    if (!el) return;
    el.classList.toggle('hints-panel-hidden', !visible);
}

function updateUndoConstellationButtonState() {
    const btn = document.getElementById('undoLastConstellationBtn');
    if (!btn) return;
    btn.disabled = !(Array.isArray(constellations) && constellations.length > undoFloor);
}

let hintEntriesByStarCount = new Map();
let hintFilterMode = { type: 'known', value: null };
let isHintListDragging = false;
let hintListDragStartX = 0;
let hintListScrollStartLeft = 0;
let hintListDragHandlersBound = false;

/**
 * L-01: на вход идёт ID фигуры или fallback-имени, на выход — локализованное имя.
 * Пользовательские виды (их вводит игрок) shapeLabel возвращает как есть.
 */
function getDisplayShapeName(shapeName) {
    if (typeof shapeName !== 'string') return t('hints.unknownConstellation');
    const trimmed = shapeName.trim();
    if (trimmed.length === 0) return t('hints.unknownConstellation');
    return shapeLabel(trimmed);
}

function getShapeColor(shapeName) {
    const shapeInfo = SHAPES[shapeName] || SHAPES[SHAPE_UNRECOGNIZED];
    return shapeInfo && Array.isArray(shapeInfo.color) ? shapeInfo.color : SHAPES[SHAPE_UNRECOGNIZED].color;
}

function getHintEntriesByStarCount() {
    const groups = new Map();

    for (const name of getUnlockedAtlasShapeNames()) {
        const pattern = SHAPE_PATTERNS[name];
        if (!pattern || !Array.isArray(pattern.stars)) continue;
        const starCount = pattern.stars.length;
        if (!groups.has(starCount)) groups.set(starCount, []);
        groups.get(starCount).push({
            name,
            color: getShapeColor(name),
            pattern,
            isCustom: false
        });
    }

    for (const customType of customTypes) {
        const pattern = getCustomPattern(customType);
        if (!pattern || !Array.isArray(pattern.stars)) continue;
        const starCount = pattern.stars.length;
        if (!groups.has(starCount)) groups.set(starCount, []);
        groups.get(starCount).push({
            name: getDisplayShapeName(customType.name),
            color: Array.isArray(customType.color) ? customType.color : getShapeColor(SHAPE_UNRECOGNIZED),
            pattern,
            isCustom: true
        });
    }

    // L-01: сортируем по тому, что игрок видит, и в его локали — не по ID.
    for (const entries of groups.values()) {
        entries.sort((a, b) => getDisplayShapeName(a.name)
            .localeCompare(getDisplayShapeName(b.name), getLocale()));
    }

    return groups;
}

function getAllHintEntries() {
    const all = [];
    for (const group of hintEntriesByStarCount.values()) {
        for (const entry of group) all.push(entry);
    }
    return all;
}

function getFilteredHintEntries() {
    const all = getAllHintEntries();

    if (hintFilterMode.type === 'undiscovered') {
        return all.filter(entry => !isShapeCreated(entry.name));
    }
    if (hintFilterMode.type === 'star' && hintFilterMode.value !== null) {
        return hintEntriesByStarCount.get(hintFilterMode.value) || [];
    }
    if (hintFilterMode.type === 'favorite') {
        return all.filter(entry => isFavoriteShape(entry.name));
    }

    // known (default): собранные с открытых страниц атласа
    return all.filter(entry => isShapeCreated(entry.name));
}

function getSortedHintStarCounts() {
    return [...hintEntriesByStarCount.keys()].sort((a, b) => a - b);
}

function createHintItem(entry) {
    const item = document.createElement('div');
    item.className = 'hint-item';

    const canvas = document.createElement('canvas');
    canvas.className = 'hint-canvas';
    canvas.width = 60;
    canvas.height = 60;

    item.appendChild(canvas);

    if (isShapeCreated(entry.name)) {
        const label = document.createElement('span');
        label.className = 'hint-name';
        label.textContent = getDisplayShapeName(entry.name);
        label.style.color = `rgb(${entry.color[0]},${entry.color[1]},${entry.color[2]})`;
        item.appendChild(label);
    }

    if (canvas && entry.pattern) {
        drawHintPattern(canvas, entry.pattern, entry.color);
    }

    return item;
}

function renderHintFilterButtons() {
    const filterBar = document.getElementById('hintStarFilterBar');
    if (!filterBar) return;

    filterBar.innerHTML = '';
    const starCounts = getSortedHintStarCounts();

    const knownBtn = document.createElement('button');
    knownBtn.type = 'button';
    knownBtn.className = 'hint-filter-btn';
    if (hintFilterMode.type === 'known') knownBtn.classList.add('active');
    knownBtn.textContent = '✓';
    knownBtn.title = t('hints.filterKnown');
    knownBtn.addEventListener('click', () => {
        hintFilterMode = { type: 'known', value: null };
        renderHintFilterButtons();
        renderHintList();
    });
    filterBar.appendChild(knownBtn);

    for (const count of starCounts) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hint-filter-btn';
        if (hintFilterMode.type === 'star' && hintFilterMode.value === count) btn.classList.add('active');
        btn.textContent = `${count}★`;
        btn.title = tp('hints.filterStars', count);
        btn.addEventListener('click', () => {
            hintFilterMode = { type: 'star', value: count };
            renderHintFilterButtons();
            renderHintList();
        });
        filterBar.appendChild(btn);
    }

    const unknownBtn = document.createElement('button');
    unknownBtn.type = 'button';
    unknownBtn.className = 'hint-filter-btn';
    if (hintFilterMode.type === 'undiscovered') unknownBtn.classList.add('active');
    unknownBtn.textContent = '???';
    unknownBtn.title = t('hints.filterUndiscovered');
    unknownBtn.addEventListener('click', () => {
        hintFilterMode = { type: 'undiscovered', value: null };
        renderHintFilterButtons();
        renderHintList();
    });
    filterBar.appendChild(unknownBtn);

    const favoritesBtn = document.createElement('button');
    favoritesBtn.type = 'button';
    favoritesBtn.className = 'hint-filter-btn';
    if (hintFilterMode.type === 'favorite') favoritesBtn.classList.add('active');
    favoritesBtn.textContent = '★';
    favoritesBtn.title = t('hints.filterFavorite');
    favoritesBtn.addEventListener('click', () => {
        hintFilterMode = { type: 'favorite', value: null };
        renderHintFilterButtons();
        renderHintList();
    });
    filterBar.appendChild(favoritesBtn);
}

function renderHintList() {
    const listEl = document.getElementById('hintList');
    if (!listEl) return;

    listEl.innerHTML = '';
    const entries = getFilteredHintEntries();

    if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'hint-empty';
        empty.textContent = hintFilterMode.type === 'undiscovered'
            ? t('hints.emptyUndiscovered')
            : t('hints.emptyKnown');
        listEl.appendChild(empty);
        return;
    }

    entries.sort((a, b) => {
        const ca = a.pattern?.stars?.length || 0;
        const cb = b.pattern?.stars?.length || 0;
        if (ca !== cb) return ca - cb;
        return getDisplayShapeName(a.name)
            .localeCompare(getDisplayShapeName(b.name), getLocale());
    });

    for (const entry of entries) {
        listEl.appendChild(createHintItem(entry));
    }
}

function setupHintListDragScroll() {
    if (hintListDragHandlersBound) return;

    const listEl = document.getElementById('hintList');
    if (!listEl) return;

    const startDrag = (clientX) => {
        isHintListDragging = true;
        hintListDragStartX = clientX;
        hintListScrollStartLeft = listEl.scrollLeft;
        listEl.classList.add('dragging');
    };

    const moveDrag = (clientX) => {
        if (!isHintListDragging) return;
        const dx = clientX - hintListDragStartX;
        listEl.scrollLeft = hintListScrollStartLeft - dx;
    };

    const endDrag = () => {
        if (!isHintListDragging) return;
        isHintListDragging = false;
        listEl.classList.remove('dragging');
    };

    listEl.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        startDrag(event.clientX);
        event.preventDefault();
    });
    listEl.addEventListener('mousemove', (event) => {
        moveDrag(event.clientX);
        if (isHintListDragging) event.preventDefault();
    });
    listEl.addEventListener('mouseleave', endDrag);
    window.addEventListener('mouseup', endDrag);

    listEl.addEventListener('touchstart', (event) => {
        if (!event.touches || event.touches.length !== 1) return;
        startDrag(event.touches[0].clientX);
    }, { passive: true });
    listEl.addEventListener('touchmove', (event) => {
        if (!event.touches || event.touches.length !== 1) return;
        moveDrag(event.touches[0].clientX);
    }, { passive: true });
    listEl.addEventListener('touchend', endDrag);
    listEl.addEventListener('touchcancel', endDrag);

    hintListDragHandlersBound = true;
}

function initConstellationHints() {
    const filterBar = document.getElementById('hintStarFilterBar');
    if (filterBar) filterBar.style.display = '';

    hintEntriesByStarCount = getHintEntriesByStarCount();
    if (hintFilterMode.type === 'star') {
        const starCounts = getSortedHintStarCounts();
        if (hintFilterMode.value === null || !starCounts.includes(hintFilterMode.value)) {
            hintFilterMode = { type: 'known', value: null };
        }
    }

    renderHintFilterButtons();
    renderHintList();
    setupHintListDragScroll();
}

function refreshConstellationHints() {
    hintEntriesByStarCount = getHintEntriesByStarCount();
    if (hintFilterMode.type === 'star' && hintFilterMode.value !== null
        && !hintEntriesByStarCount.has(hintFilterMode.value)) {
        hintFilterMode = { type: 'known', value: null };
    }
    renderHintFilterButtons();
    renderHintList();
}

/** Левая панель обновляется только после завершения уровня. */
function refreshConstellationHintsIfLevelComplete() {
    if (!constellationArtRevealed) return;
    refreshConstellationHints();
}

function onConstellationCreated(shapeName) {
    if (!shapeName) return;
    updatePeekBar();
    refreshSheetIfOpen();
}

function drawHintPattern(canvas, pattern, color) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const pad = 8;
    const iw = w - pad * 2;
    const ih = h - pad * 2;

    ctx.clearRect(0, 0, w, h);

    const pts = pattern.stars.map(([nx, ny]) => [pad + nx * iw, pad + ny * ih]);

    ctx.strokeStyle = `rgba(${color[0]},${color[1]},${color[2]},0.7)`;
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    for (const [a, b] of pattern.lines) {
        ctx.beginPath();
        ctx.moveTo(pts[a][0], pts[a][1]);
        ctx.lineTo(pts[b][0], pts[b][1]);
        ctx.stroke();
    }

    for (const [px, py] of pts) {
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${color[0]},${color[1]},${color[2]})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(px, py, 5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color[0]},${color[1]},${color[2]},0.15)`;
        ctx.fill();
    }
}

// =============================================================================
// ATLAS DATA
// =============================================================================

function getFallbackPatternFromSignature(signature) {
    const starCount = Math.max(3, Math.min(6, signature?.starCount || 4));
    const lineCount = Math.max(2, signature?.lineCount || (starCount - 1));

    const stars = [];
    for (let i = 0; i < starCount; i++) {
        const angle = (-Math.PI / 2) + (2 * Math.PI * i / starCount);
        stars.push([
            0.5 + Math.cos(angle) * 0.35,
            0.5 + Math.sin(angle) * 0.35
        ]);
    }

    const lines = [];
    const closedEdges = lineCount >= starCount;
    const maxEdges = closedEdges ? starCount : Math.min(lineCount, starCount - 1);
    for (let i = 0; i < maxEdges; i++) {
        const a = i;
        const b = (i + 1) % starCount;
        lines.push([a, b]);
    }

    return { stars, lines };
}

function getCustomPattern(customType) {
    if (customType && customType.patternSnapshot &&
        Array.isArray(customType.patternSnapshot.stars) &&
        Array.isArray(customType.patternSnapshot.lines)) {
        return customType.patternSnapshot;
    }
    return getFallbackPatternFromSignature(customType?.signature);
}

function getShapeXP(shapeName) {
    return SHAPE_XP[shapeName] !== undefined ? SHAPE_XP[shapeName] : CUSTOM_TYPE_XP;
}

function getAtlasEntryForShape(name) {
    const pattern = SHAPE_PATTERNS[name];
    const created = isShapeCreated(name);
    return {
        name,
        color: getShapeColor(name),
        pattern,
        starCount: pattern?.stars?.length || 0,
        isCustom: false,
        isCreated: created,
        isFavorite: isFavoriteShape(name),
        atlasState: created ? 'known' : 'unknown'
    };
}

function getAtlasPageEntries(pageIndex) {
    if (pageIndex < 0 || pageIndex >= ATLAS_PAGE_COUNT) return [];
    return ATLAS_PAGES[pageIndex].map(name => getAtlasEntryForShape(name));
}

/** U-09: цвет карточки — золото у огранённой фигуры, иначе цвет из SHAPES. */
const ATLAS_FACETED_COLOR = [255, 211, 92];

function createAtlasEntryCard(entry) {
    const faceted = entry.isCreated && typeof isShapeFaceted === 'function' && isShapeFaceted(entry.name);
    const drawColor = faceted ? ATLAS_FACETED_COLOR : entry.color;

    const card = document.createElement('div');
    card.className = 'atlas-card'
        + (entry.isCreated ? ' atlas-card-known' : ' atlas-card-unknown')
        + (faceted ? ' atlas-card-faceted' : '');

    if (faceted) {
        const crown = document.createElement('span');
        crown.className = 'atlas-card-crown';
        crown.textContent = '👑';
        card.appendChild(crown);
    }

    const canvas = document.createElement('canvas');
    canvas.className = 'atlas-card-canvas';
    canvas.width = 76;
    canvas.height = 76;
    card.appendChild(canvas);

    const title = document.createElement('div');
    if (entry.isCreated) {
        title.className = 'atlas-card-title';
        title.textContent = getDisplayShapeName(entry.name);
        title.style.color = `rgb(${drawColor[0]},${drawColor[1]},${drawColor[2]})`;
    } else {
        // Имя фигуры — сюрприз до первого создания
        title.className = 'atlas-card-title atlas-card-title-unknown';
        title.textContent = t('atlas.unknownCard');
    }
    card.appendChild(title);

    // U-09: 5 граней. Ни цифр, ни кнопок — грань просто горит или нет.
    if (entry.isCreated) {
        const facets = document.createElement('div');
        facets.className = 'atlas-facets';
        for (const color of ACHIEVEMENT_COLOR_KEYS) {
            const lit = typeof isShapeFacetLit === 'function' && isShapeFacetLit(entry.name, color);
            const gem = document.createElement('span');
            gem.className = `atlas-facet atlas-facet-${color}` + (lit ? ' atlas-facet-lit' : '');
            gem.title = achievementColorLabel(color);
            facets.appendChild(gem);
        }
        card.appendChild(facets);
    }

    if (entry.pattern) drawHintPattern(canvas, entry.pattern, drawColor);

    return card;
}

function renderAtlasList() {
    const list = document.getElementById('atlasList');
    if (!list) return;
    list.innerHTML = '';

    const pageIndex = getSheetPageIndex('atlas');

    if (!isAtlasPageUnlocked(pageIndex)) {
        // Страницы открываются автоматически при накоплении ✦
        const locked = document.createElement('div');
        locked.className = 'atlas-page-locked';
        const cost = getAtlasPageUnlockCost(pageIndex);

        const lockedText = document.createElement('p');
        lockedText.textContent = t('atlas.pageLocked', { n: cost });
        locked.appendChild(lockedText);

        const progressText = document.createElement('p');
        progressText.className = 'atlas-page-locked-progress';
        progressText.textContent = t('atlas.pageLockedProgress', {
            current: Math.min(getMetaScore(), cost),
            target: cost
        });
        locked.appendChild(progressText);

        list.appendChild(locked);
        return;
    }

    for (const entry of getAtlasPageEntries(pageIndex)) {
        list.appendChild(createAtlasEntryCard(entry));
    }
}

// =============================================================================
// U-09: ШТОРКА — общий каркас обеих половин
// =============================================================================

let sheetSection = 'atlas';          // 'atlas' | 'rewards'
let sheetOpen = false;
let sheetPageIndices = { atlas: 0, rewards: 0 };
let sheetHandlersBound = false;

function getSheetPageCount(section) {
    return section === 'rewards' ? REWARD_PAGE_COUNT : ATLAS_PAGE_COUNT;
}

function getSheetPageIndex(section) {
    const key = section || sheetSection;
    const max = getSheetPageCount(key) - 1;
    return Math.max(0, Math.min(max, sheetPageIndices[key] || 0));
}

function setSheetPageIndex(section, index) {
    const key = section || sheetSection;
    const count = getSheetPageCount(key);
    sheetPageIndices[key] = Math.max(0, Math.min(count - 1, index));
}

function isSheetOpen() {
    return sheetOpen;
}

/** Заголовок шторки: раздел и текущая страница. */
function renderSheetTitle() {
    const el = document.getElementById('sheetTitle');
    if (!el) return;
    const pageIndex = getSheetPageIndex();
    if (sheetSection === 'atlas') {
        el.innerHTML = t('sheet.atlasTitle', { n: pageIndex + 1 });
    } else {
        const page = REWARD_PAGES[pageIndex];
        el.innerHTML = t('sheet.rewardsTitle', { title: page ? page.title : '' });
    }
}

/** Эмблема страницы атласа — её первое созвездие; запертая — замок. */
function createAtlasRailIcon(pageIndex) {
    if (!isAtlasPageUnlocked(pageIndex)) {
        const lock = document.createElement('span');
        lock.className = 'rail-lock';
        lock.textContent = '🔒';
        return lock;
    }
    const firstShape = ATLAS_PAGES[pageIndex] && ATLAS_PAGES[pageIndex][0];
    const pattern = firstShape ? SHAPE_PATTERNS[firstShape] : null;
    const canvas = document.createElement('canvas');
    canvas.className = 'rail-canvas';
    canvas.width = 30;
    canvas.height = 30;
    if (pattern) drawHintPattern(canvas, pattern, [200, 208, 228]);
    return canvas;
}

function renderSheetRail() {
    const rail = document.getElementById('sheetRail');
    if (!rail) return;
    rail.innerHTML = '';

    const count = getSheetPageCount(sheetSection);
    const active = getSheetPageIndex();

    for (let i = 0; i < count; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rail-btn' + (i === active ? ' rail-btn-on' : '');

        if (sheetSection === 'atlas') {
            btn.appendChild(createAtlasRailIcon(i));
            btn.setAttribute('aria-label', t('sheet.page', { n: i + 1 }));
        } else {
            const page = REWARD_PAGES[i];
            const icon = document.createElement('span');
            icon.className = 'rail-emoji';
            icon.textContent = page.icon;
            btn.appendChild(icon);
            btn.setAttribute('aria-label', page.title);
            // Бейдж — единственный указатель, куда идти за ✦
            if (typeof rewardPageHasClaimable === 'function' && rewardPageHasClaimable(i)) {
                const badge = document.createElement('span');
                badge.className = 'rail-badge';
                btn.appendChild(badge);
            }
        }

        btn.addEventListener('click', () => {
            setSheetPageIndex(sheetSection, i);
            renderSheet();
        });
        rail.appendChild(btn);
    }
}

function renderSheetSegment() {
    const atlasBtn = document.getElementById('segAtlasBtn');
    const rewardsBtn = document.getElementById('segRewardsBtn');
    if (atlasBtn) atlasBtn.classList.toggle('seg-btn-on', sheetSection === 'atlas');
    if (rewardsBtn) rewardsBtn.classList.toggle('seg-btn-on', sheetSection === 'rewards');
    renderObservatorySegButton();
    renderObservatoryLockHint();
}

// =============================================================================
// B-02: ОБСЕРВАТОРИЯ В UI
// =============================================================================

/** Развёрнут ли хинт запертой обсерватории (сворачивается сменой раздела). */
let observatoryHintOpen = false;

/**
 * Третья кнопка сегмента. Она обещание, а не сюрприз: видна с первой ночи.
 *
 * Иконка ОДНА во всех состояниях — 🔭. Обсерватория опознаётся по телескопу
 * ещё запертой, и менять символ при открытии значило бы подменить примету, по
 * которой игрок эту кнопку уже запомнил. Замок живёт внутри хинта, где
 * объясняет условие, а не просто говорит «нельзя».
 *
 * Отличается только приглушённость запертой. Жёлтой подсветки (seg-btn-on)
 * нет ни в одном состоянии: кнопка не показывает раздел, а меняет мир за
 * шторкой, и «включённой» не бывает. Куда ведёт тап, говорит подсказка, а
 * какой мир сейчас — сам экран под шторкой (она при переходе не закрывается).
 */
const OBSERVATORY_SEG_ICON = '🔭';

function renderObservatorySegButton() {
    const btn = document.getElementById('segObservatoryBtn');
    if (!btn) return;

    const unlocked = typeof isObservatoryUnlocked === 'function' && isObservatoryUnlocked();
    const inObservatory = typeof isObservatoryMode === 'function' && isObservatoryMode();

    btn.classList.toggle('seg-btn-locked', !unlocked);
    btn.textContent = OBSERVATORY_SEG_ICON;

    let key;
    if (!unlocked) {
        key = 'observatory.lockedTitle';
    } else if (inObservatory) {
        key = 'observatory.toField';
    } else {
        key = 'observatory.toObservatory';
    }
    btn.setAttribute('title', t(key));
    btn.setAttribute('aria-label', t(key));
}

function renderObservatoryLockHint() {
    const hint = document.getElementById('observatoryLockHint');
    if (!hint) return;

    const unlocked = typeof isObservatoryUnlocked === 'function' && isObservatoryUnlocked();
    if (unlocked) observatoryHintOpen = false;
    hint.hidden = !observatoryHintOpen || unlocked;
    if (hint.hidden) return;

    const current = typeof getLifetimeMetaEarned === 'function' ? getLifetimeMetaEarned() : 0;
    const target = OBSERVATORY_UNLOCK_COST;

    const titleEl = document.getElementById('obsLockTitleText');
    const subEl = document.getElementById('obsLockSubText');
    const fillEl = document.getElementById('obsLockBarFill');
    const progressEl = document.getElementById('obsLockProgressText');

    if (titleEl) titleEl.textContent = t('observatory.lockedTitle');
    if (subEl) subEl.textContent = t('observatory.lockedSub');
    if (fillEl) {
        const ratio = target > 0 ? Math.max(0, Math.min(1, current / target)) : 0;
        fillEl.style.width = (ratio * 100).toFixed(1) + '%';
    }
    // Бар свой, не ✦ из шапки: тот — баланс, он обнуляется автосписанием
    // страницы атласа и до порога не доберётся никогда.
    if (progressEl) {
        progressEl.textContent = t('observatory.lockedProgress', { current, target });
    }
}

/**
 * Поповер закрывается тапом по нему самому и тапом мимо. Слушатель один на
 * документ и вешается лениво: пока хинт свёрнут, он выходит первой строкой.
 * Кнопка исключена — она сама переключает, иначе тап по ней открыл бы и тут же
 * закрыл хинт.
 */
let observatoryHintDismissBound = false;

function bindObservatoryHintDismiss() {
    if (observatoryHintDismissBound) return;
    observatoryHintDismissBound = true;
    document.addEventListener('click', (event) => {
        if (!observatoryHintOpen) return;
        const btn = document.getElementById('segObservatoryBtn');
        if (btn && btn.contains(event.target)) return;
        observatoryHintOpen = false;
        renderObservatoryLockHint();
    });
}

/** Тап по кнопке: заперта — разворачиваем хинт, открыта — меняем мир. */
function onObservatorySegClick() {
    if (typeof isObservatoryUnlocked !== 'function' || !isObservatoryUnlocked()) {
        observatoryHintOpen = !observatoryHintOpen;
        if (observatoryHintOpen) bindObservatoryHintDismiss();
        renderObservatoryLockHint();
        return;
    }
    // Шторку НЕ закрываем: игрок может сходить туда-обратно, не поднимая её
    // каждый раз заново. Что мир сменился, видно по иконке кнопки — она
    // перерисовывается тут же, из setAppMode → updateObservatoryUI.
    const next = (typeof isObservatoryMode === 'function' && isObservatoryMode())
        ? 'field'
        : 'observatory';
    setAppMode(next);
}

/** Тумблер 🔗/✋ вместо ↩ и обратно; вызывается при смене режима приложения. */
function updateObservatoryUI() {
    const inObservatory = typeof isObservatoryMode === 'function' && isObservatoryMode();

    const undoBtn = document.getElementById('undoLastConstellationBtn');
    if (undoBtn) undoBtn.hidden = inObservatory;

    const seg = document.getElementById('observatoryModeSeg');
    if (seg) seg.hidden = !inObservatory;

    if (inObservatory) {
        const mode = typeof getObservatoryMode === 'function' ? getObservatoryMode() : 'connect';
        const connectBtn = document.getElementById('obsModeConnectBtn');
        const moveBtn = document.getElementById('obsModeMoveBtn');
        // Активное положение подсвечено всегда: в «перемещать» тап красит звезду,
        // а в «соединять» нет, и перепутать это дорого.
        if (connectBtn) connectBtn.classList.toggle('seg-btn-on', mode === 'connect');
        if (moveBtn) moveBtn.classList.toggle('seg-btn-on', mode === 'move');
    }

    renderObservatorySegButton();
}

function renderSheet() {
    const atlasList = document.getElementById('atlasList');
    const achvList = document.getElementById('achievementsList');
    const content = document.getElementById('sheetContent');
    const isAtlas = sheetSection === 'atlas';

    if (atlasList) atlasList.hidden = !isAtlas;
    if (achvList) achvList.hidden = isAtlas;
    // Прокрутка — только в Наградах; атлас всегда влезает целиком
    if (content) content.classList.toggle('sheet-content-scroll', !isAtlas);

    if (isAtlas) {
        renderAtlasList();
    } else {
        recomputeAchievementsClaimable();
        renderAchievementsList();
        if (content) content.scrollTop = 0;
    }

    renderSheetTitle();
    renderSheetRail();
    renderSheetSegment();
    updateScoreUI();
    updatePeekBar();
}

function refreshSheetIfOpen() {
    if (sheetOpen) renderSheet();
}

function openSheet(section) {
    if (section === 'atlas' || section === 'rewards') sheetSection = section;
    sheetOpen = true;
    const sheet = document.getElementById('sheet');
    const scrim = document.getElementById('sheetScrim');
    if (sheet) { sheet.hidden = false; sheet.classList.add('sheet-open'); }
    if (scrim) scrim.hidden = false;
    if (document.body) document.body.classList.add('sheet-open-body');
    renderSheet();
}

function closeSheet() {
    if (!sheetOpen) return;
    sheetOpen = false;
    observatoryHintOpen = false; // B-02: поповер не переживает закрытие шторки
    const sheet = document.getElementById('sheet');
    const scrim = document.getElementById('sheetScrim');
    if (sheet) {
        sheet.classList.remove('sheet-open');
        sheet.style.transform = '';
        sheet.hidden = true;
    }
    if (scrim) scrim.hidden = true;
    if (document.body) document.body.classList.remove('sheet-open-body');
}

function switchSheetSection(section) {
    if (sheetSection === section) return;
    sheetSection = section;
    observatoryHintOpen = false; // B-02: открытие другого раздела сворачивает хинт
    renderSheet();
}

function stepSheetPage(delta) {
    const count = getSheetPageCount(sheetSection);
    const next = getSheetPageIndex() + delta;
    if (next < 0 || next >= count) return false;
    setSheetPageIndex(sheetSection, next);
    renderSheet();
    return true;
}

/** Peek-строка: ✦ и бейдж «в Наградах есть что забрать». */
function updatePeekBar() {
    const badge = document.getElementById('peekRewardsBadge');
    if (badge) {
        const claimable = typeof hasClaimableAchievements === 'function' && hasClaimableAchievements();
        badge.hidden = !claimable;
    }
}

// =============================================================================
// U-09: ЖЕСТЫ ШТОРКИ
// =============================================================================

const SHEET_SWIPE_MIN_PX = 48;       // порог смены страницы
const SHEET_CLOSE_MIN_PX = 70;       // порог закрытия потягиванием вниз
const SHEET_OPEN_MIN_PX = 40;        // порог открытия вытягиванием вверх
const SHEET_AXIS_DECIDE_PX = 10;     // после стольких px решаем, чей это жест

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
 * Правило bottom sheet: тянут вниз в самом верху списка (или за ручку) —
 * закрытие; тянут вниз в середине — прокрутка (только Награды); ведут вбок
 * под углом < 30° — листание страниц.
 *
 * Слушаем и touch, и mouse: на десктопе шторка тянется мышью так же, как
 * пальцем на телефоне.
 */
function setupSheetGestures() {
    if (sheetHandlersBound) return;
    const sheet = document.getElementById('sheet');
    const content = document.getElementById('sheetContent');
    const handle = document.getElementById('sheetHandle');
    const peek = document.getElementById('peekBar');
    if (!sheet || !content || !handle) return;

    let startX = 0, startY = 0;
    let axis = null;                 // null | 'x' | 'closing' | 'scroll'
    let fromHandle = false;
    let tracking = false;

    const onStart = (event) => {
        if (isMultiTouch(event)) { tracking = false; return; }
        if (event.type === 'mousedown' && event.button !== 0) return;
        const p = getGesturePoint(event);
        if (!p) return;
        startX = p.clientX;
        startY = p.clientY;
        axis = null;
        tracking = true;
        fromHandle = handle.contains(event.target);
    };

    const onMove = (event) => {
        if (!tracking || isMultiTouch(event)) return;
        const p = getGesturePoint(event);
        if (!p) return;
        const dx = p.clientX - startX;
        const dy = p.clientY - startY;

        if (axis === null) {
            if (Math.abs(dx) < SHEET_AXIS_DECIDE_PX && Math.abs(dy) < SHEET_AXIS_DECIDE_PX) return;
            // Ближе к горизонтали (< 30°) — листаем страницы
            if (Math.abs(dx) > Math.abs(dy) * 1.73) {
                axis = 'x';
            } else if (dy > 0 && (fromHandle || content.scrollTop <= 0)) {
                axis = 'closing';
            } else {
                axis = 'scroll';   // отдаём браузеру: вертикальная прокрутка Наград
            }
        }

        if (axis === 'scroll') return;

        if (event.cancelable) event.preventDefault();
        if (axis === 'closing') {
            sheet.style.transform = `translateY(${Math.max(0, dy)}px)`;
        }
    };

    const onEnd = (event) => {
        if (!tracking) return;
        tracking = false;
        const p = getGesturePoint(event);
        const dx = p ? p.clientX - startX : 0;
        const dy = p ? p.clientY - startY : 0;

        sheet.style.transform = '';

        if (axis === 'x' && Math.abs(dx) >= SHEET_SWIPE_MIN_PX) {
            stepSheetPage(dx < 0 ? 1 : -1);
        } else if (axis === 'closing' && dy >= SHEET_CLOSE_MIN_PX) {
            closeSheet();
        }
        axis = null;
    };

    sheet.addEventListener('touchstart', onStart, { passive: true });
    sheet.addEventListener('touchmove', onMove, { passive: false });
    sheet.addEventListener('touchend', onEnd);
    sheet.addEventListener('touchcancel', onEnd);
    sheet.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);

    // Вытягивание шторки вверх за peek-строку — обратный жест к закрытию
    if (peek) setupPeekPullGesture(peek);

    // Десктоп: колесо вбок листает страницы
    sheet.addEventListener('wheel', (event) => {
        if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
        event.preventDefault();
        stepSheetPage(event.deltaX > 0 ? 1 : -1);
    }, { passive: false });

    sheetHandlersBound = true;
}

/** Тянем peek-строку вверх — шторка открывается на последнем разделе. */
function setupPeekPullGesture(peek) {
    let startY = 0;
    let startX = 0;
    let tracking = false;
    let pulled = false;

    const start = (event) => {
        if (isMultiTouch(event)) { tracking = false; return; }
        if (event.type === 'mousedown' && event.button !== 0) return;
        const p = getGesturePoint(event);
        if (!p) return;
        startY = p.clientY;
        startX = p.clientX;
        tracking = true;
        pulled = false;
    };

    const move = (event) => {
        if (!tracking || sheetOpen || isMultiTouch(event)) return;
        const p = getGesturePoint(event);
        if (!p) return;
        const dy = startY - p.clientY;
        const dx = Math.abs(p.clientX - startX);
        if (dy >= SHEET_OPEN_MIN_PX && dy > dx) {
            pulled = true;
            tracking = false;
            openSheet(sheetSection);
        }
    };

    const end = () => { tracking = false; };

    peek.addEventListener('touchstart', start, { passive: true });
    peek.addEventListener('touchmove', move, { passive: true });
    peek.addEventListener('touchend', end);
    peek.addEventListener('touchcancel', end);
    peek.addEventListener('mousedown', start);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);

    // Потянули вверх — click по кнопке под пальцем не должен переключать раздел
    peek.addEventListener('click', (event) => {
        if (!pulled) return;
        pulled = false;
        event.stopPropagation();
        event.preventDefault();
    }, true);

    // Тап по свёрнутой шторке разворачивает её
    peek.addEventListener('click', () => {
        if (sheetOpen) return;
        openSheet(sheetSection);
    });
}

function setupSheetControls() {
    // Свёрнутая шторка — единая цель: тап или потягивание вверх открывают её
    // на том разделе, где игрок был в прошлый раз.
    document.getElementById('peekBar')?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        openSheet(sheetSection);
    });
    document.getElementById('segAtlasBtn')?.addEventListener('click', () => switchSheetSection('atlas'));
    document.getElementById('segRewardsBtn')?.addEventListener('click', () => switchSheetSection('rewards'));
    // B-02: третья кнопка сегмента и тумблер режима холста
    document.getElementById('segObservatoryBtn')?.addEventListener('click', onObservatorySegClick);
    document.getElementById('obsModeConnectBtn')?.addEventListener('click', () => setObservatoryMode('connect'));
    document.getElementById('obsModeMoveBtn')?.addEventListener('click', () => setObservatoryMode('move'));
    document.getElementById('sheetCloseBtn')?.addEventListener('click', closeSheet);
    document.getElementById('sheetScrim')?.addEventListener('click', closeSheet);
    setupSheetGestures();
}

function onGlobalPopupKeydown(event) {
    if (event.key === 'Escape') {
        closeSheet();
        return;
    }
    if (!sheetOpen) return;
    if (event.key === 'ArrowLeft') stepSheetPage(-1);
    if (event.key === 'ArrowRight') stepSheetPage(1);
}

