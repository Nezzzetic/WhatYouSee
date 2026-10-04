// skyRender.js — рендер неба: звёзды и фон, линии и волна коммита, подписи
// капителью, корректорская пометка, счётчик звёзд у пальца (R-05).
// Положение и зум камеры — camera.js.

// =============================================================================
// V-11: ПОДПИСИ ГАСНУТ НА ДАЛЬНЕМ ЗУМЕ
// =============================================================================

/**
 * V-11: чистое ядро расчёта множителя альфы подписей. Вынесено отдельно от
 * getLabelZoomAlphaFactor(), чтобы проверяться без p5 и без глобалов.
 * @returns {number} 0..1
 */
function computeLabelZoomAlphaFactor(zoom, minZoom, defaultZoom, lo, hi) {
    const span = defaultZoom - minZoom;
    // Вырожденный диапазон: на очень большом экране minZoom может подойти вплотную
    // к DEFAULT_ZOOM (или перерасти его). Делить не на что — подписи видны.
    if (!(span > 1e-6)) return 1;
    const t = Math.max(0, Math.min(1, (zoom - minZoom) / span));
    const fadeSpan = hi - lo;
    if (!(fadeSpan > 1e-6)) return t >= hi ? 1 : 0;
    if (t <= lo) return 0;
    if (t >= hi) return 1;
    const u = (t - lo) / fadeSpan;
    return u * u * (3 - 2 * u); // smoothstep: без излома на границах коридора
}

/**
 * V-11: во сколько раз приглушены подписи созвездий на текущем зуме.
 * 0 на минимальном зуме (подписей нет), 1 на DEFAULT_ZOOM и выше — приближение
 * сверх дефолтного на видимость влиять не должно. Считается на каждом кадре:
 * getMinZoomLevel() меняется при resize, повороте и открытии шторки.
 */
function getLabelZoomAlphaFactor() {
    return computeLabelZoomAlphaFactor(
        zoomLevel,
        getMinZoomLevel(),
        DEFAULT_ZOOM,
        LABEL_ZOOM_FADE_LO,
        LABEL_ZOOM_FADE_HI
    );
}

// =============================================================================
// FIELD RENDERING
// =============================================================================

/**
 * V-28 (концепт C): линия созвездия — тонкая, полупрозрачная, одна толщина
 * всегда (было 2.5 у раскрытых созвездий / 2 у обычных, K-01 → одно число).
 * `alpha` (0..1) — видимость созвездия в сцене финала (V-13); вне сцены всегда 1.
 */
function applyConstellationSkeletonStrokeStyle(lineColor, alpha = 1) {
    const c = lineColor || LINE_COLOR;
    const a = Math.max(0, Math.min(1, alpha));
    stroke(c[0], c[1], c[2], 255 * a * CONSTELLATION_LINE_ALPHA);
    strokeWeight(CONSTELLATION_LINE_STROKE_WEIGHT / zoomLevel);
}

/**
 * V-28 (концепт C): «глоу» под чёткой линией — она же шире и бледнее, дешёвый
 * приём вместо canvas shadowBlur (дорог на Android WebView — прецедент V-09
 * «без glow-ореола»). Зовётся ДО applyConstellationSkeletonStrokeStyle —
 * рисуется первым слоем, крест поверх него.
 */
function applyConstellationGlowStrokeStyle(lineColor, alpha = 1) {
    const c = lineColor || LINE_COLOR;
    const a = Math.max(0, Math.min(1, alpha));
    stroke(c[0], c[1], c[2], 255 * a * CONSTELLATION_LINE_GLOW_ALPHA);
    strokeWeight(CONSTELLATION_LINE_GLOW_WEIGHT / zoomLevel);
}

/**
 * V-10: зазор между концом линии и звездой в world-юнитах. Повторяет формулу
 * baseStarDrawSize из drawVisibleStars, поэтому масштабируется зумом так же,
 * как сами звёзды (в т.ч. на отзуме, где действует пол STAR_SIZE/zoom·0.5).
 * V-25/V-26: у звезды созвездия зазор свой — у неё видна одна основа без
 * лепестков, и прежний зазор оставлял бы линию висеть далеко от неё.
 * Берётся игровой `star.locked`, а не вид волны V-12: иначе конец ребра прыгал
 * бы в момент прихода волны. Без звезды (обсерватория) — прежний зазор.
 */
function getLineStarGapWorld(star) {
    const base = Math.max(STAR_SIZE, STAR_SIZE / zoomLevel * 0.5);
    if (star && star.locked) {
        return base * LOCKED_LINE_STAR_GAP_PER_DIAM;
    }
    return base * LINE_STAR_GAP_FACTOR;
}

/**
 * V-10: укорачивает отрезок (ax,ay)-(bx,by) на gapA у первого конца и gapB у второго.
 * @returns {{ax,ay,bx,by}|null} null, если после обрезки почти ничего не остаётся
 *          (короткий/вырожденный отрезок — не рисуем, чтобы линия не выворачивалась).
 */
function trimSegmentEndsWorld(ax, ay, bx, by, gapA, gapB) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const minVisible = 1 / zoomLevel; // ~1px на экране
    if (len <= gapA + gapB + minVisible) return null;
    const ux = dx / len;
    const uy = dy / len;
    return {
        ax: ax + ux * gapA,
        ay: ay + uy * gapA,
        bx: bx - ux * gapB,
        by: by - uy * gapB
    };
}

/**
 * Сегмент в мировых координатах между двумя звёздами (R-03: до P-01 здесь
 * учитывался горизонтальный wrap, отсюда прежнее имя …HorizWrap…).
 * V-10: линия не доходит до звёзд — оба конца укорочены на зазор.
 * V-12: `progress` (0..1) чертит ребро не целиком, а до своей доли длины —
 * от startStar к endStar, то есть туда же, куда вёл палец. Возвращает
 * обрезанный сегмент, чтобы вызывающий мог положить сверху огонёк на острие.
 */
function drawSegmentWorld(startStar, endStar, progress = 1) {
    const t = trimSegmentEndsWorld(startStar.x, startStar.y, endStar.x, endStar.y,
        getLineStarGapWorld(startStar), getLineStarGapWorld(endStar));
    if (!t) return null;
    if (progress >= 1) {
        line(t.ax, t.ay, t.bx, t.by);
        return t;
    }
    if (progress <= 0) return null;
    const hx = t.ax + (t.bx - t.ax) * progress;
    const hy = t.ay + (t.by - t.ay) * progress;
    line(t.ax, t.ay, hx, hy);
    return t;
}

/**
 * V-12: светлый утолщённый «огонёк» на острие чертящегося ребра. Без него
 * линия не рисуется, а выползает — глазу не за что зацепиться.
 */
function drawCommitWaveCrestWorld(seg, progress, lineColor) {
    if (!seg || progress <= 0 || progress >= 1) return;
    const from = Math.max(0, progress - COMMIT_WAVE_CREST);
    const dx = seg.bx - seg.ax;
    const dy = seg.by - seg.ay;
    const c = lineColor || LINE_COLOR;
    const crest = blendRgb(c, [255, 255, 255], COMMIT_WAVE_WHITEN);
    push();
    stroke(crest[0], crest[1], crest[2]);
    strokeWeight((2 + COMMIT_WAVE_STROKE_EXTRA) / zoomLevel);
    line(seg.ax + dx * from, seg.ay + dy * from,
         seg.ax + dx * progress, seg.ay + dy * progress);
    pop();
}

