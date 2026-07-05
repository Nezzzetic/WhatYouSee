// ui.js — UI rendering for score, progression, hints and atlas

// =============================================================================
// SCORE UI
// =============================================================================

function updateScoreUI() {
    const scoreEl = document.getElementById("scoreCounterValue");
    if (scoreEl) scoreEl.textContent = getMetaScore();
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
    const metaEl = document.getElementById("atlasMetaScoreDisplay");
    if (metaEl) metaEl.textContent = String(getMetaScore());

    updateScoreUI();
    updateAtlasButtonState();
}

function showLevelCompleteToast(levelPts) {
    const toast = document.getElementById("levelCompleteToast");
    if (!toast) return;

    const level = levelPts || 0;
    const lines = ['<strong>Уровень завершён</strong>'];

    if (level > 0) lines.push(`+${level} за уровень`);

    toast.innerHTML =
        `<button class="toast-close-btn" aria-label="Закрыть">×</button>` +
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

function getDisplayShapeName(shapeName) {
    if (typeof shapeName !== 'string') return 'Неизвестное созвездие';
    const trimmed = shapeName.trim();
    return trimmed.length > 0 ? trimmed : 'Неизвестное созвездие';
}

function getShapeColor(shapeName) {
    const shapeInfo = SHAPES[shapeName] || SHAPES['Фигура'];
    return shapeInfo && Array.isArray(shapeInfo.color) ? shapeInfo.color : SHAPES['Фигура'].color;
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
            color: Array.isArray(customType.color) ? customType.color : getShapeColor('Фигура'),
            pattern,
            isCustom: true
        });
    }

    for (const entries of groups.values()) {
        entries.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
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
    knownBtn.title = 'Собранные созвездия';
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
        btn.title = `${count} звезд`;
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
    unknownBtn.title = 'Ещё не собранные (открытые страницы атласа)';
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
    favoritesBtn.title = 'Только избранные';
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
            ? 'Все формы на открытых страницах собраны'
            : 'Пока нет собранных созвездий';
        listEl.appendChild(empty);
        return;
    }

    entries.sort((a, b) => {
        const ca = a.pattern?.stars?.length || 0;
        const cb = b.pattern?.stars?.length || 0;
        if (ca !== cb) return ca - cb;
        return a.name.localeCompare(b.name, 'ru');
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
    updateAtlasButtonState();
    const atlasOverlay = document.getElementById('atlasOverlay');
    if (atlasOverlay && atlasOverlay.classList.contains('visible')) {
        renderAtlasOverlay();
    }
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
// ATLAS OVERLAY
// =============================================================================

let atlasPageIndex = 0;
let isAtlasListDragging = false;
let atlasListDragStartX = 0;
let atlasListDragStartY = 0;
let atlasListScrollStartLeft = 0;
let atlasListScrollStartTop = 0;
let atlasListDragHandlersBound = false;

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

function renderAtlasPageNav() {
    const nav = document.getElementById('atlasPageNav');
    if (!nav) return;
    nav.innerHTML = '';

    for (let i = 0; i < ATLAS_PAGE_COUNT; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'hint-filter-btn atlas-page-btn';
        if (i === atlasPageIndex) btn.classList.add('active');
        const unlocked = isAtlasPageUnlocked(i);
        btn.textContent = unlocked ? `Стр. ${i + 1}` : `Стр. ${i + 1} 🔒`;
        btn.addEventListener('click', () => {
            atlasPageIndex = i;
            renderAtlasPageNav();
            renderAtlasList();
        });
        nav.appendChild(btn);
    }
}

/** S-01: блок прогресса пер-фигурной цепочки на карточке атласа. */
function createAtlasShapeChainBlock(shapeName) {
    if (typeof getShapeChainForShape !== 'function') return null;
    const chain = getShapeChainForShape(shapeName);
    if (!chain) return null;
    const p = achievementProgress[chain.id] || { stepIndex: 0, claimable: false };
    const total = chain.steps.length;
    const done = p.stepIndex >= total;

    const block = document.createElement('div');
    block.className = 'atlas-chain';

    // Ряд звёзд — по одной на шаг (как в сетке 🏆)
    const stars = document.createElement('div');
    stars.className = 'achv-stars';
    for (let i = 0; i < total; i++) {
        const s = document.createElement('span');
        const filled = i < p.stepIndex;
        s.className = 'achv-star' + (filled ? ' achv-star-filled' : '');
        s.textContent = filled ? '★' : '☆';
        stars.appendChild(s);
    }
    block.appendChild(stars);

    if (done) {
        const doneEl = document.createElement('div');
        doneEl.className = 'atlas-chain-progress atlas-chain-done';
        doneEl.textContent = 'Все ступени пройдены';
        block.appendChild(doneEl);
        return block;
    }

    const step = chain.steps[p.stepIndex];
    const prog = typeof getAchievementStepProgress === 'function'
        ? getAchievementStepProgress(step.check)
        : null;

    if (p.claimable && typeof claimAchievementStep === 'function') {
        const claimBtn = document.createElement('button');
        claimBtn.type = 'button';
        claimBtn.className = 'atlas-chain-claim';
        claimBtn.textContent = `Забрать +${getAchievementChainStepReward(chain)} ✦`;
        claimBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            claimAchievementStep(chain.id);
            renderAtlasOverlay();
        });
        block.appendChild(claimBtn);
    } else {
        const progEl = document.createElement('div');
        progEl.className = 'atlas-chain-progress';
        progEl.title = step.desc;
        progEl.textContent = prog
            ? `${Math.min(prog.current, prog.target)}/${prog.target}`
            : step.desc;
        block.appendChild(progEl);
    }

    return block;
}

