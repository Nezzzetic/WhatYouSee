// camera.js — Camera system, panning, zoom, rendering

// =============================================================================
// CAMERA STATE
// =============================================================================

let camX = 0;
let camY = 0;
let isPanning = false;
let panStartMouseX = 0;
let panStartMouseY = 0;
let panStartCamX = 0;
let panStartCamY = 0;

// =============================================================================
// ZOOM STATE
// =============================================================================

let zoomLevel = DEFAULT_ZOOM;

// =============================================================================
// CAMERA UTILITIES
// =============================================================================

/**
 * Smallest zoom (most zoomed out). Wrap убран по обеим осям, поэтому берём
 * min(), а не max(): на минимальном зуме видно ВСЁ поле целиком (по короткой
 * оси может остаться пустой отступ — это ок, camera.js уже центрирует по этой
 * оси в clampCamera()).
 */
function getMinZoomLevel() {
    const w = Math.max(width, 1);
    // U-09: считаем от высоты, не перекрытой свёрнутой шторкой, — на минимальном
    // зуме поле должно целиком помещаться НАД нижним UI, а не под ним.
    const h = typeof getUsableViewHeight === 'function'
        ? Math.max(getUsableViewHeight(), 1)
        : Math.max(height, 1);
    return Math.min(w / FIELD_WIDTH, h / FIELD_HEIGHT);
}

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

function clampZoomToField() {
    zoomLevel = constrain(zoomLevel, getMinZoomLevel(), MAX_ZOOM);
}

/**
 * D-01/U-05: зум с якорем — мировая точка под экранной (sx, sy) остаётся на месте.
 * Общая логика для колеса мыши, кнопок «+»/«−» и pinch.
 */
function zoomAtScreenPoint(sx, sy, newZoom) {
    const worldX = sx / zoomLevel + camX;
    const worldY = sy / zoomLevel + camY;
    zoomLevel = constrain(newZoom, getMinZoomLevel(), MAX_ZOOM);
    camX = worldX - sx / zoomLevel;
    camY = worldY - sy / zoomLevel;
    clampCamera();
}

/** D-01: шаг зума кнопками — мультипликативный, якорь — центр экрана. dir: +1 / −1. */
function zoomByStep(dir) {
    const factor = Math.pow(ZOOM_BUTTON_FACTOR, dir);
    zoomAtScreenPoint(width / 2, height / 2, zoomLevel * factor);
}

/** P-01: поле ограничено по обеим осям (X и Y), wrap убран — камера упирается в край. */
function clampCamera() {
    const viewW = width / zoomLevel;
    if (viewW >= FIELD_WIDTH) {
        camX = (FIELD_WIDTH - viewW) / 2;
    } else {
        camX = constrain(camX, 0, FIELD_WIDTH - viewW);
    }

    // U-09: по вертикали ограничиваем не по всей высоте канваса, а по «рабочей»
    // полосе над свёрнутой шторкой. Тогда камера уезжает ниже ровно настолько,
    // чтобы нижний край поля вышел из-под UI и до его звёзд можно было дотянуться.
    const usableH = typeof getUsableViewHeight === 'function' ? getUsableViewHeight() : height;
    const usableViewH = usableH / zoomLevel;
    if (usableViewH >= FIELD_HEIGHT) {
        camY = (FIELD_HEIGHT - usableViewH) / 2;
    } else {
        camY = constrain(camY, 0, FIELD_HEIGHT - usableViewH);
    }
}

/**
 * До P-01 возвращала смещения видимых горизонтальных копий поля (wrap).
 * Wrap убран — поле рендерится один раз, без копий/смещений.
 */
function getVisibleTileWorldOffsets(viewPadPx) {
    return [{ ox: 0, oy: 0 }];
}

/**
 * V-13: отзум финала ночи. Зовётся из draw() каждый кадр, пока идёт сцена.
 *
 * Цель НЕ запоминается на старте, а пересчитывается каждый кадр через штатную
 * centerCamera() (снимок → цель → восстановление): иначе открытие шторки,
 * поворот экрана или resize посреди сцены оставили бы камеру ехать в устаревшую
 * точку. Резерв полосы под свёрнутой шторкой (getUsableViewHeight) приезжает
 * сюда даром — он уже внутри centerCamera() и getMinZoomLevel().
 */
function updateLevelFinaleCamera() {
    if (typeof getLevelFinaleElapsed !== 'function') return;
    const elapsed = getLevelFinaleElapsed();
    if (elapsed < 0) return;

    const from = levelFinale.camFrom;
    const snapX = camX;
    const snapY = camY;
    const snapZoom = zoomLevel;
    centerCamera();
    const toX = camX;
    const toY = camY;
    const toZoom = zoomLevel;
    camX = snapX;
    camY = snapY;
    zoomLevel = snapZoom;

    const t = LEVEL_FINALE_ZOOM_MS > 0 ? Math.min(1, elapsed / LEVEL_FINALE_ZOOM_MS) : 1;
    const e = computeFinaleEase(t);
    zoomLevel = from.zoom + (toZoom - from.zoom) * e;
    camX = from.camX + (toX - from.camX) * e;
    camY = from.camY + (toY - from.camY) * e;
    clampCamera();
}