/**
 * Один проход по рёбрам созвездия — общий код глоу-слоя и чёткой линии
 * (V-28), чтобы не дублировать обход `constellation.lines`.
 * `withCrest` — только у чёткого прохода: класть огонёк волны V-12 дважды
 * (на глоу и на линию) незачем, он и так поверх обоих слоёв.
 */
function drawConstellationSegmentsWorld(constellation, lineColor, withCrest) {
    for (let i = 0; i < constellation.lines.length; i++) {
        const seg = constellation.lines[i];
        const startStar = getStarById(seg.startId);
        const endStar = getStarById(seg.endId);
        if (!startStar || !endStar) continue;
        // V-12: у волнового созвездия ребро чертится до своей доли длины,
        // у всех прочих progress === 1 — путь ровно как до задачи.
        const progress = getCommitWaveEdgeProgress(constellation, i);
        const trimmed = drawSegmentWorld(startStar, endStar, progress);
        if (withCrest && progress < 1) {
            drawCommitWaveCrestWorld(trimmed, progress, lineColor);
        }
    }
}

function drawConstellationSkeletonLinesWorld() {
    for (let constellation of constellations) {
        if (!isConstellationVisible(constellation)) continue;
        // V-03/V-28: цвет линии — бакет палитры CONSTELLATION_LINE_TIERS
        // (концепт C), посчитан при коммите/загрузке (fallback: LINE_COLOR).
        // Работает всегда, не только на итоговом кадре финала.
        const lineColor = constellation.lineColor || LINE_COLOR;
        // V-13: в сцене финала созвездие сначала гаснет, потом рождается заново.
        // Полностью погасшее не рисуем вовсе — на небе их бывает 30+.
        const finaleAlpha = typeof getFinaleConstellationAlpha === 'function'
            ? getFinaleConstellationAlpha(constellation)
            : 1;
        if (finaleAlpha <= 0) continue;

        // V-28 (концепт C): глоу-слой первым (шире и бледнее), чёткая линия
        // поверх — тот же приём, что у огонька волны V-12, только глубже и тусклее.
        applyConstellationGlowStrokeStyle(lineColor, finaleAlpha);
        drawConstellationSegmentsWorld(constellation, lineColor, false);

        applyConstellationSkeletonStrokeStyle(lineColor, finaleAlpha);
        drawConstellationSegmentsWorld(constellation, lineColor, true);
    }
}

/** Мини-книга рядом со счётчиком: намёк на фигуру из открытого атласа. */
function drawDraftAtlasBookIconScreen(x, y, canCollect, alphaMul = 1) {
    const h = typeof DRAFT_ATLAS_HINT_BOOK_PX === 'number' ? DRAFT_ATLAS_HINT_BOOK_PX : 10;
    const w = h * 0.9;
    const pageW = w * 0.44;

    noStroke();
    if (canCollect) {
        fill(GOLD_RGB[0], GOLD_RGB[1], GOLD_RGB[2], 235 * alphaMul);
    } else {
        fill(INK_MUTED_RGB[0], INK_MUTED_RGB[1], INK_MUTED_RGB[2], 235 * alphaMul);
    }
    rect(x, y, pageW, h);
    rect(x + w - pageW, y, pageW, h);

    if (canCollect) {
        stroke(GOLD_LIGHT_RGB[0], GOLD_LIGHT_RGB[1], GOLD_LIGHT_RGB[2], 210 * alphaMul);
    } else {
        stroke(INK_FAINT_RGB[0], INK_FAINT_RGB[1], INK_FAINT_RGB[2], 210 * alphaMul);
    }
    strokeWeight(1);
    line(x + w * 0.5, y + 1, x + w * 0.5, y + h - 1);
}

/**
 * K-04: знак отмены из кассы K-02 (`#i-undo`) на канвасе. Касса нарисована
 * в боксе 24×24 одной линией без заливок — здесь тот же контур теми же
 * координатами, чтобы небо и книга показывали один и тот же знак.
 */
function drawUndoSignScreen(cx, cy, size, rgb, alpha) {
    const k = size / 24;
    const strokePx = size <= 16 ? 1.1 : 1.4;   // штрих кассы: 1.4 при 24, 1.1 мельче

    push();
    translate(cx - size / 2, cy - size / 2);
    scale(k);
    noFill();
    stroke(rgb[0], rgb[1], rgb[2], alpha);
    strokeWeight(strokePx / k);
    strokeCap(ROUND);
    line(19, 8.4, 9.2, 8.4);
    arc(9.2, 13.1, 9.4, 9.4, HALF_PI, PI + HALF_PI);
    line(9.2, 17.8, 12.6, 17.8);
    line(15.4, 4.6, 19.4, 8.4);
    line(19.4, 8.4, 15.4, 12.2);
    pop();
}

/**
 * K-04: корректорская пометка — единственный вход в отмену. U-19 (правка
 * после устройства): зафиксирована в левом нижнем углу экрана, а не рядом
 * с подписью фигуры — своего мирового якоря и выноски к нему больше нет,
 * геометрию угла считает `computeUndoMarkLayout` — она же отвечает за
 * попадание пальцем.
 */
function drawUndoMarkScreen() {
    const m = typeof computeUndoMarkLayout === 'function' ? computeUndoMarkLayout() : null;
    if (!m) return;

    const a = m.alpha;
    // K-20: рамка — карточка на бумаге вокруг знака (Табл. II концепта).
    // Геометрия содержимого не меняется (её всё ещё считает computeUndoMarkLayout —
    // и для отрисовки, и для попадания пальцем), рамка просто шире на паддинг.
    const frameLeft = m.left - UNDO_MARK_FRAME_PAD_X_PX;
    const frameTop = m.top - UNDO_MARK_FRAME_PAD_Y_PX;
    const frameW = m.w + UNDO_MARK_FRAME_PAD_X_PX * 2;
    const frameH = m.h + UNDO_MARK_FRAME_PAD_Y_PX * 2;

    push();
    try {
        noFill();
        stroke(INK_FAINT_RGB[0], INK_FAINT_RGB[1], INK_FAINT_RGB[2], 165 * a);
        strokeWeight(1);
        rect(frameLeft, frameTop, frameW, frameH, UNDO_MARK_FRAME_RADIUS_PX);

        // U-19: пометка — один знак, без имени. Единственная живая пометка
        // на небе не нуждается в тексте, чтобы сказать, что именно сотрёт.
        drawUndoSignScreen(m.cx, m.cy, UNDO_MARK_SIGN_PX, INK_MUTED_RGB, 235 * a);
    } finally {
        pop();
    }
}

/**
 * U-23: чистое ядро анимации счётчика черновика — появление → пауза → угасание,
 * плюс лёгкий подъём на появлении. Все параметры приходят аргументами, включая
 * амплитуду подъёма (`risePx`) — функция не читает ни millis(), ни констант
 * игры сама, чтобы верификатор вынул её текстом и прогнал
 * на границах без p5. `reduced` — ступенька 1/0 без обеих кривых, как у
 * корректорской пометки (K-04): доступность важнее эффекта.
 * @returns {{alpha: number, rise: number}}
 */