function createAtlasEntryCard(entry) {
    const card = document.createElement('div');
    card.className = `atlas-card atlas-card-${entry.atlasState}`;

    const canvas = document.createElement('canvas');
    canvas.className = 'atlas-card-canvas';
    const patternOnly = !entry.isCreated;
    canvas.width = patternOnly ? 80 : 64;
    canvas.height = patternOnly ? 80 : 64;
    card.appendChild(canvas);

    const content = document.createElement('div');
    content.className = 'atlas-card-content';
    card.appendChild(content);

    if (entry.isCreated) {
        const title = document.createElement('div');
        title.className = 'atlas-card-title';
        title.textContent = getDisplayShapeName(entry.name);
        title.style.color = `rgb(${entry.color[0]},${entry.color[1]},${entry.color[2]})`;
        content.appendChild(title);

        // S-01: прогресс пер-фигурной цепочки достижений
        const chainBlock = createAtlasShapeChainBlock(entry.name);
        if (chainBlock) content.appendChild(chainBlock);
    } else {
        // S-01: имя фигуры — сюрприз до первого создания
        const title = document.createElement('div');
        title.className = 'atlas-card-title atlas-card-title-unknown';
        title.textContent = '???';
        content.appendChild(title);
    }

    if (entry.pattern) {
        drawHintPattern(canvas, entry.pattern, entry.color);
    }

    return card;
}

function renderAtlasList() {
    const list = document.getElementById('atlasList');
    if (!list) return;
    list.innerHTML = '';

    if (!isAtlasPageUnlocked(atlasPageIndex)) {
        // S-01: страницы открываются автоматически при накоплении ✦
        const locked = document.createElement('div');
        locked.className = 'atlas-page-locked';
        const cost = getAtlasPageUnlockCost(atlasPageIndex);

        const lockedText = document.createElement('p');
        lockedText.textContent = `Страница откроется сама, когда накопится ${cost} ✦.`;
        locked.appendChild(lockedText);

        const progressText = document.createElement('p');
        progressText.className = 'atlas-page-locked-progress';
        progressText.textContent = `Сейчас: ${Math.min(getMetaScore(), cost)}/${cost} ✦`;
        locked.appendChild(progressText);

        list.appendChild(locked);
        return;
    }

    const entries = getAtlasPageEntries(atlasPageIndex);
    for (const entry of entries) {
        list.appendChild(createAtlasEntryCard(entry));
    }
}

function setupAtlasListDragScroll() {
    if (atlasListDragHandlersBound) return;

    const listEl = document.getElementById('atlasList');
    if (!listEl) return;

    const startDrag = (clientX, clientY) => {
        isAtlasListDragging = true;
        atlasListDragStartX = clientX;
        atlasListDragStartY = clientY;
        atlasListScrollStartLeft = listEl.scrollLeft;
        atlasListScrollStartTop = listEl.scrollTop;
        listEl.classList.add('dragging');
    };

    const moveDrag = (clientX, clientY) => {
        if (!isAtlasListDragging) return;
        const dx = clientX - atlasListDragStartX;
        const dy = clientY - atlasListDragStartY;
        listEl.scrollLeft = atlasListScrollStartLeft - dx;
        listEl.scrollTop = atlasListScrollStartTop - dy;
    };

    const endDrag = () => {
        if (!isAtlasListDragging) return;
        isAtlasListDragging = false;
        listEl.classList.remove('dragging');
    };

    listEl.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        startDrag(event.clientX, event.clientY);
        event.preventDefault();
    });
    listEl.addEventListener('mousemove', (event) => {
        moveDrag(event.clientX, event.clientY);
        if (isAtlasListDragging) event.preventDefault();
    });
    listEl.addEventListener('mouseleave', endDrag);
    window.addEventListener('mouseup', endDrag);

    listEl.addEventListener('touchstart', (event) => {
        if (!event.touches || event.touches.length !== 1) return;
        startDrag(event.touches[0].clientX, event.touches[0].clientY);
    }, { passive: true });
    listEl.addEventListener('touchmove', (event) => {
        if (!event.touches || event.touches.length !== 1) return;
        moveDrag(event.touches[0].clientX, event.touches[0].clientY);
    }, { passive: true });
    listEl.addEventListener('touchend', endDrag);
    listEl.addEventListener('touchcancel', endDrag);

    atlasListDragHandlersBound = true;
}

function renderAtlasOverlay() {
    updateProgressionUI();
    renderAtlasPageNav();
    renderAtlasList();
    setupAtlasListDragScroll();
}

function showAtlasOverlay() {
    renderAtlasOverlay();
    const overlay = document.getElementById('atlasOverlay');
    if (overlay) overlay.classList.add('visible');
}

function hideAtlasOverlay() {
    const overlay = document.getElementById('atlasOverlay');
    if (overlay) overlay.classList.remove('visible');
}

function onAtlasOverlayClick(event) {
    if (event.target && event.target.id === 'atlasOverlay') {
        hideAtlasOverlay();
    }
}

function updateAtlasButtonState() {
    const atlasBtn = document.getElementById('atlasBtn');
    if (!atlasBtn) return;
    // S-01: страницы открываются автоматически; подсветка — только
    // при забираемом шаге пер-фигурной цепочки
    const chainClaimable = typeof hasClaimableShapeChains === 'function' && hasClaimableShapeChains();

    atlasBtn.classList.toggle('atlas-btn-claimable', chainClaimable);
    atlasBtn.textContent = '📖';
    const label = chainClaimable ? 'Атлас — есть награда' : 'Атлас';
    atlasBtn.title = label;
    atlasBtn.setAttribute('aria-label', label);
}

function onGlobalPopupKeydown(event) {
    if (event.key === 'Escape') {
        hideAtlasOverlay();
        if (typeof hideAchievementsOverlay === 'function') hideAchievementsOverlay();
    }
}

