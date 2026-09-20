// bookAtlas.js — разворот-определитель атласа K-11: карточки фигур и главы (R-05).

/** Совместимость: прежнее имя рисовалки подсказок. K-18: пробрасывает режим чертежа. */
function drawHintPattern(canvas, pattern, color, blueprint) {
    // V-22: разворот атласа лежит на тёплой бумаге — глиф «чернилами».
    drawShapeGlyph(canvas, pattern, color, blueprint, true);
}

// =============================================================================
// ATLAS DATA
// =============================================================================

function getAtlasEntryForShape(name) {
    const pattern = SHAPE_PATTERNS[name];
    const created = isShapeCreated(name);
    return {
        name,
        color: getShapeColor(name),
        pattern,
        starCount: pattern?.stars?.length || 0,
        isCreated: created,
        atlasState: created ? 'known' : 'unknown'
    };
}

function getAtlasPageEntries(pageIndex) {
    if (pageIndex < 0 || pageIndex >= ATLAS_PAGE_COUNT) return [];
    return ATLAS_PAGES[pageIndex].map(name => getAtlasEntryForShape(name));
}

/**
 * V-19: подпись карточки красится тем же цветом/градиентом, что и глиф —
 * решённый заказчиком открытый вопрос дока («красить так же»). Градиент на
 * тексте — `background-clip: text`, та же ось и порядок цветов, что у канваса.
 */
function paintGlyphTextColor(el, color) {
    if (Array.isArray(color[0])) {
        const n = color.length;
        const stops = color
            .map((rgb, i) => `rgb(${rgb[0]},${rgb[1]},${rgb[2]}) ${n > 1 ? Math.round(i / (n - 1) * 100) : 0}%`)
            .join(', ');
        el.style.background = `linear-gradient(90deg, ${stops})`;
        el.style.webkitBackgroundClip = 'text';
        el.style.backgroundClip = 'text';
        el.style.color = 'transparent';
        el.style.webkitTextFillColor = 'transparent';
        return;
    }
    el.style.color = `rgb(${color[0]},${color[1]},${color[2]})`;
}

/**
 * K-11: разворот-определитель — карточка `???` больше не существует.
 * Неразгаданная фигура рисуется тем же глифом, что и разгаданная — чертежом
 * (K-18). K-31: подпись «not yet traced» и число звёзд убраны совсем — на их
 * месте одинокий знак «?»; фигура рассказывает о себе только контуром.
 */