function computeDraftCountLabelAnim(sinceAppearMs, sinceChangeMs, inMs, holdMs, outMs, reduced, risePx) {
    if (sinceAppearMs < 0 || sinceChangeMs < 0) return { alpha: 0, rise: 0 };
    if (reduced) {
        return { alpha: sinceChangeMs < holdMs ? 1 : 0, rise: 0 };
    }
    const inFrac = inMs > 0 ? Math.min(1, sinceAppearMs / inMs) : 1;
    const outFrac = sinceChangeMs < holdMs
        ? 1
        : (outMs > 0 ? Math.max(0, 1 - (sinceChangeMs - holdMs) / outMs) : 0);
    const eased = inFrac * inFrac * (3 - 2 * inFrac); // smoothstep — без рывка на приходе
    return {
        alpha: inFrac * outFrac,
        rise: (1 - eased) * risePx
    };
}

/**
 * Счётчик звёзд у последней точки цепочки — в экранных px (зум и wrap).
 * U-23: поднят над пальцем фиксированными px (не зависит от зума — палец
 * физический объект), без легаси-цвета от отменённой экономики (был признак
 * `claimedStarCounts` — единственный носитель смысла в цвете), гаснет через
 * ~2 с после последнего изменения черновика. Самолечение состояния показа —
 * прямо здесь, из кадра: отдельных хуков в mousePressed/mouseDragged не заводим.
 */
function drawDraftStarCountLabelScreen() {
    if (!currentLines || currentLines.length === 0) return;
    if (!visitedStars || visitedStars.length === 0) return;

    const lastId = visitedStars[visitedStars.length - 1];
    const star = getStarById(lastId);
    if (!star) return;

    const n = visitedStars.length;

    let atlasHint = null;
    try {
        if (typeof getDraftUnlockedAtlasShapeHint === 'function') {
            atlasHint = getDraftUnlockedAtlasShapeHint();
        }
    } catch (_) {
        atlasHint = null;
    }

    // Ключ показа: смена визитов, рёбер (замыкание кольца в уже посещённую
    // звезду меняет фигуру, не n) или подсказки атласа — любая зажигает показ заново.
    const key = n + '|' + currentLines.length + '|' + (atlasHint || '');
    if (typeof noteDraftCountLabelChange === 'function'
        && (!draftCountLabel || draftCountLabel.key !== key)) {
        noteDraftCountLabelChange(key, n);
    }
    if (!draftCountLabel) return;

    const reduced = typeof prefersReducedMotion === 'function' && prefersReducedMotion();
    const anim = computeDraftCountLabelAnim(
        millis() - draftCountLabel.appearMs,
        millis() - draftCountLabel.changeMs,
        DRAFT_COUNT_LABEL_IN_MS, DRAFT_COUNT_LABEL_HOLD_MS, DRAFT_COUNT_LABEL_OUT_MS,
        reduced, DRAFT_COUNT_LABEL_RISE_PX
    );
    if (anim.alpha <= 0) return;

    const viewW = width / zoomLevel;
    const viewH = height / zoomLevel;
    const refX = (typeof mouseX === 'number' && mouseX >= 0 && mouseX <= width)
        ? mouseX / zoomLevel + camX
        : camX + viewW / 2;
    const refY = (typeof mouseY === 'number' && mouseY >= 0 && mouseY <= height)
        ? mouseY / zoomLevel + camY
        : camY + viewH / 2;
    const fw = nearestHorizontalCopy(star.x, star.y, refX, refY);

    const screenX = (fw.x - camX) * zoomLevel;
    const screenY = (fw.y - camY) * zoomLevel;

    push();
    try {
        noStroke();
        textAlign(LEFT, BOTTOM);
        textSize(DRAFT_COUNT_LABEL_SIZE);

        const nStr = String(n);
        const numW = textWidth(nStr);
        const bookH = typeof DRAFT_ATLAS_HINT_BOOK_PX === 'number' ? DRAFT_ATLAS_HINT_BOOK_PX : 10;
        const bookW = bookH * 0.9;
        const hasIcon = !!atlasHint;
        const totalW = numW + (hasIcon ? DRAFT_COUNT_LABEL_ICON_GAP_PX + bookW : 0);

        // Группа «число + иконка» центрируется над звездой (не число само по
        // себе) — иначе иконка уезжала бы от цифры при переходе 9 → 10.
        const startX = screenX - totalW / 2;
        let labelY = screenY - DRAFT_COUNT_LABEL_LIFT_PX + anim.rise;
        labelY = Math.max(labelY, DRAFT_COUNT_LABEL_MIN_TOP_PX + DRAFT_COUNT_LABEL_SIZE);

        fill(INK_RGB[0], INK_RGB[1], INK_RGB[2], 235 * anim.alpha);
        text(nStr, startX, labelY);

        if (hasIcon) {
            const canCollect = typeof canCollectAtlasShapeOnField === 'function'
                && canCollectAtlasShapeOnField(atlasHint);
            const bookX = startX + numW + DRAFT_COUNT_LABEL_ICON_GAP_PX;
            drawDraftAtlasBookIconScreen(bookX, labelY - bookH, canCollect, anim.alpha);
        }
    } finally {
        pop();
    }
}

function drawCurrentAndPendingLinesWorld() {
    const chainRgb = typeof getDraftChainColorRgb === 'function'
        ? getDraftChainColorRgb()
        : LINE_COLOR;
    stroke(chainRgb[0], chainRgb[1], chainRgb[2]);
    strokeWeight(2 / zoomLevel);
    for (let seg of currentLines) {
        const startStar = getStarById(seg.startId);
        const endStar = getStarById(seg.endId);
        if (startStar && endStar) {
            drawSegmentWorld(startStar, endStar);
        }
    }
}

/**
 * Ширина капители без отрисовки — тот же алгоритм трекинга, что у
 * drawSmallCapsLabelWorld, одной функцией на двоих: разъедься они, и всё,
 * что меряет расстояние до подписи (пометка K-04/U-19), считало бы вслепую.
 * `sizePx` в тех же единицах, что и у самой отрисовки (экранные px, если
 * зовут вне scale(zoomLevel), мировые — если внутри).
 */
function measureSmallCapsWidth(str, sizePx) {
    if (!str) return 0;
    const upper = str.toUpperCase();
    const tracking = sizePx * SMALL_CAPS_TRACKING_EM;
    push();
    textSize(sizePx);
    let totalW = 0;
    for (let i = 0; i < upper.length; i++) {
        totalW += textWidth(upper[i]) + (i < upper.length - 1 ? tracking : 0);
    }
    pop();
    return totalW;
}

/**
 * K-20: капитель — единственный способ набрать имя созвездия на небе. p5 не
 * умеет letter-spacing, поэтому буквы кладутся по одной с ручным шагом; под
 * именем — волосяная линейка в его ширину (Табл. II концепта), кроме случая
 * `withRule = false` — концепт C (V-28) снимает её у раскрытых созвездий на
 * итоговом кадре, остальные подписи её по-прежнему держат. `sizePx` уже
 * в мировых единицах (поделено на zoomLevel вызывающим — тот же приём, что у
 * прежнего textSize(... / zoomLevel)), поэтому и tracking, и толщина линейки
 * считаются здесь же, без повторного деления.
 */
