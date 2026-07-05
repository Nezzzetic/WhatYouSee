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
    const h = Math.max(height, 1);
    return Math.min(w / FIELD_WIDTH, h / FIELD_HEIGHT);
}

function clampZoomToField() {
    zoomLevel = constrain(zoomLevel, getMinZoomLevel(), MAX_ZOOM);
}

/** P-01: поле ограничено по обеим осям (X и Y), wrap убран — камера упирается в край. */
function clampCamera() {
    const viewW = width / zoomLevel;
    if (viewW >= FIELD_WIDTH) {
        camX = (FIELD_WIDTH - viewW) / 2;
    } else {
        camX = constrain(camX, 0, FIELD_WIDTH - viewW);
    }

    const viewH = height / zoomLevel;
    if (viewH >= FIELD_HEIGHT) {
        camY = (FIELD_HEIGHT - viewH) / 2;
    } else {
        camY = constrain(camY, 0, FIELD_HEIGHT - viewH);
    }
}

/**
 * До P-01 возвращала смещения видимых горизонтальных копий поля (wrap).
 * Wrap убран — поле рендерится один раз, без копий/смещений.
 */
function getVisibleTileWorldOffsets(viewPadPx) {
    return [{ ox: 0, oy: 0 }];
}

// =============================================================================
// FIELD RENDERING
// =============================================================================

function applyConstellationSkeletonStrokeStyle(shapeInfo, prominent, lineColor) {
    const c = lineColor || shapeInfo.color;
    if (prominent) {
        stroke(c[0], c[1], c[2]);
        strokeWeight(REVEALED_CONSTELLATION_STROKE_WEIGHT / zoomLevel);
    } else if (shapeInfo.image) {
        stroke(c[0], c[1], c[2], LINEART_SKELETON_STROKE_ALPHA);
        strokeWeight(LINEART_SKELETON_STROKE_WEIGHT / zoomLevel);
    } else {
        stroke(c[0], c[1], c[2]);
        strokeWeight(2 / zoomLevel);
    }
}

/**
 * Сегмент в мировых координатах между двумя звёздами.
 * До P-01 учитывала горизонтальный wrap (шов слева/справа); теперь wrap убран,
 * ox всегда 0 — рисует напрямую между фактическими позициями звёзд.
 */
function drawSegmentHorizWrapWorld(startStar, endStar, ox) {
    const w1x = startStar.x + ox;
    const w1y = startStar.y;
    const w2 = nearestHorizontalCopy(endStar.x, endStar.y, w1x, w1y);
    line(w1x, w1y, w2.x, w2.y);
}

function shouldShowConstellationLineArt() {
    return false;
}