// =============================================================================
// FIELD RENDERING
// =============================================================================

/** V-13: `alpha` (0..1) — видимость созвездия в сцене финала; вне сцены всегда 1. */
function applyConstellationSkeletonStrokeStyle(shapeInfo, prominent, lineColor, alpha = 1) {
    const c = lineColor || shapeInfo.color;
    const a = Math.max(0, Math.min(1, alpha));
    if (prominent) {
        stroke(c[0], c[1], c[2], 255 * a);
        strokeWeight(REVEALED_CONSTELLATION_STROKE_WEIGHT / zoomLevel);
    } else if (shapeInfo.image) {
        stroke(c[0], c[1], c[2], LINEART_SKELETON_STROKE_ALPHA * a);
        strokeWeight(LINEART_SKELETON_STROKE_WEIGHT / zoomLevel);
    } else {
        stroke(c[0], c[1], c[2], 255 * a);
        strokeWeight(2 / zoomLevel);
    }
}

/**
 * V-10: зазор между концом линии и звездой в world-юнитах. Повторяет формулу
 * baseStarDrawSize из drawVisibleStars, поэтому масштабируется зумом так же,
 * как сами звёзды (в т.ч. на отзуме, где действует пол STAR_SIZE/zoom·0.5).
 */
function getLineStarGapWorld() {
    const base = Math.max(STAR_SIZE, STAR_SIZE / zoomLevel * 0.5);
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
 * Сегмент в мировых координатах между двумя звёздами.
 * До P-01 учитывала горизонтальный wrap (шов слева/справа); теперь wrap убран,
 * ox всегда 0 — рисует напрямую между фактическими позициями звёзд.
 * V-10: линия не доходит до звёзд — оба конца укорочены на зазор.
 * V-12: `progress` (0..1) чертит ребро не целиком, а до своей доли длины —
 * от startStar к endStar, то есть туда же, куда вёл палец. Возвращает
 * обрезанный сегмент, чтобы вызывающий мог положить сверху огонёк на острие.
 */
function drawSegmentHorizWrapWorld(startStar, endStar, ox, progress = 1) {
    const w1x = startStar.x + ox;
    const w1y = startStar.y;
    const w2 = nearestHorizontalCopy(endStar.x, endStar.y, w1x, w1y);
    const gap = getLineStarGapWorld();
    const t = trimSegmentEndsWorld(w1x, w1y, w2.x, w2.y, gap, gap);
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

function shouldShowConstellationLineArt() {
    return false;
}

function drawConstellationSkeletonLinesWorld(tiles) {
    for (const t of tiles) {
        const ox = t.ox;
        for (let constellation of constellations) {
            if (!isConstellationVisible(constellation)) continue;
            // V-09: атласные созвездия рисуются как обычные — prominent-стиль
            // (жирная линия) остаётся только для финального раскрытия. Glow-ореол
            // atlas-collected и prominent для recognizedAtlas убраны.
            const prominent = constellationArtRevealed;
            const shapeInfo = prominent
                ? (SHAPES[constellation.shape] || SHAPES[constellation.name] || SHAPES[SHAPE_UNRECOGNIZED])
                : SHAPES[SHAPE_UNRECOGNIZED];
            // V-03: цвет линий — производное от звёзд созвездия (fallback: LINE_COLOR)
            const lineColor = constellation.lineColor || LINE_COLOR;
            // V-13: в сцене финала созвездие сначала гаснет, потом рождается заново.
            // Полностью погасшее не рисуем вовсе — на небе их бывает 30+.
            const finaleAlpha = typeof getFinaleConstellationAlpha === 'function'
                ? getFinaleConstellationAlpha(constellation)
                : 1;
            if (finaleAlpha <= 0) continue;

            applyConstellationSkeletonStrokeStyle(shapeInfo, prominent, lineColor, finaleAlpha);
            for (let i = 0; i < constellation.lines.length; i++) {
                const seg = constellation.lines[i];
                const startStar = getStarById(seg.startId);
                const endStar = getStarById(seg.endId);
                if (!startStar || !endStar) continue;
                // V-12: у волнового созвездия ребро чертится до своей доли длины,
                // у всех прочих progress === 1 — путь ровно как до задачи.
                const progress = getCommitWaveEdgeProgress(constellation, i);
                const trimmed = drawSegmentHorizWrapWorld(startStar, endStar, ox, progress);
                if (progress < 1) {
                    drawCommitWaveCrestWorld(trimmed, progress, lineColor);
                }
            }
        }
    }
}

/** Мини-книга рядом со счётчиком: намёк на фигуру из открытого атласа. */
function drawDraftAtlasBookIconScreen(x, y, canCollect) {
    const h = typeof DRAFT_ATLAS_HINT_BOOK_PX === 'number' ? DRAFT_ATLAS_HINT_BOOK_PX : 10;
    const w = h * 0.9;
    const pageW = w * 0.44;

    noStroke();
    if (canCollect) {
        fill(255, 215, 95, 235);
    } else {
        fill(195, 205, 245, 235);
    }
    rect(x, y, pageW, h);
    rect(x + w - pageW, y, pageW, h);

    if (canCollect) {
        stroke(255, 235, 150, 210);
    } else {
        stroke(140, 155, 210, 210);
    }
    strokeWeight(1);
    line(x + w * 0.5, y + 1, x + w * 0.5, y + h - 1);
}

/** Счётчик звёзд у последней точки цепочки — в экранных px (зум и wrap). */
function drawDraftStarCountLabelScreen() {
    if (!currentLines || currentLines.length === 0) return;
    if (!visitedStars || visitedStars.length === 0) return;

    const lastId = visitedStars[visitedStars.length - 1];
    const star = getStarById(lastId);
    if (!star) return;

    const n = visitedStars.length;
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
    const offsetPx = 14;

    if (n <= 1) {
        fill(220, 220, 235, 235);
    } else if (claimedStarCounts.has(n)) {
        fill(130, 135, 155, 215);
    } else {
        fill(255, 230, 150, 250);
    }

    const labelX = screenX + offsetPx;
    const labelY = screenY - offsetPx;

    push();
    try {
        noStroke();
        textAlign(LEFT, BOTTOM);
        textSize(15);
        text(String(n), labelX, labelY);

        let atlasHint = null;
        try {
            if (typeof getDraftUnlockedAtlasShapeHint === 'function') {
                atlasHint = getDraftUnlockedAtlasShapeHint();
            }
        } catch (_) {
            atlasHint = null;
        }

        if (atlasHint) {
            const canCollect = typeof canCollectAtlasShapeOnField === 'function'
                && canCollectAtlasShapeOnField(atlasHint);
            const bookH = typeof DRAFT_ATLAS_HINT_BOOK_PX === 'number' ? DRAFT_ATLAS_HINT_BOOK_PX : 10;
            const bookX = labelX + textWidth(String(n)) + 5;
            drawDraftAtlasBookIconScreen(bookX, labelY - bookH, canCollect);
        }
    } finally {
        pop();
    }
}

function drawCurrentAndPendingLinesWorld(tiles) {
    const chainRgb = typeof getDraftChainColorRgb === 'function'
        ? getDraftChainColorRgb()
        : LINE_COLOR;
    for (const t of tiles) {
        stroke(chainRgb[0], chainRgb[1], chainRgb[2]);
        strokeWeight(2 / zoomLevel);
        for (let seg of currentLines) {
            const startStar = getStarById(seg.startId);
            const endStar = getStarById(seg.endId);
            if (startStar && endStar) {
                drawSegmentHorizWrapWorld(startStar, endStar, t.ox);
            }
        }
    }
}

function drawConstellationLineArtImage(constellation) {
    if (!shouldShowConstellationLineArt(constellation)) return;
    const shapeName = constellation.shape || constellation.name;
    const shapeInfo = SHAPES[shapeName] || SHAPES[SHAPE_UNRECOGNIZED];
    if (!shapeInfo.image || !constellation.imageTransform) return;
    const img = constellationImages[shapeName];
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const t = constellation.imageTransform;
    const scaleU = t.extentU / img.naturalWidth;
    const scaleV = t.extentV / img.naturalHeight;
    const uniformScale = Math.min(scaleU, scaleV);
    const shapeScale = typeof shapeInfo.imageScale === 'number' ? shapeInfo.imageScale : 1;
    const drawW = img.naturalWidth * uniformScale * shapeScale;
    const drawH = img.naturalHeight * uniformScale * shapeScale;

    let finalAngle = t.angle;
    const expectedArc = shapeInfo.imageArcSign || 0;
    if (expectedArc !== 0 && t.arcSign !== 0 && expectedArc !== t.arcSign) {
        finalAngle += Math.PI;
    }
    if (typeof shapeInfo.imageAngleOffsetDeg === 'number' && Number.isFinite(shapeInfo.imageAngleOffsetDeg)) {
        finalAngle += shapeInfo.imageAngleOffsetDeg * Math.PI / 180;
    }

    const offsetU = (typeof shapeInfo.imageOffsetU === 'number' ? shapeInfo.imageOffsetU : 0) * t.extentU;
    const offsetV = (typeof shapeInfo.imageOffsetV === 'number' ? shapeInfo.imageOffsetV : 0) * t.extentV;
    const offsetX = offsetU * Math.cos(finalAngle) - offsetV * Math.sin(finalAngle);
    const offsetY = offsetU * Math.sin(finalAngle) + offsetV * Math.cos(finalAngle);

    let opacity = CONSTELLATION_IMAGE_OPACITY;
    if (!constellationArtRevealed && constellation.atlasCollected) {
        opacity = 255;
    }

    push();
    translate(t.cx + offsetX, t.cy + offsetY);
    rotate(finalAngle);
    if (t.flipImageV) scale(1, -1);
    drawingContext.globalAlpha = opacity / 255;
    drawingContext.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
    drawingContext.globalAlpha = 1.0;
    pop();
}

function drawConstellationLineArtImagesOnTile() {
    for (let constellation of constellations) {
        if (!isConstellationVisible(constellation)) continue;
        drawConstellationLineArtImage(constellation);
    }
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

    noStroke();
    fill(c[0], c[1], c[2], 255 * zoomAlpha * waveAlpha);
    textSize(labelSize);
    text(name, labelAnchor.x, labelAnchor.y);
}

function drawConstellationLabelsOnTile() {
    // V-13: пока идёт финал ночи, подписей нет вовсе (решение заказчика: «названия
    // не важны на этой анимации»). Волну от revealTime при этом не трогаем — она
    // отыгрывает под нулевой альфой и к концу сцены все подписи уже на 255.
    if (typeof isLevelFinaleActive === 'function' && isLevelFinaleActive()) return;

    // V-11: множитель считается один раз за кадр, до цикла по созвездиям.
    // На дальнем зуме подписей нет вовсе — выходим сразу, не перебирая небо.
    const zoomAlpha = getLabelZoomAlphaFactor();
    if (zoomAlpha <= 0) return;

    noStroke();
    textAlign(CENTER, CENTER);

    for (let i = 0; i < constellations.length; i++) {
        const constellation = constellations[i];
        if (!isConstellationVisible(constellation)) continue;

        const labelAnchor = constellation.labelAnchor || constellation.center;
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
            fill(235, 235, 255, alpha * zoomAlpha);
            textSize(REVEALED_CONSTELLATION_LABEL_SIZE / zoomLevel);
            text(getConstellationDisplayName(constellation), labelAnchor.x, labelAnchor.y);
            continue;
        }

        if (constellation.atlasCollected) {
            drawCollectedAtlasConstellationLabel(constellation, labelAnchor, zoomAlpha);
            continue;
        }

        if (typeof isShapeRecognizedOnUnlockedAtlas === 'function'
            && isShapeRecognizedOnUnlockedAtlas(constellation)) {
            // V-09: имя распознанной атласной — простой стиль, цвет от звёзд.
            // V-12: у только что закоммиченного имя ждёт конца волны, как и у
            // atlas-collected — иначе подпись обгоняла бы собственные линии.
            const waveAlpha = typeof getCommitWaveLabelAlpha === 'function'
                ? getCommitWaveLabelAlpha(constellation)
                : 1;
            if (waveAlpha <= 0) continue;
            const c = constellation.lineColor || LINE_COLOR;
            fill(c[0], c[1], c[2], 255 * zoomAlpha * waveAlpha);
            textSize(COLLECTED_ATLAS_LABEL_SIZE / zoomLevel);
            text(getConstellationDisplayName(constellation), labelAnchor.x, labelAnchor.y);
        }
    }
}

function drawFieldMode() {
    push();
    scale(zoomLevel);
    translate(-camX, -camY);

    const tilePadForStars = 50;
    const tiles = getVisibleTileWorldOffsets(tilePadForStars);
    for (const t of tiles) {
        push();
        translate(t.ox, t.oy);
        drawVisibleBackgroundStars(t.ox, t.oy);
        pop();
    }

    drawConstellationSkeletonLinesWorld(tiles);
    drawCurrentAndPendingLinesWorld(tiles);

    for (const t of tiles) {
        push();
        translate(t.ox, t.oy);
        drawVisibleStars(t.ox, t.oy);
        pop();
    }

    for (const t of tiles) {
        push();
        translate(t.ox, t.oy);
        drawConstellationLineArtImagesOnTile();
        pop();
    }

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
        const t = trimSegmentEndsWorld(seg.ax, seg.ay, seg.bx, seg.by, getLineStarGapWorld(), 0);
        if (t) line(t.ax, t.ay, t.bx, t.by);
    }

    drawAttachFlash();

    for (const t of tiles) {
        push();
        translate(t.ox, t.oy);
        drawConstellationLabelsOnTile();
        pop();
    }

    pop();
}