function drawSmallCapsLabelWorld(str, cx, cy, sizePx, rgb, alpha, withRule = true) {
    if (!str || alpha <= 0) return;
    const upper = str.toUpperCase();
    const tracking = sizePx * SMALL_CAPS_TRACKING_EM;
    const totalW = measureSmallCapsWidth(str, sizePx);

    push();
    textAlign(LEFT, CENTER);
    textSize(sizePx);

    noStroke();
    fill(rgb[0], rgb[1], rgb[2], alpha);
    let x = cx - totalW / 2;
    for (let i = 0; i < upper.length; i++) {
        const ch = upper[i];
        text(ch, x, cy);
        x += textWidth(ch) + tracking;
    }

    if (withRule) {
        const ruleY = cy + sizePx * SMALL_CAPS_RULE_OFFSET_EM;
        stroke(rgb[0], rgb[1], rgb[2], alpha * SMALL_CAPS_RULE_ALPHA_MULT);
        strokeWeight(1 / zoomLevel);
        line(cx - totalW / 2, ruleY, cx + totalW / 2, ruleY);
    }
    pop();
}

function drawCollectedAtlasConstellationLabel(constellation, labelAnchor, zoomAlpha = 1) {
    // V-09: простой стиль — обычный текст цветом от звёзд (lineColor), без
    // золотого ★-бейджа и декоративного цвета фигуры.
    // V-12: расширяющееся кольцо collect-пульса снесено; вместо него имя
    // проявляется по окончании волны создания — момент открытия фигуры остаётся
    // отмеченным, но привязан к самому созвездию, а не к кругу поверх неба.
    const c = constellation.lineColor || LINE_COLOR;
    const labelSize = COLLECTED_ATLAS_LABEL_SIZE / zoomLevel;
    const name = getConstellationDisplayName(constellation);
    const waveAlpha = typeof getCommitWaveLabelAlpha === 'function'
        ? getCommitWaveLabelAlpha(constellation)
        : 1;
    if (waveAlpha <= 0) return;

    drawSmallCapsLabelWorld(name, labelAnchor.x, labelAnchor.y, labelSize, c, 255 * zoomAlpha * waveAlpha);
}

function drawConstellationLabels() {
    // V-13: пока идёт финал ночи, подписей нет вовсе (решение заказчика: «названия
    // не важны на этой анимации»). Волну от revealTime при этом не трогаем — она
    // отыгрывает под нулевой альфой и к концу сцены все подписи уже на 255.
    if (typeof isLevelFinaleActive === 'function' && isLevelFinaleActive()) return;

    // V-28: на итоговом кадре (сцена уже отыграла в ЭТУ сессию) подписи видны
    // мелко независимо от зума — гашение V-11 (дальний зум → ноль) сюда не
    // доходит, проявление идёт плавным фейдом.
    const finaleAftermathActive = typeof isFinaleLabelsRevealed === 'function' && isFinaleLabelsRevealed();

    // V-28 (круг 3): `finaleAftermath` — флаг вне сейва (живёт только в памяти
    // вкладки), а `constellationArtRevealed` — персистентный (пишется в сейв
    // на раскрытии). После перезагрузки страницы/возврата в выгруженную
    // Android-вкладку ночь по-прежнему полностью раскрыта, а флаг аftermath
    // уже false — без этой ветки подписи гасли V-11 на дальнем зуме итогового
    // кадра НАВСЕГДА (баг с реального устройства: линии на месте, подписей
    // нет вовсе). Раскрытая ночь — трофейный обзор в любой сессии, не только
    // в той, где доиграла сцена: показываем сразу на полную, без фейда (его
    // уже отыграла сессия, которая закончила ночь).
    const nightRevealed = typeof constellationArtRevealed !== 'undefined' && constellationArtRevealed;

    // V-11: множитель считается один раз за кадр, до цикла по созвездиям.
    // На дальнем зуме подписей нет вовсе — выходим сразу, не перебирая небо.
    let zoomAlpha;
    if (finaleAftermathActive) {
        zoomAlpha = Math.max(getLabelZoomAlphaFactor(), getFinaleLabelsZoomAlpha());
    } else if (nightRevealed) {
        zoomAlpha = 1;
    } else {
        zoomAlpha = getLabelZoomAlphaFactor();
    }
    if (zoomAlpha <= 0) return;

    noStroke();
    textAlign(CENTER, CENTER);

    for (let i = 0; i < constellations.length; i++) {
        const constellation = constellations[i];
        if (!isConstellationVisible(constellation)) continue;

        // V-29: раскрытая ночь — место из батч-раскладки (учитывает чужие линии
        // и другие подписи), если она уже посчитана; иначе — вслепую выбранный
        // якорь, как до задачи (и как у синтетических созвездий инструментов).
        const labelAnchor = (constellationArtRevealed && constellation.revealedLabelAnchor)
            ? constellation.revealedLabelAnchor
            : (constellation.labelAnchor || constellation.center);
        if (!labelAnchor || !constellation.name) continue;

        if (constellationArtRevealed) {
            // atlasCollected подписи уже были видны — не анимируем повторно
            let alpha;
            if (constellation.atlasCollected || revealTime === 0) {
                alpha = 255;
            } else {
                const offset = Math.min(i * 80, 400);
                const elapsed = millis() - revealTime - LABEL_FADE_DELAY - offset;
                alpha = constrain(elapsed / LABEL_FADE_DURATION, 0, 1) * 255;
            }
            // V-11: зум-множитель УМНОЖАЕТСЯ на волну появления, а не заменяет её:
            // волна отыгрывает своё независимо, и при обратном зуме после ночи
            // имена появляются сразу в полную силу, а не проигрывают волну заново.
            // V-28 (концепт C): подпись раскрытого созвездия — цветом линии,
            // высветленным к белому, без волосяной линейки, чуть тише самой
            // линии — вместо прежних единых ink+линейка. Тот же кегль, что и у
            // остальных подписей (REVEALED_CONSTELLATION_LABEL_SIZE), не отдельный
            // мелкий для итогового кадра.
            const tintColor = blendRgb(
                constellation.lineColor || LINE_COLOR, [255, 255, 255], CONSTELLATION_LABEL_TINT_AMOUNT
            );
            drawSmallCapsLabelWorld(
                getConstellationDisplayName(constellation), labelAnchor.x, labelAnchor.y,
                REVEALED_CONSTELLATION_LABEL_SIZE / zoomLevel, tintColor,
                alpha * zoomAlpha * CONSTELLATION_LABEL_ALPHA_MULT, false
            );
            continue;
        }

        if (constellation.atlasCollected) {
            drawCollectedAtlasConstellationLabel(constellation, labelAnchor, zoomAlpha);
            continue;
        }

        // V-14: остальные — распознанная атласная и fallback (вне каталога)
        // одинаково — получают имя сразу тем же простым стилем, что и
        // atlas-collected, не дожидаясь конца ночи.
        // V-12: у только что закоммиченного имя ждёт конца волны, как и у
        // atlas-collected — иначе подпись обгоняла бы собственные линии.
        const waveAlpha = typeof getCommitWaveLabelAlpha === 'function'
            ? getCommitWaveLabelAlpha(constellation)
            : 1;
        if (waveAlpha <= 0) continue;
        const c = constellation.lineColor || LINE_COLOR;
        drawSmallCapsLabelWorld(
            getConstellationDisplayName(constellation), labelAnchor.x, labelAnchor.y,
            COLLECTED_ATLAS_LABEL_SIZE / zoomLevel, c, 255 * zoomAlpha * waveAlpha
        );
    }
}