function drawConstellationSkeletonLinesWorld(tiles) {
    for (const t of tiles) {
        const ox = t.ox;
        for (let constellation of constellations) {
            if (!isConstellationVisible(constellation)) continue;
            const collectedOnField = !!constellation.atlasCollected;
            const recognizedAtlas = typeof isShapeRecognizedOnUnlockedAtlas === 'function'
                && isShapeRecognizedOnUnlockedAtlas(constellation);
            const prominent = constellationArtRevealed || collectedOnField || recognizedAtlas;
            const shapeInfo = prominent
                ? (SHAPES[constellation.shape] || SHAPES[constellation.name] || SHAPES['Фигура'])
                : SHAPES['Фигура'];
            // V-03: цвет линий — производное от звёзд созвездия (fallback: LINE_COLOR)
            const lineColor = constellation.lineColor || LINE_COLOR;

            if (collectedOnField && !constellationArtRevealed) {
                stroke(lineColor[0], lineColor[1], lineColor[2], COLLECTED_ATLAS_GLOW_ALPHA);
                strokeWeight((REVEALED_CONSTELLATION_STROKE_WEIGHT + COLLECTED_ATLAS_GLOW_STROKE_EXTRA) / zoomLevel);
                for (let seg of constellation.lines) {
                    const startStar = getStarById(seg.startId);
                    const endStar = getStarById(seg.endId);
                    if (startStar && endStar) {
                        drawSegmentHorizWrapWorld(startStar, endStar, ox);
                    }
                }
            }

            applyConstellationSkeletonStrokeStyle(shapeInfo, prominent, lineColor);
            for (let seg of constellation.lines) {
                const startStar = getStarById(seg.startId);
                const endStar = getStarById(seg.endId);
                if (startStar && endStar) {
                    drawSegmentHorizWrapWorld(startStar, endStar, ox);
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
    const shapeInfo = SHAPES[shapeName] || SHAPES['Фигура'];
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

function getAtlasCollectPulseStrength(constellation) {
    if (!constellation || !constellation.atlasCollected || constellationArtRevealed) return 0;
    const start = constellation.collectedAtMs;
    if (!start) return 0;
    const elapsed = millis() - start;
    if (elapsed < 0 || elapsed > ATLAS_COLLECT_PULSE_MS) return 0;
    return 1 - elapsed / ATLAS_COLLECT_PULSE_MS;
}

function drawCollectedAtlasConstellationLabel(constellation, labelAnchor, shapeInfo) {
    const c = shapeInfo.color;
    const labelSize = COLLECTED_ATLAS_LABEL_SIZE / zoomLevel;
    const name = constellation.name;
    const pulse = getAtlasCollectPulseStrength(constellation);

    if (pulse > 0) {
        noFill();
        stroke(c[0], c[1], c[2], 90 + 120 * pulse);
        strokeWeight((2 + 3 * pulse) / zoomLevel);
        const ringR = (42 + 28 * pulse) / zoomLevel;
        ellipse(labelAnchor.x, labelAnchor.y, ringR * 2, ringR * 2);
    }

    noStroke();
    fill(255, 220, 120);
    textSize(labelSize * 1.05);
    const badge = typeof COLLECTED_ATLAS_BADGE === 'string' ? COLLECTED_ATLAS_BADGE : '★';
    text(badge, labelAnchor.x, labelAnchor.y - labelSize * 0.55);

    fill(c[0], c[1], c[2]);
    textSize(labelSize);
    text(name, labelAnchor.x, labelAnchor.y + labelSize * 0.42);
}

function drawConstellationLabelsOnTile() {
    noStroke();
    textAlign(CENTER, CENTER);

    for (let i = 0; i < constellations.length; i++) {
        const constellation = constellations[i];
        if (!isConstellationVisible(constellation)) continue;

        const labelAnchor = constellation.labelAnchor || constellation.center;
        if (!labelAnchor || !constellation.name) continue;

        const shapeInfo = SHAPES[constellation.shape] || SHAPES[constellation.name] || SHAPES['Фигура'];

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
            fill(235, 235, 255, alpha);
            textSize(REVEALED_CONSTELLATION_LABEL_SIZE / zoomLevel);
            text(constellation.customName || constellation.name, labelAnchor.x, labelAnchor.y);
            continue;
        }

        if (constellation.atlasCollected) {
            drawCollectedAtlasConstellationLabel(constellation, labelAnchor, shapeInfo);
            continue;
        }

        if (typeof isShapeRecognizedOnUnlockedAtlas === 'function'
            && isShapeRecognizedOnUnlockedAtlas(constellation)) {
            fill(shapeInfo.color[0], shapeInfo.color[1], shapeInfo.color[2]);
            textSize(COLLECTED_ATLAS_LABEL_SIZE / zoomLevel);
            text(constellation.name, labelAnchor.x, labelAnchor.y);
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
        line(seg.ax, seg.ay, seg.bx, seg.by);
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

/**
 * Ребро «пояс / промежность» (вдоль ширины лайнарта): почти параллельно хорде между концами цепи.
 * Ножки U почти перпендикулярны хорде. «Дальше всех от хорды» ломается, если концы цепи — низ ножек.
 */
function getTrusyHemEdgeStars(orderedFour) {
    if (!orderedFour || orderedFour.length !== 4) return null;
    const p0 = orderedFour[0];
    const p3 = orderedFour[3];
    const ax = p0.x;
    const ay = p0.y;
    const chordDx = p3.x - ax;
    const chordDy = p3.y - ay;
    const chordLen = Math.hypot(chordDx, chordDy);

    let bestI = 1;
    let bestPar = -1;
    let bestDist = -1;

    for (let i = 0; i < 3; i++) {
        const s = orderedFour[i];
        const e = orderedFour[i + 1];
        const edx = e.x - s.x;
        const edy = e.y - s.y;
        const edgeLen = Math.hypot(edx, edy);
        if (edgeLen < 1e-6) continue;

        let par = 0;
        if (chordLen >= 1e-6) {
            par = Math.abs(edx * chordDx + edy * chordDy) / (edgeLen * chordLen);
        }

        const mx = (s.x + e.x) * 0.5;
        const my = (s.y + e.y) * 0.5;
        const dist = chordLen >= 1e-6
            ? Math.abs(chordDy * (mx - ax) - chordDx * (my - ay)) / chordLen
            : my;

        const betterPar = par > bestPar + 1e-4;
        const tieBreak = bestPar >= 0 && Math.abs(par - bestPar) <= 1e-4 && dist > bestDist;
        if (betterPar || tieBreak) {
            bestPar = par;
            bestDist = dist;
            bestI = i;
        }
    }

    let B = orderedFour[bestI];
    let C = orderedFour[bestI + 1];
    let dxc = C.x - B.x;
    let dyc = C.y - B.y;
    const segLen = Math.hypot(dxc, dyc);
    if (segLen < 1e-6) return null;

    if (chordLen >= 1e-6) {
        if (dxc * chordDx + dyc * chordDy < 0) {
            const t = B;
            B = C;
            C = t;
            dxc = -dxc;
            dyc = -dyc;
        }
    } else if (Math.abs(dxc) >= Math.abs(dyc) && dxc < 0) {
        const t = B;
        B = C;
        C = t;
        dxc = -dxc;
        dyc = -dyc;
    }

    return { B, C, dxc, dyc, segLen };
}

function getTriangleVertexAngleDeg(prev, curr, next) {
    const abx = prev.x - curr.x;
    const aby = prev.y - curr.y;
    const cbx = next.x - curr.x;
    const cby = next.y - curr.y;
    const dot = abx * cbx + aby * cby;
    const cross = abx * cby - aby * cbx;
    return degrees(Math.atan2(Math.abs(cross), dot));
}

function getSharpTriangleTip(stars) {
    if (!Array.isArray(stars) || stars.length !== 3) return null;
    let tipIndex = -1;
    let minAngle = Infinity;
    for (let i = 0; i < 3; i++) {
        const prev = stars[(i + 2) % 3];
        const curr = stars[i];
        const next = stars[(i + 1) % 3];
        const angle = getTriangleVertexAngleDeg(prev, curr, next);
        if (angle < minAngle) {
            minAngle = angle;
            tipIndex = i;
        }
    }
    return tipIndex >= 0 ? stars[tipIndex] : null;
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

    // Размер лайнарта — по расстоянию между крайними звёздами цепочки (как хорда у цепочки 3★).
    if (pattern.imageDirection.mode === 'mustacheEndpointsChord') {
        const ordered = getOrderedChainStarsFromLinesN(lines, 5);
        if (!ordered) return null;
        const p0 = ordered[0];
        const p4 = ordered[4];
        const chordX = p4.x - p0.x;
        const chordY = p4.y - p0.y;
        const chordLen = Math.hypot(chordX, chordY);
        const angle = chordLen >= 1e-6 ? Math.atan2(chordY, chordX) : 0;
        const extentU = Math.max(chordLen * CONSTELLATION_IMAGE_PADDING, 40);
        const perp = computeExtentsByAngle(stars, cx, cy, angle);
        const vRatio = typeof CHAIN3_LINEART_MIN_V_RATIO === 'number' ? CHAIN3_LINEART_MIN_V_RATIO : 0.35;
        const extentV = Math.max(perp.extentV, extentU * vRatio, 40);
        const midX = (p0.x + p4.x) * 0.5;
        const midY = (p0.y + p4.y) * 0.5;
        const sinA = Math.sin(angle);
        const cosA = Math.cos(angle);
        const bowV = -(cx - midX) * sinA + (cy - midY) * cosA;
        const arcSign = bowV >= 0 ? 1 : -1;
        return { cx, cy, angle, extentU, extentV, arcSign, flipImageV: false };
    }

    let directionX = 0;
    let directionY = 0;
    let hemForFlip = null;
    let bananaEndsForFlip = null;
    let bananaChainStars = null;
    if (pattern.imageDirection.mode === 'triangleSharpTip') {
        const tip = getSharpTriangleTip(stars);
        if (!tip) return null;
        directionX = tip.x - cx;
        directionY = tip.y - cy;
    } else if (pattern.imageDirection.mode === 'trusyBottomEdge') {
        const ordered = getOrderedChainStarsFromLines(lines);
        if (!ordered) return null;
        const hem = getTrusyHemEdgeStars(ordered);
        if (!hem) return null;
        hemForFlip = hem;
        // Локальная ось +X после rotate(angle) = вдоль ребра, параллельного хорде (пояс/промежность).
        directionX = hem.dxc / hem.segLen;
        directionY = hem.dyc / hem.segLen;
    } else if (pattern.imageDirection.mode === 'bananaChordBulge') {
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

    if (hemForFlip) {
        const orderedTr = getOrderedChainStarsFromLines(lines);
        if (orderedTr && orderedTr.length === 4) {
            const q0 = orderedTr[0];
            const q1 = orderedTr[1];
            const q2 = orderedTr[2];
            const q3 = orderedTr[3];
            const polyLenTr =
                Math.hypot(q1.x - q0.x, q1.y - q0.y) +
                Math.hypot(q2.x - q1.x, q2.y - q1.y) +
                Math.hypot(q3.x - q2.x, q3.y - q2.y);
            const ru = typeof TRUSY_LINEART_MIN_V_FROM_U_RATIO === 'number' ? TRUSY_LINEART_MIN_V_FROM_U_RATIO : 0.44;
            const rp = typeof TRUSY_LINEART_MIN_V_FROM_PATH_RATIO === 'number' ? TRUSY_LINEART_MIN_V_FROM_PATH_RATIO : 0.30;
            const minVFromU = extentU * ru;
            const minVFromPath = polyLenTr * CONSTELLATION_IMAGE_PADDING * rp;
            extentV = Math.max(extentV, minVFromU, minVFromPath);
        }
    }

    let flipImageV = false;
    if (hemForFlip) {
        const midX = (hemForFlip.B.x + hemForFlip.C.x) * 0.5;
        const midY = (hemForFlip.B.y + hemForFlip.C.y) * 0.5;
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
            // Инверсия от первой версии: иначе лайнарт стабильно вверх ногами.
            flipImageV = downX * ux + downY * uy > 0;
        }
    } else if (bananaEndsForFlip) {
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
        circle(s.x, s.y, s.size);
    }
}

function drawVisibleStars(worldTileOx, worldTileOy) {
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

        const sizeFactor = typeof star.sizeFactor === 'number' ? star.sizeFactor : 1;
        const isSuppressed = !!star.suppressed && !star.locked;
        const isExtinguished = !!star.extinguished && !star.locked;
        let starDrawSize = baseStarDrawSize * sizeFactor;
        if (isExtinguished) {
            starDrawSize *= EXTINGUISHED_STAR_SCALE;
        } else if (isSuppressed) {
            starDrawSize *= SUPPRESSED_STAR_SCALE;
        }
        if (star.locked) {
            starDrawSize *= LOCKED_STAR_SIZE_MULTIPLIER;
        }

        // U-03: dim out-of-range stars during drag (variant B)
        let rangeDimFactor = 1.0;
        if (isDragging && currentStartStar
                && star.id !== currentStartStar.id
                && !star.locked
                && !visitedStars.includes(star.id)) {
            const dist = horizontalWrapDist(star.x, star.y, currentStartStar.x, currentStartStar.y);
            if (dist > getMaxEdgeLength()) {
                rangeDimFactor = 0.3;
            }
        }
        const effectiveAlpha = fadeAlpha * rangeDimFactor;

        const coreColor = getStarCoreColor(star, isSuppressed, isExtinguished);
        fill(coreColor[0], coreColor[1], coreColor[2], coreColor[3] * effectiveAlpha);
        circle(star.x, star.y, starDrawSize);

        const glowColor = getStarGlowColor(star, isSuppressed, isExtinguished);
        fill(glowColor[0], glowColor[1], glowColor[2], glowColor[3] * effectiveAlpha);
        circle(star.x, star.y, starDrawSize * (isExtinguished ? 1.25 : 1.5));
        const haloWhiteAlpha = isExtinguished ? 14 : (star.locked ? LOCKED_STAR_HALO_WHITE_ALPHA : 25);
        fill(255, 255, 255, haloWhiteAlpha * effectiveAlpha);
        circle(star.x, star.y, starDrawSize * (isExtinguished ? 1.7 : 2));
    }
}

function getStarTierRgb(star) {
    return colorValueToRgb(getStarColorValue(star));
}

function getStarCoreColor(star, isSuppressed, isExtinguished) {
    const tierRgb = getStarTierRgb(star);
    if (star.locked) {
        const atlasRgb = atlasCollectedStarColors && atlasCollectedStarColors.get(star.id);
        const base = atlasRgb || tierRgb;
        return [base[0], base[1], base[2], 255];
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

function getStarGlowColor(star, isSuppressed, isExtinguished) {
    const tierRgb = getStarTierRgb(star);
    if (star.locked) {
        const atlasRgb = atlasCollectedStarColors && atlasCollectedStarColors.get(star.id);
        const base = atlasRgb || tierRgb;
        const glowAlpha = atlasRgb ? Math.min(255, LOCKED_STAR_GLOW_ALPHA + 50) : LOCKED_STAR_GLOW_ALPHA;
        return [base[0], base[1], base[2], glowAlpha];
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