// =============================================================================
// CONSTELLATION IMAGE TRANSFORM
// =============================================================================

function getConstellationStarsFromLines(lines) {
    const idSet = new Set();
    for (const seg of lines) {
        idSet.add(seg.startId);
        idSet.add(seg.endId);
    }

    const stars = [];
    for (const id of idSet) {
        const s = getStarById(id);
        if (s) stars.push(s);
    }
    return stars;
}

/**
 * Простая цепочка: n звёзд, n−1 рёбер, порядок вдоль пути (концы — [0] и [n−1]).
 * Для n=4: «низ» трусов — сегмент 1–2.
 */
function getOrderedChainStarsFromLinesN(lines, n) {
    if (!lines || lines.length !== n - 1 || n < 2) return null;
    const idSet = new Set();
    for (const seg of lines) {
        idSet.add(seg.startId);
        idSet.add(seg.endId);
    }
    if (idSet.size !== n) return null;

    const adj = {};
    for (const id of idSet) adj[id] = [];
    for (const seg of lines) {
        adj[seg.startId].push(seg.endId);
        adj[seg.endId].push(seg.startId);
    }

    let startId = null;
    for (const id of idSet) {
        if (adj[id].length === 1) {
            startId = id;
            break;
        }
    }
    if (startId === null) startId = [...idSet][0];

    const orderedIds = [startId];
    let prev = null;
    let current = startId;
    for (let i = 1; i < idSet.size; i++) {
        const neighbors = adj[current];
        let next = null;
        for (const nbr of neighbors) {
            if (nbr !== prev) {
                next = nbr;
                break;
            }
        }
        if (next == null) return null;
        prev = current;
        current = next;
        orderedIds.push(current);
    }

    const stars = orderedIds.map(id => getStarById(id)).filter(Boolean);
    return stars.length === n ? stars : null;
}