function drawFieldMode() {
    push();
    scale(zoomLevel);
    translate(-camX, -camY);

    // R-03: до P-01 каждый слой шёл циклом по копиям поля (wrap) со своим
    // translate(ox, oy). Копия осталась одна и без смещения — проход один;
    // push/pop вокруг слоёв оставлены: они изолируют стиль слоя от соседних.
    push();
    drawVisibleBackgroundStars();
    pop();

    drawConstellationSkeletonLinesWorld();
    drawCurrentAndPendingLinesWorld();

    push();
    drawVisibleStars();
    pop();

    if (isDragging && currentStartStar) {
        const chainRgb = typeof getDraftChainColorRgb === 'function'
            ? getDraftChainColorRgb()
            : LINE_COLOR;
        stroke(chainRgb[0], chainRgb[1], chainRgb[2], 180);
        strokeWeight(2 / zoomLevel);
        const fieldMouseX = mouseX / zoomLevel + camX;
        const fieldMouseY = mouseY / zoomLevel + camY;
        const seg = getClampedDragEndpointWorld(currentStartStar, fieldMouseX, fieldMouseY);
        // V-10: зазор только у якорного конца (звезда); конец у курсора не трогаем
        const t = trimSegmentEndsWorld(seg.ax, seg.ay, seg.bx, seg.by, getLineStarGapWorld(currentStartStar), 0);
        if (t) line(t.ax, t.ay, t.bx, t.by);
    }

    drawAttachFlash();

    push();
    drawConstellationLabels();
    pop();

    pop();
}

// =============================================================================
// VISIBILITY HELPERS
// =============================================================================

function drawVisibleBackgroundStars() {
    const viewW = width / zoomLevel;
    const viewH = height / zoomLevel;
    // Фоновые звёзды появляются быстрее основных (нет индивидуального appearDelay)
    const bgElapsed = millis() - skyStartTime;
    const bgFadeDuration = STAR_FADE_DURATION * skyFadeScale * 0.5;
    const bgFadeAlpha = bgFadeDuration > 0 ? constrain(bgElapsed / bgFadeDuration, 0, 1) : 1;
    noStroke();
    for (let s of fieldBackgroundStars) {
        if (s.x < camX - 10 || s.x > camX + viewW + 10 ||
            s.y < camY - 10 || s.y > camY + viewH + 10) continue;
        // K-03: пыль неподвижна. Мерцание фона делало поле труднее читаемым
        // (мелкая точка то видна, то нет) — дышат только крупные узлы.
        fill(255, 255, 255, s.alpha * bgFadeAlpha);
        // Плотная заливная точка: не даём диаметру уйти в суб-пиксель (иначе AA
        // делает из круга «кольцо»).
        const bgDiam = Math.max(s.size, BG_STAR_MIN_SCREEN_DIAM / zoomLevel);
        circle(s.x, s.y, bgDiam);
    }
    // P-17 (четвёртая правка заказчика): в альбомном окне поле — узкая полоса
    // по центру, и небо слева/справа было пустым. Та же пыль, той же плотности,
    // продолжается за боковые края поля — только отрисовка: поле, сейв и
    // random() неба не трогаются (M-14), в портрете бока не видны.
    for (let s of getSkySideDust()) {
        if (s.x < camX - 10 || s.x > camX + viewW + 10 ||
            s.y < camY - 10 || s.y > camY + viewH + 10) continue;
        fill(255, 255, 255, s.alpha * bgFadeAlpha);
        circle(s.x, s.y, Math.max(s.size, BG_STAR_MIN_SCREEN_DIAM / zoomLevel));
    }
    // P-17 (пятая правка): неактивные звёзды за боками — вид свободной звезды
    // поля (слои лепестков и основа, как в drawVisibleStars), но без дыхания,
    // импульсов и ввода: их нет в fieldStars, getStarAt их не видит.
    const baseStarDrawSize = Math.max(STAR_SIZE, STAR_SIZE / zoomLevel * 0.5);
    for (let s of getSkySideStars()) {
        if (s.x < camX - 30 || s.x > camX + viewW + 30 ||
            s.y < camY - 30 || s.y > camY + viewH + 30) continue;
        const a = s.bright * bgFadeAlpha;
        const size = baseStarDrawSize * s.sizeFactor;
        const coreColor = getStarCoreColor(s, false, false, false);
        const glowColor = getStarGlowColor(s, false, false, false);
        fill(255, 255, 255, 25 * a);
        drawStarPetalsShape(s.x, s.y, size * 2, 1);
        fill(glowColor[0], glowColor[1], glowColor[2], glowColor[3] * a);
        drawStarPetalsShape(s.x, s.y, size * 1.5, 1);
        fill(coreColor[0], coreColor[1], coreColor[2], coreColor[3] * (STAR_PETAL_CORE_ALPHA / 255) * a);
        drawStarPetalsShape(s.x, s.y, size, 1);
        const baseRgb = blendRgb(coreColor, [255, 255, 255], STAR_BASE_WHITEN);
        fill(baseRgb[0], baseRgb[1], baseRgb[2], coreColor[3] * a);
        circle(s.x, s.y, size * STAR_BASE_DIAM_MULT);
    }
}

/** Детерминированный генератор (mulberry32) — не трогает random() неба (M-14). */
function makeSkySideRng(seed) {
    return () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

let skySideStars = null;
let skySideStarsKey = null;

/** Неактивные звёзды за боками поля: зерно — playerId, пересчёт при его смене. */
function getSkySideStars() {
    const key = (typeof playerId === 'string' && playerId) ? playerId : 'sky';
    if (skySideStars && skySideStarsKey === key) return skySideStars;
    let h = 0x811C9DC5;
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 0x01000193);
    const rnd = makeSkySideRng(h ^ 0x51DE57A5);
    const y0 = -BACKGROUND_STAR_MARGIN_Y, spanH = FIELD_HEIGHT + 2 * BACKGROUND_STAR_MARGIN_Y;
    const gap = SKY_SIDE_STAR_GAP, spanW = SKY_SIDE_DUST_MARGIN_X - gap;
    const count = Math.round(spanW * spanH / SKY_SIDE_STAR_AREA);
    skySideStars = [];
    skySideStarsKey = key;
    for (const side of [-1, 1]) {
        for (let i = 0; i < count; i++) {
            const d = gap + rnd() * spanW;
            skySideStars.push({
                x: side < 0 ? -d : FIELD_WIDTH + d,
                y: y0 + rnd() * spanH,
                sizeFactor: STAR_SIZE_VARIATION_MIN + rnd() * (STAR_SIZE_VARIATION_MAX - STAR_SIZE_VARIATION_MIN),
                colorValue: STAR_FIELD_COLOR_VALUES[Math.floor(rnd() * STAR_FIELD_COLOR_VALUES.length)],
                bright: SKY_SIDE_STAR_BRIGHT_MIN + rnd() * (1 - SKY_SIDE_STAR_BRIGHT_MIN)
            });
        }
    }
    return skySideStars;
}