function createAtlasEntryCard(entry) {
    const faceted = entry.isCreated && typeof isShapeFaceted === 'function' && isShapeFaceted(entry.name);
    // V-19: у неразгаданной фигуры цвет всё равно не используется — рисуется
    // чертежом (blueprint), decorative-цвет остаётся только его формальным входом.
    const glyphColor = entry.isCreated ? getShapeGlyphColor(entry.name) : entry.color;
    const bookmarked = typeof getBookmarkedShape === 'function' && getBookmarkedShape() === entry.name;

    const card = document.createElement('div');
    card.className = 'atlas-card'
        + (entry.isCreated ? ' atlas-card-known' : ' atlas-card-unknown')
        + (faceted ? ' atlas-card-faceted' : '');

    // K-31: закладка тапом по любой части карточки, не только булавкой —
    // сама карточка становится доступной интерактивной целью (роль/фокус/aria).
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.setAttribute('aria-pressed', String(bookmarked));
    card.setAttribute('aria-label', t(bookmarked ? 'atlas.pinOff' : 'atlas.pinOn'));
    const togglePin = () => {
        if (typeof toggleShapeBookmark === 'function') toggleShapeBookmark(entry.name);
        renderAtlasList();
        if (typeof renderSkyBookmark === 'function') renderSkyBookmark();
    };
    card.addEventListener('click', togglePin);
    card.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        togglePin();
    });

    if (faceted) {
        const crown = glyphSign('corona', 16, 'atlas-card-crown');
        card.appendChild(crown);
    }

    // Булавка остаётся видимым индикатором состояния (риск дока K-31), но
    // клик по карточке уже переключает закладку сам — булавка не дублирует
    // фокус клавиатуры и убрана из a11y-дерева, чтобы не звучать дважды.
    // `.atlas-pin[data-shape-id]` держит и харнесс (`__test.pin`).
    const pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'atlas-pin' + (bookmarked ? ' atlas-pin-on' : '');
    pin.dataset.shapeId = entry.name;
    pin.tabIndex = -1;
    pin.setAttribute('aria-hidden', 'true');
    pin.appendChild(document.createElement('i'));
    pin.addEventListener('click', (event) => {
        event.stopPropagation();
        togglePin();
    });
    card.appendChild(pin);

    // U-22: состояние закладки словом — тем же самым, что стоит подписью под
    // чертежом в углу неба (`sky.bookmarkLabel`, K-11/K-32). Одна подпись на
    // двух экранах и есть недостающее объяснение: точка здесь — чертёж там.
    // Новых ключей локали задача не заводит. Слово стоит в шапке карточки
    // напротив булавки (правка заказчика с устройства 2026-09-04) — абсолютом
    // в отведённой сверху полосе, поэтому K-23 держится по построению: полоса
    // есть у каждой карточки всегда, а слово только показывается и прячется.
    const mark = document.createElement('div');
    mark.className = 'atlas-card-mark' + (bookmarked ? ' atlas-card-mark-on' : '');
    mark.textContent = t('sky.bookmarkLabel');
    card.appendChild(mark);

    const canvas = document.createElement('canvas');
    canvas.className = 'atlas-card-canvas';
    sizeGlyphCanvas(canvas, GLYPH_SIZES.spread, false);
    card.appendChild(canvas);

    const title = document.createElement('div');
    if (entry.isCreated) {
        title.className = 'atlas-card-title';
        title.textContent = getDisplayShapeName(entry.name);
        // V-22: подпись — тем же цветом «чернилами», что и глиф над ней.
        paintGlyphTextColor(title, paperInkGlyphColor(glyphColor));
    } else {
        // Имя фигуры — сюрприз до первого создания; вместо него — «?».
        title.className = 'atlas-card-title atlas-card-title-unknown';
        title.textContent = '?';
    }
    card.appendChild(title);

    if (entry.isCreated) {
        // U-09: 5 граней. Ни цифр, ни кнопок — грань просто горит или нет.
        // K-18: искра тем же контуром, что звезда на небе, а не ромбик.
        card.appendChild(createFacetsRow(entry.name));
    }

    // K-18: режим чертежа для неразгаданной — пунктир, полые точки, нейтральный цвет.
    if (entry.pattern) drawHintPattern(canvas, entry.pattern, glyphColor, !entry.isCreated);

    return card;
}

function renderAtlasList() {
    const list = document.getElementById('atlasList');
    if (!list) return;
    list.innerHTML = '';

    const pageIndex = getBookPageIndex('atlas');

    if (!isAtlasPageUnlocked(pageIndex)) {
        // Страницы открываются автоматически. V-17 свела порог и прогресс к
        // одной системе отсчёта; S-03 (правка заказчика 2026-09-10) оставила
        // на странице атласа только уровень — ни одного числа ✦: сколько
        // осталось, показывает шкала у корешка.
        const locked = document.createElement('div');
        locked.className = 'atlas-page-locked';

        const lockedText = document.createElement('p');
        fillLevelLockText(lockedText, 'atlas.pageLocked', getAtlasChapterLevel(pageIndex));
        locked.appendChild(lockedText);

        list.appendChild(locked);
        return;
    }

    for (const entry of getAtlasPageEntries(pageIndex)) {
        list.appendChild(createAtlasEntryCard(entry));
    }

    // U-37: подсказка под сеткой — карточка кладёт закладку, а не «просто открывается».
    const hint = document.createElement('p');
    hint.className = 'atlas-hint';
    hint.textContent = t('atlas.hint');
    list.appendChild(hint);
}