/** 4 звезды / 3 ребра, порядок цепи (концы [0] и [3]). */
function getOrderedChainStarsFromLines(lines) {
    return getOrderedChainStarsFromLinesN(lines, 4);
}

function computeExtentsByAngle(stars, cx, cy, angle) {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    let minU = Infinity, maxU = -Infinity;
    let minV = Infinity, maxV = -Infinity;
    for (const s of stars) {
        const dx = s.x - cx;
        const dy = s.y - cy;
        const u = dx * cosA + dy * sinA;
        const v = -dx * sinA + dy * cosA;
        minU = Math.min(minU, u);
        maxU = Math.max(maxU, u);
        minV = Math.min(minV, v);
        maxV = Math.max(maxV, v);
    }

    return {
        extentU: Math.max((maxU - minU) * CONSTELLATION_IMAGE_PADDING, 40),
        extentV: Math.max((maxV - minV) * CONSTELLATION_IMAGE_PADDING, 40)
    };
}

function computePatternDirectedImageTransform(lines, shapeName) {
    if (!shapeName) return null;
    const pattern = SHAPE_PATTERNS[shapeName];
    if (!pattern || !pattern.imageDirection) return null;

    const stars = getConstellationStarsFromLines(lines);
    if (stars.length < 2) return null;

    let cx = 0;
    let cy = 0;
    if (!pattern.imageAnchor || pattern.imageAnchor.mode === 'centroid') {
        for (const s of stars) {
            cx += s.x;
            cy += s.y;
        }
        cx /= stars.length;
        cy /= stars.length;
    } else {
        return null;
    }

    // R-02: режимы mustacheEndpointsChord / triangleSharpTip / trusyBottomEdge
    // ушли вместе с фигурами Усы, Пицца и Трусы. Из каталога-29 лайнарт
    // направляет только Банан.
    let directionX = 0;
    let directionY = 0;
    let bananaEndsForFlip = null;
    let bananaChainStars = null;
    if (pattern.imageDirection.mode === 'bananaChordBulge') {
        const ordered = getOrderedChainStarsFromLines(lines);
        if (!ordered) return null;
        bananaChainStars = ordered;
        const p0 = ordered[0];
        const p1 = ordered[1];
        const p2 = ordered[2];
        const p3 = ordered[3];
        bananaEndsForFlip = { p0, p3 };

        const chordX = p3.x - p0.x;
        const chordY = p3.y - p0.y;
        const chordLen = Math.hypot(chordX, chordY);

        // Ось «вперёд» — среднее направление рёбер цепи (касательная к дуге), а не хорда концов:
        // иначе ось «плющится» к хорде и лайнарт разворачивается не вдоль жёлтого скелета.
        const t01x = p1.x - p0.x;
        const t01y = p1.y - p0.y;
        const t12x = p2.x - p1.x;
        const t12y = p2.y - p1.y;
        const t23x = p3.x - p2.x;
        const t23y = p3.y - p2.y;
        const l01 = Math.hypot(t01x, t01y);
        const l12 = Math.hypot(t12x, t12y);
        const l23 = Math.hypot(t23x, t23y);
        let sx = 0;
        let sy = 0;
        if (l01 >= 1e-6) {
            sx += t01x / l01;
            sy += t01y / l01;
        }
        if (l12 >= 1e-6) {
            sx += t12x / l12;
            sy += t12y / l12;
        }
        if (l23 >= 1e-6) {
            sx += t23x / l23;
            sy += t23y / l23;
        }
        const slen = Math.hypot(sx, sy);
        if (slen >= 1e-6) {
            let tx = sx / slen;
            let ty = sy / slen;
            // Согласовать с направлением p0→p3: порядок обхода цепи с произвольного конца даёт ±180°.
            if (chordLen >= 1e-6) {
                const cxn = chordX / chordLen;
                const cyn = chordY / chordLen;
                if (tx * cxn + ty * cyn < 0) {
                    tx = -tx;
                    ty = -ty;
                }
            }
            directionX = tx;
            directionY = ty;
        } else if (chordLen >= 1e-6) {
            directionX = chordX / chordLen;
            directionY = chordY / chordLen;
        } else {
            directionX = 1;
            directionY = 0;
        }
    } else {
        return null;
    }

    const directionLen = Math.hypot(directionX, directionY);
    if (directionLen < 1e-6) return null;

    const angle = Math.atan2(directionY, directionX);
    const extents = computeExtentsByAngle(stars, cx, cy, angle);

    let extentU = extents.extentU;
    let extentV = extents.extentV;
    if (bananaChainStars && bananaChainStars.length === 4) {
        const q0 = bananaChainStars[0];
        const q1 = bananaChainStars[1];
        const q2 = bananaChainStars[2];
        const q3 = bananaChainStars[3];
        const polyLen =
            Math.hypot(q1.x - q0.x, q1.y - q0.y) +
            Math.hypot(q2.x - q1.x, q2.y - q1.y) +
            Math.hypot(q3.x - q2.x, q3.y - q2.y);
        // Contain с min(scaleU, scaleV): узкая проекция на ось V сильно уменьшает картинку.
        const minVFromU = extentU * 0.5;
        const minVFromPath = polyLen * CONSTELLATION_IMAGE_PADDING * 0.34;
        extentV = Math.max(extentV, minVFromU, minVFromPath);
    }

    let flipImageV = false;
    if (bananaEndsForFlip) {
        const p0 = bananaEndsForFlip.p0;
        const p3 = bananaEndsForFlip.p3;
        const midX = (p0.x + p3.x) * 0.5;
        const midY = (p0.y + p3.y) * 0.5;
        const tcx = cx - midX;
        const tcy = cy - midY;
        const tlen = Math.hypot(tcx, tcy);
        if (tlen >= 1e-6) {
            const ux = tcx / tlen;
            const uy = tcy / tlen;
            const sinA = Math.sin(angle);
            const cosA = Math.cos(angle);
            const downX = -sinA;
            const downY = cosA;
            flipImageV = downX * ux + downY * uy > 0;
        }
    }

    return {
        cx,
        cy,
        angle,
        extentU,
        extentV,
        arcSign: 0,
        flipImageV
    };
}