let skySideDust = null;

/** Пыль неба за боковыми краями поля: своё постоянное зерно, один раз. */
function getSkySideDust() {
    if (skySideDust) return skySideDust;
    const rnd = makeSkySideRng(0x5EED17);
    const y0 = -BACKGROUND_STAR_MARGIN_Y, spanH = FIELD_HEIGHT + 2 * BACKGROUND_STAR_MARGIN_Y;
    const gap = SKY_SIDE_DUST_GAP, spanW = SKY_SIDE_DUST_MARGIN_X - gap;
    const count = Math.round(BACKGROUND_STAR_COUNT * spanW * spanH / (FIELD_WIDTH * FIELD_HEIGHT));
    skySideDust = [];
    for (const side of [-1, 1]) {
        for (let i = 0; i < count; i++) {
            const d = gap + rnd() * spanW;
            skySideDust.push({
                x: side < 0 ? -d : FIELD_WIDTH + d,
                y: y0 + rnd() * spanH,
                size: 1 + rnd() * 1.5,
                alpha: 40 + rnd() * 80
            });
        }
    }
    return skySideDust;
}

// -----------------------------------------------------------------------------
// STAR SHAPE — «Искра ✦» (визуальный концепт 4)
// -----------------------------------------------------------------------------

/**
 * Рисует один слой 4-лучевой искры с вогнутыми лучами.
 * @param {number} diam  Базовый диаметр слоя (world-units, эквивалент прежнего circle-диаметра).
 * @param {number} rayMult  Множитель длины лучей (1 — база, >1 у atlas-collected).
 * Вызывающий сам делает fill(...) перед вызовом.
 *
 * K-03: параметр `pulse` (прибавка длины лучей во вспышке) убран вместе со
 * вспышкой — спокойное дыхание меняет только яркость, геометрия искры стоит.
 */
function drawSparkleShape(x, y, diam, rayMult) {
    // Фолбэк на минимальном зуме: искра нечитаема — рисуем точку.
    if (diam * zoomLevel < SPARK_MIN_SCREEN_DIAM) {
        circle(x, y, diam);
        return;
    }
    const R = diam * SPARK_RAY_LEN_MULT * (rayMult || 1);
    const w = R * SPARK_WAIST;      // радиус «талии» — контрольные точки у центра
    const wd = w * 0.70710678;      // проекция талии на оси (cos/sin 45°)
    beginShape();
    vertex(x, y - R);                       // верхний кончик
    quadraticVertex(x + wd, y - wd, x + R, y); // → правый
    quadraticVertex(x + wd, y + wd, x, y + R); // → нижний
    quadraticVertex(x - wd, y + wd, x - R, y); // → левый
    quadraticVertex(x - wd, y - wd, x, y - R); // → верхний (замыкание)
    endShape(CLOSE);
}

/**
 * V-26: один слой лепестков звезды поля — 8 вогнутых лучей (4 длинных по осям,
 * 4 коротких по диагоналям, `STAR_PETAL_GEOMETRY`). Тот же приём, что у
 * `drawSparkleShape`: кончики — вершины, вогнутые стороны — quadratic-безье
 * через точку на радиусе талии. Вызывающий сам делает fill(...).
 * На минимальном зуме лучи нечитаемы — точка, как у искры.
 */
function drawStarPetalsShape(x, y, diam, rayMult) {
    if (diam * zoomLevel < SPARK_MIN_SCREEN_DIAM) {
        circle(x, y, diam);
        return;
    }
    const R = diam * SPARK_RAY_LEN_MULT * (rayMult || 1);
    const g = STAR_PETAL_GEOMETRY;
    beginShape();
    vertex(x + g[0].tx * R, y + g[0].ty * R);
    for (let i = 1; i <= 8; i++) {
        const p = g[i % 8];
        quadraticVertex(x + p.cx * R, y + p.cy * R, x + p.tx * R, y + p.ty * R);
    }
    endShape(CLOSE);
}

// V-07: состояние фидбэк-анимации соединения. Обновляется раз за кадр
// (гейт по frameCount): до R-03 drawVisibleStars звалась по разу на копию
// поля wrap-режима, гейт оставлен страховкой от повторного вызова за кадр.
let feedbackAnchorId = null;
let feedbackAnchorMoves = 0;
let connectFeedbackFrame = -1;
// Пер-звёздное состояние { dim, frame, reach, pulseMs } по star.id — вне сейва
// (как atlasCollectedStarColors). Сбрасывается вместе с полем (sketch.js).
let connectFeedbackState = new Map();

function drawVisibleStars() {
    // V-07: детект нового ребра — раз за кадр. Смена якоря (currentStartStar)
    // во время drag перезапускает импульс досягаемых звёзд.
    if (connectFeedbackFrame !== frameCount) {
        connectFeedbackFrame = frameCount;
        const aid = (isDragging && currentStartStar) ? currentStartStar.id : null;
        if (aid !== feedbackAnchorId) {
            if (feedbackAnchorId === null) {
                feedbackAnchorMoves = 0;       // старт жеста — счётчик рёбер с нуля
            } else if (aid !== null) {
                feedbackAnchorMoves++;         // якорь переехал на новую звезду = новое ребро
            }
            feedbackAnchorId = aid;
        }
    }
    const viewW = width / zoomLevel;
    const viewH = height / zoomLevel;
    const baseStarDrawSize = Math.max(STAR_SIZE, STAR_SIZE / zoomLevel * 0.5);
    const elapsed = millis() - skyStartTime;
    const fadeDuration = STAR_FADE_DURATION * skyFadeScale;
    // K-03: дыхание — движение, и `prefers-reduced-motion` гасит его целиком.
    // Проверка раз за вызов, а не на звезду: matchMedia в цикле по полю дорог.
    const nowMs = millis();
    const breathEnabled = !(typeof prefersReducedMotion === 'function' && prefersReducedMotion());
    noStroke();
    for (let star of fieldStars) {
        if (!star) continue;
        const wx = star.x;
        const wy = star.y;
        if (wx < camX - 30 || wx > camX + viewW + 30 ||
            wy < camY - 30 || wy > camY + viewH + 30) continue;

        // Locked-звёзды (в созвездиях) появляются мгновенно
        let fadeAlpha;
        if (star.locked) {
            fadeAlpha = 1;
        } else {
            const delay = (typeof star.appearDelay === 'number' ? star.appearDelay : 0) * skyFadeScale;
            fadeAlpha = fadeDuration > 0 ? constrain((elapsed - delay) / fadeDuration, 0, 1) : 1;
        }
        if (fadeAlpha <= 0) continue;

        // V-13: в сцене финала звезда гаснет и рождается вместе со своим
        // созвездием. Полностью погашенную не рисуем вовсе — на завершённом
        // небе таких сотня.
        const finaleAlpha = typeof getFinaleStarAlpha === 'function'
            ? getFinaleStarAlpha(star.id)
            : 1;
        if (finaleAlpha <= 0) continue;

        // V-12: звезда закоммиченного созвездия переходит в locked-вид не разом
        // со всеми, а когда до неё дошла волна. `star.locked` (игровая логика,
        // хит-тесты, распознавание) при этом выставлен сразу — тут только вид.
        const lockedVisual = star.locked
            && !(typeof isCommitWavePending === 'function' && isCommitWavePending(star.id));
        // Волна создания и финал ночи пересечься не могут (раскрытие отменяет
        // первую), поэтому max, а не сумма.
        const commitFlash = Math.max(
            typeof getCommitWaveStarFlash === 'function' ? getCommitWaveStarFlash(star.id) : 0,
            typeof getFinaleStarFlash === 'function' ? getFinaleStarFlash(star.id) : 0
        );

        const sizeFactor = typeof star.sizeFactor === 'number' ? star.sizeFactor : 1;
        // O-04: шаг 1 тутора рисует всё, что не пара тутора, ровно как suppressed —
        // тот же приглушённый цвет и масштаб, никакой новой визуальной формы.
        const isTutorialDimmed = typeof isTutorialAllowedStar === 'function' && !isTutorialAllowedStar(star.id);
        const isSuppressed = (!!star.suppressed || isTutorialDimmed) && !star.locked;
        const isExtinguished = !!star.extinguished && !star.locked;
        // V-26: у погасшей размер задаёт своя ветка ниже (основа вдвое меньше
        // основы свободной), у звезды созвездия размер тот же, что у свободной, —
        // её уводит назад гашение лепестков, а не уменьшение V-25.
        let starDrawSize = baseStarDrawSize * sizeFactor;
        if (isSuppressed && !isExtinguished) {
            starDrawSize *= SUPPRESSED_STAR_SCALE;
        }
        if (commitFlash > 0) {
            starDrawSize *= 1 + COMMIT_WAVE_STAR_SCALE * commitFlash;
        }

        // V-07: фидбэк соединения (заменяет статичный дим U-03). Определяем,
        // участвует ли звезда в жесте и досягаема ли она от текущего якоря.
        // Фидбэк — только для соединяемых звёзд (ср. field.js getStarAt:
        // locked/suppressed/extinguished не являются валидными целями).
        const inDrag = isDragging && currentStartStar
                && star.id !== currentStartStar.id
                && !star.locked
                && !isSuppressed
                && !isExtinguished
                && !visitedStars.includes(star.id);
        let reachable = false;
        if (inDrag) {
            const dist = horizontalWrapDist(star.x, star.y, currentStartStar.x, currentStartStar.y);
            reachable = dist <= getMaxEdgeLength();
        }
        // Анимированный дим недосягаемых: пер-звёздный dim (connectFeedbackState)
        // едет к цели (1 / FEEDBACK_DIM_MIN) через deltaTime. Шаг — раз за кадр
        // (гейт по frameCount), т.к. звезда может рисоваться в нескольких тайлах.
        const dimTarget = (inDrag && !reachable) ? FEEDBACK_DIM_MIN : 1;
        let fb = connectFeedbackState.get(star.id);
        if (!fb) { fb = { dim: 1, frame: -1 }; connectFeedbackState.set(star.id, fb); }
        if (fb.frame !== frameCount) {
            fb.frame = frameCount;
            const dt = (typeof deltaTime === 'number' && deltaTime > 0) ? deltaTime : 16;
            const k = 1 - Math.exp(-dt / FEEDBACK_DIM_TAU_MS);
            fb.dim += (dimTarget - fb.dim) * k;
            if (Math.abs(fb.dim - dimTarget) < 0.005) fb.dim = dimTarget;
        }
        const rangeDimFactor = fb.dim;
        // Импульс — только у звёзд, ТОЛЬКО ЧТО вошедших в радиус (rising edge).
        // Остававшиеся в радиусе не пульсируют. Пока тянем от ПЕРВОЙ звезды
        // (feedbackAnchorMoves === 0) вспышек нет; появляются со второй звезды.
        if (inDrag) {
            if (reachable && fb.reach === false && feedbackAnchorMoves >= 1) {
                fb.pulseMs = millis();
            }
            fb.reach = reachable;
        }
        let feedbackPulse = 0;
        if (inDrag && fb.pulseMs) {
            const e = millis() - fb.pulseMs;
            if (e >= 0 && e < FEEDBACK_PULSE_MS) {
                feedbackPulse = Math.sin((e / FEEDBACK_PULSE_MS) * Math.PI);
            } else {
                fb.pulseMs = 0;
            }
        }
        if (feedbackPulse > 0) {
            starDrawSize *= 1 + FEEDBACK_PULSE_SCALE * feedbackPulse;
        }
        // V-12: вспышка волны усиливает гало/свечение тем же множителем, что и
        // импульс V-07; пересечься они не могут (V-07 — только на не-locked).
        const feedbackBrighten = 1 + FEEDBACK_PULSE_BRIGHTEN * feedbackPulse
            + COMMIT_WAVE_STAR_BRIGHTEN * commitFlash;
        const effectiveAlpha = fadeAlpha * rangeDimFactor * finaleAlpha;

        const coreColor = getStarCoreColor(star, isSuppressed, isExtinguished, lockedVisual);
        const glowColor = getStarGlowColor(star, isSuppressed, isExtinguished, lockedVisual);

        // V-26: погасшая — без лепестков, основа вдвое меньше основы свободной
        // звезды того же sizeFactor, в мягком ореоле. Вспышки и импульсы её не
        // касаются (она не соединяется и в созвездие не входит).
        if (isExtinguished) {
            const extBase = baseStarDrawSize * sizeFactor * STAR_BASE_DIAM_MULT * EXTINGUISHED_STAR_BASE_MULT;
            fill(glowColor[0], glowColor[1], glowColor[2], glowColor[3] * effectiveAlpha);
            circle(star.x, star.y, extBase * EXTINGUISHED_STAR_HALO_MULT);
            fill(coreColor[0], coreColor[1], coreColor[2], coreColor[3] * effectiveAlpha);
            circle(star.x, star.y, extBase);
            continue;
        }

        // V-26: лепестки звезды созвездия гаснут с приходом волны и загораются
        // в финале ночи (getStarPetalAlpha); у всех прочих горят всегда.
        const petalAlpha = lockedVisual
            ? (typeof getStarPetalAlpha === 'function' ? getStarPetalAlpha(star.id) : 0)
            : 1;

        // K-03: спокойное дыхание вместо вспышки. V-26: дышат только лепестки —
        // основа держит звезду на месте. Дышат только крупные узлы; в фигуре,
        // на подавлённой и на погасшей getStarBreathFactor вернёт 1.
        const isAtlas = !!(lockedVisual && atlasCollectedStarColors && atlasCollectedStarColors.get(star.id));
        const breath = (breathEnabled && typeof getStarBreathFactor === 'function')
            ? getStarBreathFactor(star, nowMs)
            : 1;
        const petalLayerAlpha = effectiveAlpha * breath * petalAlpha;
        const rayMult = isAtlas ? SPARK_ATLAS_RAY_MULT : 1;

        // Лепестки — три вложенных слоя: белое гало → цветное свечение → ядро.
        // Погашенные не рисуются вовсе: у звезды созвездия кадр легче, чем был.
        if (petalLayerAlpha > 0.004) {
            // V-07: feedbackBrighten усиливает гало/свечение досягаемых во время импульса.
            fill(255, 255, 255, Math.min(255, 25 * petalLayerAlpha * feedbackBrighten));
            drawStarPetalsShape(star.x, star.y, starDrawSize * 2, rayMult);

            fill(glowColor[0], glowColor[1], glowColor[2], Math.min(255, glowColor[3] * petalLayerAlpha * feedbackBrighten));
            drawStarPetalsShape(star.x, star.y, starDrawSize * 1.5, rayMult);

            fill(coreColor[0], coreColor[1], coreColor[2],
                coreColor[3] * (STAR_PETAL_CORE_ALPHA / 255) * petalLayerAlpha);
            drawStarPetalsShape(star.x, star.y, starDrawSize, rayMult);
        }

        // Основа — поверх лепестков, чуть светлее тира (у подавленной — её же
        // приглушённый цвет). Не дышит и не гаснет вместе с лепестками.
        const baseRgb = isSuppressed ? coreColor : blendRgb(coreColor, [255, 255, 255], STAR_BASE_WHITEN);
        fill(baseRgb[0], baseRgb[1], baseRgb[2], coreColor[3] * effectiveAlpha);
        circle(star.x, star.y, starDrawSize * STAR_BASE_DIAM_MULT);
    }
}