function computeImageTransform(lines, shapeName = null) {
    const patternDirectedTransform = computePatternDirectedImageTransform(lines, shapeName);
    if (patternDirectedTransform) return patternDirectedTransform;

    const stars = getConstellationStarsFromLines(lines);
    if (stars.length < 2) return null;

    let cx = 0, cy = 0;
    for (const s of stars) { cx += s.x; cy += s.y; }
    cx /= stars.length;
    cy /= stars.length;

    // Цепочка 3★ / 2 ребра: размер вдоль оси — прежде всего расстояние между 1-й и 3-й вершиной в порядке цепи.
    if (stars.length === 3 && lines.length === 2) {
        const ordered = getOrderedChainStarsFromLinesN(lines, 3);
        if (ordered && ordered.length === 3) {
            const p0 = ordered[0];
            const p2 = ordered[2];
            const chordX = p2.x - p0.x;
            const chordY = p2.y - p0.y;
            const chordLen = Math.hypot(chordX, chordY);
            const angle = chordLen >= 1e-6 ? Math.atan2(chordY, chordX) : 0;

            const extentU = Math.max(chordLen * CONSTELLATION_IMAGE_PADDING, 40);
            const perp = computeExtentsByAngle(stars, cx, cy, angle);
            const vRatio = typeof CHAIN3_LINEART_MIN_V_RATIO === 'number' ? CHAIN3_LINEART_MIN_V_RATIO : 0.35;
            const extentV = Math.max(perp.extentV, extentU * vRatio, 40);

            const midX = (p0.x + p2.x) / 2;
            const midY = (p0.y + p2.y) / 2;
            const sinA = Math.sin(angle);
            const cosA = Math.cos(angle);
            const bowV = -(cx - midX) * sinA + (cy - midY) * cosA;
            const arcSign = bowV >= 0 ? 1 : -1;

            return { cx, cy, angle, extentU, extentV, arcSign };
        }
    }

    let covXX = 0, covXY = 0, covYY = 0;
    for (const s of stars) {
        const dx = s.x - cx;
        const dy = s.y - cy;
        covXX += dx * dx;
        covXY += dx * dy;
        covYY += dy * dy;
    }

    const angle = 0.5 * Math.atan2(2 * covXY, covXX - covYY);
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const extents = computeExtentsByAngle(stars, cx, cy, angle);
    const extentU = extents.extentU;
    const extentV = extents.extentV;

    let maxDistSq = 0;
    let endA = 0, endB = 0;
    for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
            const dsq = (stars[i].x - stars[j].x) ** 2 + (stars[i].y - stars[j].y) ** 2;
            if (dsq > maxDistSq) {
                maxDistSq = dsq;
                endA = i;
                endB = j;
            }
        }
    }
    const midX = (stars[endA].x + stars[endB].x) / 2;
    const midY = (stars[endA].y + stars[endB].y) / 2;
    const bowV = -(cx - midX) * sinA + (cy - midY) * cosA;
    const arcSign = bowV >= 0 ? 1 : -1;

    return { cx, cy, angle, extentU, extentV, arcSign };
}

// =============================================================================
// VISIBILITY HELPERS
// =============================================================================

function drawVisibleBackgroundStars(worldTileOx, worldTileOy) {
    const tileOx = typeof worldTileOx === 'number' ? worldTileOx : 0;
    const tileOy = typeof worldTileOy === 'number' ? worldTileOy : 0;
    const viewW = width / zoomLevel;
    const viewH = height / zoomLevel;
    // Фоновые звёзды появляются быстрее основных (нет индивидуального appearDelay)
    const bgElapsed = millis() - skyStartTime;
    const bgFadeDuration = STAR_FADE_DURATION * skyFadeScale * 0.5;
    const bgFadeAlpha = bgFadeDuration > 0 ? constrain(bgElapsed / bgFadeDuration, 0, 1) : 1;
    noStroke();
    for (let s of fieldBackgroundStars) {
        const wx = s.x + tileOx;
        const wy = s.y + tileOy;
        if (wx < camX - 10 || wx > camX + viewW + 10 ||
            wy < camY - 10 || wy > camY + viewH + 10) continue;
        const twinkle = 0.7 + 0.3 * sin(frameCount * 0.02 + (s.phase || 0));
        fill(255, 255, 255, s.alpha * bgFadeAlpha * twinkle);
        // Плотная заливная точка: не даём диаметру уйти в суб-пиксель (иначе AA
        // делает из круга «кольцо»).
        const bgDiam = Math.max(s.size, BG_STAR_MIN_SCREEN_DIAM / zoomLevel);
        circle(s.x, s.y, bgDiam);
    }
}