function getStarTierRgb(star) {
    return colorValueToRgb(getStarColorValue(star));
}

/**
 * V-12: `lockedVisual` отделяет ВИД locked-звезды от её игрового состояния —
 * во время волны создания звезда уже `locked`, но выглядит ещё черновой.
 * По умолчанию совпадает с `star.locked`, т.е. для всех прочих вызовов
 * поведение ровно прежнее.
 */
function getStarCoreColor(star, isSuppressed, isExtinguished, lockedVisual) {
    const tierRgb = getStarTierRgb(star);
    if (lockedVisual === undefined ? star.locked : lockedVisual) {
        // V-09: атласные звёзды светятся своим tier-цветом, как обычные locked
        // (декоративный оверрайд фигуры убран). Признак «атласности» — только
        // усиленное свечение в getStarGlowColor и удлинённые лучи.
        // V-26: приглушение V-25 снято — основа созвездия на полной яркости.
        return [tierRgb[0], tierRgb[1], tierRgb[2], 255];
    }
    if (isExtinguished) {
        const rgb = blendRgb(tierRgb, EXTINGUISHED_STAR_COLOR, 0.72);
        return [rgb[0], rgb[1], rgb[2], 170];
    }
    if (isSuppressed) {
        const rgb = blendRgb(tierRgb, SUPPRESSED_STAR_COLOR, 0.65);
        return [rgb[0], rgb[1], rgb[2], 130];
    }
    return [tierRgb[0], tierRgb[1], tierRgb[2], 255];
}

function getStarGlowColor(star, isSuppressed, isExtinguished, lockedVisual) {
    const tierRgb = getStarTierRgb(star);
    if (lockedVisual === undefined ? star.locked : lockedVisual) {
        // V-09: цвет — свой tier; атласность даёт лишь усиленное свечение (LOCKED_ATLAS_STAR_GLOW_BONUS).
        const isAtlas = atlasCollectedStarColors && atlasCollectedStarColors.has(star.id);
        // V-26: свечение — это слой лепестков, а они у звезды созвездия горят
        // только в финале; там оно как у свободной (V-25 гасила его до 15).
        const glowAlpha = isAtlas ? Math.min(255, 90 + LOCKED_ATLAS_STAR_GLOW_BONUS) : 90;
        return [tierRgb[0], tierRgb[1], tierRgb[2], glowAlpha];
    }
    if (isExtinguished) {
        const rgb = blendRgb(tierRgb, EXTINGUISHED_STAR_COLOR, 0.75);
        return [rgb[0], rgb[1], rgb[2], 32];
    }
    if (isSuppressed) {
        const rgb = blendRgb(tierRgb, SUPPRESSED_STAR_COLOR, 0.7);
        return [rgb[0], rgb[1], rgb[2], 45];
    }
    return [tierRgb[0], tierRgb[1], tierRgb[2], 90];
}

function drawAttachFlash() {
    if (attachFlashStarId === null) return;

    const star = getStarById(attachFlashStarId);
    const elapsed = millis() - attachFlashStartTime;
    const t = min(1, elapsed / ATTACH_FLASH_DURATION_MS);

    if (star && t < 1) {
        const fieldMouseX = mouseX / zoomLevel + camX;
        const fieldMouseY = mouseY / zoomLevel + camY;
        const p = nearestHorizontalCopy(star.x, star.y, fieldMouseX, fieldMouseY);
        const starDrawSize = Math.max(STAR_SIZE, STAR_SIZE / zoomLevel * 0.5);
        noStroke();
        const sc = 1 + 0.4 * (1 - t);
        const alpha = 120 * (1 - t);
        const flashRgb = getStarTierRgb(star);
        fill(flashRgb[0], flashRgb[1], flashRgb[2], alpha);
        circle(p.x, p.y, starDrawSize * sc * 1.5);
        fill(flashRgb[0], flashRgb[1], flashRgb[2], alpha * 0.6);
        circle(p.x, p.y, starDrawSize * sc * 2);
    }

    if (t >= 1) {
        attachFlashStarId = null;
    }
}

function isConstellationVisible(constellation) {
    if (!constellation.center) return true;
    const cx = constellation.center.x;
    const cy = constellation.center.y;
    const margin = 300;
    const viewW = width / zoomLevel;
    const viewH = height / zoomLevel;
    const vl = camX - margin;
    const vr = camX + viewW + margin;
    const vt = camY - margin;
    const vb = camY + viewH + margin;
    if (cy < vt || cy > vb) return false;
    return cx >= vl && cx <= vr;
}

// =============================================================================
// FLOATING SCORES
// =============================================================================

function drawFloatingScores() {
    for (let i = floatingScores.length - 1; i >= 0; i--) {
        const fs = floatingScores[i];
        const elapsed = millis() - fs.startTime;
        const t = min(1, elapsed / FLOATING_SCORE_DURATION_MS);
        if (t >= 1) {
            floatingScores.splice(i, 1);
            continue;
        }

        const alpha = 255 * (1 - t);
        const yOffset = -FLOATING_SCORE_RISE * t;

        const viewW = width / zoomLevel;
        const viewH = height / zoomLevel;
        const viewCx = camX + viewW / 2;
        const viewCy = camY + viewH / 2;
        const fw = nearestHorizontalCopy(fs.x, fs.y, viewCx, viewCy);
        const screenX = (fw.x - camX) * zoomLevel;
        const screenY = (fw.y - camY) * zoomLevel + yOffset;

        push();
        textAlign(CENTER, CENTER);
        textSize(18 + 4 * (1 - t));
        fill(fs.color[0], fs.color[1], fs.color[2], alpha);
        noStroke();
        text(fs.text, screenX, screenY);
        pop();
    }
}

// =============================================================================
// V-03: ЦВЕТ ЧЕРНОВОЙ ЛИНИИ — среднее по уже собранным звёздам
// =============================================================================

function getDraftChainColorRgb() {
    if (!Array.isArray(visitedStars) || visitedStars.length === 0) {
        return LINE_COLOR.slice();
    }
    return colorValueToRgb(getMeanColorValue(visitedStars));
}