// -----------------------------------------------------------------------------
// STAR SHAPE — «Искра ✦» (визуальный концепт 4)
// -----------------------------------------------------------------------------

/**
 * Рисует один слой 4-лучевой искры с вогнутыми лучами.
 * @param {number} diam  Базовый диаметр слоя (world-units, эквивалент прежнего circle-диаметра).
 * @param {number} rayMult  Множитель длины лучей (1 — база, >1 у atlas-collected).
 * @param {number} pulse  Twinkle: доля прибавки/убавки длины лучей (может быть <0).
 * Вызывающий сам делает fill(...) перед вызовом.
 */
function drawSparkleShape(x, y, diam, rayMult, pulse) {
    // Фолбэк на минимальном зуме: искра нечитаема — рисуем точку.
    if (diam * zoomLevel < SPARK_MIN_SCREEN_DIAM) {
        circle(x, y, diam);
        return;
    }
    const R = diam * SPARK_RAY_LEN_MULT * (rayMult || 1) * (1 + (pulse || 0));
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

// V-07: состояние фидбэк-анимации соединения. Обновляется раз за кадр
// (гейт по frameCount), т.к. drawVisibleStars вызывается по разу на тайл.
let feedbackAnchorId = null;
let feedbackAnchorMoves = 0;
let connectFeedbackFrame = -1;
// Пер-звёздное состояние { dim, frame, reach, pulseMs } по star.id — вне сейва
// (как atlasCollectedStarColors). Сбрасывается вместе с полем (sketch.js).
let connectFeedbackState = new Map();

function drawVisibleStars(worldTileOx, worldTileOy) {
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
    const tileOx = typeof worldTileOx === 'number' ? worldTileOx : 0;
    const tileOy = typeof worldTileOy === 'number' ? worldTileOy : 0;
    const viewW = width / zoomLevel;
    const viewH = height / zoomLevel;
    const baseStarDrawSize = Math.max(STAR_SIZE, STAR_SIZE / zoomLevel * 0.5);
    const elapsed = millis() - skyStartTime;
    const fadeDuration = STAR_FADE_DURATION * skyFadeScale;
    noStroke();
    for (let star of fieldStars) {
        if (!star) continue;
        const wx = star.x + tileOx;
        const wy = star.y + tileOy;
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
        const isSuppressed = !!star.suppressed && !star.locked;
        const isExtinguished = !!star.extinguished && !star.locked;
        let starDrawSize = baseStarDrawSize * sizeFactor;
        if (isExtinguished) {
            starDrawSize *= EXTINGUISHED_STAR_SCALE;
        } else if (isSuppressed) {
            starDrawSize *= SUPPRESSED_STAR_SCALE;
        }
        if (lockedVisual) {
            starDrawSize *= LOCKED_STAR_SIZE_MULTIPLIER;
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

        // Погасшие — приглушённый заполненный круг (без искры и без обводки):
        // «выгоревшая» звезда, отличается округлой формой. Гибрид по ролям.
        if (isExtinguished) {
            fill(glowColor[0], glowColor[1], glowColor[2], glowColor[3] * effectiveAlpha);
            circle(star.x, star.y, starDrawSize * 1.5);
            fill(coreColor[0], coreColor[1], coreColor[2], coreColor[3] * effectiveAlpha);
            circle(star.x, star.y, starDrawSize);
            continue;
        }

        // Twinkle: редкая кратковременная вспышка. Сдвиг фазы от координат
        // (стабилен между кадрами) десинхронизирует звёзды — сверкают единицы.
        const isAtlas = !!(lockedVisual && atlasCollectedStarColors && atlasCollectedStarColors.get(star.id));
        let pulse = 0;
        let twBrighten = 1;
        if (!isSuppressed) { // на подавлённых — статично
            const phaseMs = (((star.x * 131 + star.y * 57) % SPARK_TWINKLE_PERIOD_MS)
                + SPARK_TWINKLE_PERIOD_MS) % SPARK_TWINKLE_PERIOD_MS;
            const u = (millis() + phaseMs) % SPARK_TWINKLE_PERIOD_MS;
            if (u < SPARK_TWINKLE_BURST_MS) {
                const env = Math.sin((u / SPARK_TWINKLE_BURST_MS) * Math.PI); // 0→1→0
                pulse = env * SPARK_TWINKLE_AMP;
                twBrighten = 1 + env * SPARK_TWINKLE_BRIGHTEN;
            }
        }
        const rayMult = isAtlas ? SPARK_ATLAS_RAY_MULT : 1;

        // Три вложенных слоя искры: белое гало → цветное свечение → ядро.
        // Яркость гало/свечения растёт во вспышке (у ядра alpha=255 — упирается в потолок).
        const haloWhiteAlpha = lockedVisual ? LOCKED_STAR_HALO_WHITE_ALPHA : 25;
        // V-07: feedbackBrighten усиливает гало/свечение досягаемых во время импульса.
        fill(255, 255, 255, Math.min(255, haloWhiteAlpha * effectiveAlpha * twBrighten * feedbackBrighten));
        drawSparkleShape(star.x, star.y, starDrawSize * 2, rayMult, pulse);

        fill(glowColor[0], glowColor[1], glowColor[2], Math.min(255, glowColor[3] * effectiveAlpha * twBrighten * feedbackBrighten));
        drawSparkleShape(star.x, star.y, starDrawSize * 1.5, rayMult, pulse);

        fill(coreColor[0], coreColor[1], coreColor[2], coreColor[3] * effectiveAlpha);
        drawSparkleShape(star.x, star.y, starDrawSize, rayMult, pulse);
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
        // V-09: цвет — свой tier; атласность даёт лишь усиленное свечение (+50).
        const isAtlas = atlasCollectedStarColors && atlasCollectedStarColors.has(star.id);
        const glowAlpha = isAtlas ? Math.min(255, LOCKED_STAR_GLOW_ALPHA + 50) : LOCKED_STAR_GLOW_ALPHA;
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
    const pad = margin + 350;
    for (const t of getVisibleTileWorldOffsets(pad)) {
        const wcx = cx + t.ox;
        if (wcx >= vl && wcx <= vr) return true;
    }
    return false;
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
