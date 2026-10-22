// skyLife.js — V-36: живое небо. Четыре тихих эффекта поверх кадра поля:
// дышащая туманность, падающие звёзды, блики и вращение лучей.
//
// Только вид. Позиции звёзд, хит-тесты, сейв и random() неба (M-14) не
// трогаются: у туманности свой шум с фиксированным зерном, у событий — свой
// сеяный генератор (mulberry32 `makeSkySideRng`, skyRender.js). Всё зависит
// только от `millis()` и сида неба — `sky-pixels.js` повторяем.
//
// Выключатель один — `prefers-reduced-motion` (как у K-03): туманность встаёт
// неподвижным кадром, событий и вращения нет. Обсерватория не тронута:
// туманность там замирает на последнем виде, остальное не рисуется.

// =============================================================================
// ТУМАННОСТЬ
// =============================================================================

function nebulaHash2(i, j) {
    let h = Math.imul(i, 374761393) + Math.imul(j, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function nebulaValueNoise(x, y) {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = nebulaHash2(i, j), b = nebulaHash2(i + 1, j);
    const c = nebulaHash2(i, j + 1), d = nebulaHash2(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function nebulaFbm(x, y) {
    return nebulaValueNoise(x, y) * 0.6 + nebulaValueNoise(x * 2.03, y * 2.03) * 0.3
        + nebulaValueNoise(x * 4.1, y * 4.1) * 0.1;
}

/** Низкорезный холст туманности; на экран растягивается со сглаживанием. */
let nebulaBuffer = null;
let nebulaImage = null;
const nebulaState = {
    live: false,          // последний рендер — живой (а не неподвижный кадр)
    rendered: false,
    lastUpdateT: null,    // t прошлого вызова updateNebulaBuffer — для скачков
    frame: 0,
    renders: 0,
    params: { offX: 0, offY: 0, breath: 1, maxAlpha: NEBULA_ALPHA_STATIC }
};

/** Параметры кадра туманности в момент t. Неподвижный кадр — без дрейфа и дыхания. */
function computeNebulaParams(t, live) {
    if (!live) return { offX: 0, offY: 0, breath: 1, maxAlpha: NEBULA_ALPHA_STATIC };
    const breath = 1 + NEBULA_BREATH_AMP * Math.sin(t / NEBULA_BREATH_PERIOD_MS * Math.PI * 2);
    return {
        offX: t * NEBULA_DRIFT_X_PER_MS,
        offY: t * NEBULA_DRIFT_Y_PER_MS,
        breath,
        maxAlpha: (NEBULA_ALPHA_STATIC + NEBULA_ALPHA_LIVE_EXTRA) * breath
    };
}

function renderNebulaBuffer(t, live) {
    if (!nebulaBuffer || !nebulaImage) return;
    const p = computeNebulaParams(t, live);
    const d = nebulaImage.data, w = nebulaBuffer.width, h = nebulaBuffer.height;
    const k = NEBULA_NOISE_SCALE * NEBULA_BUFFER_STEP;
    const sx = p.offX, sy = p.offY;
    const scale = live ? NEBULA_ALPHA_SCALE : NEBULA_ALPHA_SCALE_STATIC;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let n = nebulaFbm(x * k + sx + NEBULA_NOISE_SEED, y * k + sy);
            // Второй слой с другим сдвигом — туманность перетекает, а не едет целиком.
            if (live) n = n * 0.75 + 0.25 * nebulaValueNoise(x * k * 1.7 - sx * 1.6, y * k * 1.7 + sy * 0.8 + 40);
            const a = n > 0.5 ? (n - 0.5) / 0.5 * p.maxAlpha : 0;
            const i = (y * w + x) * 4;
            d[i] = NEBULA_TINT_RGB[0]; d[i + 1] = NEBULA_TINT_RGB[1]; d[i + 2] = NEBULA_TINT_RGB[2];
            d[i + 3] = Math.min(255, a * scale);
        }
    }
    nebulaBuffer.getContext('2d').putImageData(nebulaImage, 0, 0);
    nebulaState.live = live;
    nebulaState.rendered = true;
    nebulaState.renders++;
}

/** Буфер под текущий размер канваса — тот же рисунок (зерно фиксированное). */
function generateNebulaBuffer() {
    const w = Math.max(1, Math.ceil(width / NEBULA_BUFFER_STEP));
    const h = Math.max(1, Math.ceil(height / NEBULA_BUFFER_STEP));
    if (!nebulaBuffer) nebulaBuffer = document.createElement('canvas');
    nebulaBuffer.width = w;
    nebulaBuffer.height = h;
    nebulaImage = nebulaBuffer.getContext('2d').createImageData(w, h);
    const live = isSkyLifeMotionAllowed();
    renderNebulaBuffer(live && nebulaState.lastUpdateT !== null ? nebulaState.lastUpdateT : 0, live);
}

/**
 * Раз за кадр из draw(). В обсерватории буфер не обновляется — замирает на
 * последнем виде. Под reduce — один неподвижный кадр. Иначе каждый
 * NEBULA_UPDATE_EVERY_FRAMES-й кадр, и сразу — после скачка времени.
 */
function updateNebulaBuffer(t, force) {
    if (typeof appMode !== 'undefined' && appMode !== 'field') return;
    const live = isSkyLifeMotionAllowed();
    if (!live) {
        nebulaState.params = computeNebulaParams(t, false);
        if (nebulaState.live || !nebulaState.rendered) renderNebulaBuffer(0, false);
        nebulaState.lastUpdateT = null;
        return;
    }
    const prev = nebulaState.lastUpdateT;
    const jump = prev === null || Math.abs(t - prev) > SKY_LIFE_JUMP_MS || !nebulaState.live;
    nebulaState.lastUpdateT = t;
    nebulaState.params = computeNebulaParams(t, true);
    if (force || jump) {
        nebulaState.frame = 1;
        renderNebulaBuffer(t, true);
        return;
    }
    if (nebulaState.frame++ % NEBULA_UPDATE_EVERY_FRAMES === 0) renderNebulaBuffer(t, true);
}

function drawNebulaBuffer() {
    if (!nebulaBuffer) return;
    const ctx = drawingContext;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(nebulaBuffer, 0, 0, width, height);
    ctx.restore();
}

// =============================================================================
// ВЫКЛЮЧАТЕЛИ
// =============================================================================

/** Шов автопроверок (verify-calm-twinkle «небо стоит»): гасит все четыре эффекта. */
let skyLifeSuspended = false;

function setSkyLifeSuspended(on) {
    skyLifeSuspended = !!on;
}

/** Движение вообще разрешено: нет reduce и шва. Проверка — раз за кадр/вызов. */
function isSkyLifeMotionAllowed() {
    if (skyLifeSuspended) return false;
    return !(typeof prefersReducedMotion === 'function' && prefersReducedMotion());
}

/**
 * Метеоры и блики гаснут там, где могут лечь на чужой текст или перетянуть
 * глаз: тутор, сцена финала V-13, раскрытое небо (картуш), обсерватория.
 */
function areSkyLifeEventsGated() {
    if (!isSkyLifeMotionAllowed()) return true;
    if (typeof appMode !== 'undefined' && appMode !== 'field') return true;
    if (typeof isTutorialActive === 'function' && isTutorialActive()) return true;
    if (typeof isLevelFinaleActive === 'function' && isLevelFinaleActive()) return true;
    if (typeof constellationArtRevealed !== 'undefined' && constellationArtRevealed) return true;
    return false;
}

// =============================================================================
// СОБЫТИЯ: МЕТЕОРЫ И БЛИКИ
// =============================================================================

const skyLifeEvents = {
    rng: null,
    lastT: null,
    running: false,       // расписание идёт (не погашено)
    nextMeteor: 0,
    nextGlint: 0,
    meteors: [],
    glints: []
};

function skyLifeRandRange(rng, lo, hi) {
    return lo + rng() * (hi - lo);
}

/** Зерно — сид неба, соль и момент старта: после скачка цепочка та же при том же t. */
function makeSkyLifeRng(t) {
    const sky = typeof getSkySeedString === 'function' && typeof getEffectiveSkyDateInt === 'function'
        ? getSkySeedString(getEffectiveSkyDateInt())
        : 'sky';
    return makeSkySideRng(hashStringToSeed(`${sky}|${SKY_LIFE_SEED_SALT}|${Math.floor(t)}`));
}

function isStarFreeForSkyLife(star) {
    if (!star || star.locked || star.suppressed || star.extinguished) return false;
    if (typeof isTutorialAllowedStar === 'function' && !isTutorialAllowedStar(star.id)) return false;
    return true;
}

function getSkyLifeStarDrawSize(star) {
    const base = Math.max(STAR_SIZE, STAR_SIZE / zoomLevel * 0.5);
    return base * (typeof star.sizeFactor === 'number' ? star.sizeFactor : 1);
}

function isStarOnScreen(star) {
    const sx = (star.x - camX) * zoomLevel, sy = (star.y - camY) * zoomLevel;
    return sx >= 0 && sx <= width && sy >= 0 && sy <= height;
}

function spawnSkyMeteor(t) {
    const rng = skyLifeEvents.rng;
    const side = rng() < 0.5 ? 1 : -1;
    const tilt = skyLifeRandRange(rng, SKY_METEOR_ANGLE_MIN, SKY_METEOR_ANGLE_MAX);
    const a = Math.PI / 2 + side * tilt;
    skyLifeEvents.meteors.push({
        x: rng() * width,
        y: rng() * height * 0.6,
        vx: Math.cos(a),
        vy: Math.sin(a),
        speed: skyLifeRandRange(rng, SKY_METEOR_SPEED_MIN, SKY_METEOR_SPEED_MAX),
        len: skyLifeRandRange(rng, SKY_METEOR_LEN_MIN, SKY_METEOR_LEN_MAX),
        t0: t,
        life: skyLifeRandRange(rng, SKY_METEOR_LIFE_MIN_MS, SKY_METEOR_LIFE_MAX_MS)
    });
}

function spawnSkyGlint(t) {
    const rng = skyLifeEvents.rng;
    const busy = new Set(skyLifeEvents.glints.map(g => g.starId));
    const pool = [];
    for (const s of fieldStars) {
        if (isStarFreeForSkyLife(s) && !busy.has(s.id) && isStarOnScreen(s)) pool.push(s);
    }
    const pick = rng();
    const dur = skyLifeRandRange(rng, SKY_GLINT_DUR_MIN_MS, SKY_GLINT_DUR_MAX_MS);
    const rot = (rng() * 2 - 1) * SKY_GLINT_ROT_MAX;
    if (!pool.length) return;
    skyLifeEvents.glints.push({ starId: pool[Math.floor(pick * pool.length)].id, t0: t, dur, rot });
}

/** Расписание с нуля от момента t: без залпа, пропущенное не догоняется. */
function restartSkyLifeSchedule(t) {
    const ev = skyLifeEvents;
    ev.rng = makeSkyLifeRng(t);
    ev.meteors = [];
    ev.glints = [];
    ev.nextMeteor = t + skyLifeRandRange(ev.rng, SKY_METEOR_INTERVAL_MIN_MS, SKY_METEOR_INTERVAL_MAX_MS);
    ev.nextGlint = t + skyLifeRandRange(ev.rng, SKY_GLINT_INTERVAL_MIN_MS, SKY_GLINT_INTERVAL_MAX_MS);
    ev.running = true;
}

/** Раз за кадр из draw(). */
function updateSkyLifeEvents(t) {
    const ev = skyLifeEvents;
    const jump = ev.lastT === null || Math.abs(t - ev.lastT) > SKY_LIFE_JUMP_MS;
    ev.lastT = t;
    if (areSkyLifeEventsGated()) {
        // Под reduce и в погашенных состояниях летящее обрывается, а не доигрывается.
        ev.meteors = [];
        ev.glints = [];
        ev.running = false;
        return;
    }
    if (jump || !ev.running) restartSkyLifeSchedule(t);
    ev.meteors = ev.meteors.filter(m => t - m.t0 < m.life);
    ev.glints = ev.glints.filter(g => t - g.t0 < g.dur && isStarFreeForSkyLife(getStarById(g.starId)));
    if (t >= ev.nextMeteor) {
        if (!ev.meteors.length) spawnSkyMeteor(t);
        ev.nextMeteor = t + skyLifeRandRange(ev.rng, SKY_METEOR_INTERVAL_MIN_MS, SKY_METEOR_INTERVAL_MAX_MS);
    }
    if (t >= ev.nextGlint) {
        spawnSkyGlint(t);
        ev.nextGlint = t + skyLifeRandRange(ev.rng, SKY_GLINT_INTERVAL_MIN_MS, SKY_GLINT_INTERVAL_MAX_MS);
    }
}

/** Всё живое небо одного кадра — из draw() до отрисовки. */
function updateSkyLife(t) {
    updateNebulaBuffer(t);
    updateSkyLifeEvents(t);
}

/** Метеоры — экранный слой сразу за туманностью, позади пыли и звёзд. */
function drawSkyMeteorsScreen() {
    const list = skyLifeEvents.meteors;
    if (!list.length) return;
    const t = millis();
    const ctx = drawingContext;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = SKY_METEOR_LINE_PX;
    for (const m of list) {
        const age = t - m.t0;
        const fade = Math.sin(Math.max(0, Math.min(1, age / m.life)) * Math.PI);
        if (fade <= 0) continue;
        const hx = m.x + m.vx * m.speed * age / 1000, hy = m.y + m.vy * m.speed * age / 1000;
        const tx = hx - m.vx * m.len, ty = hy - m.vy * m.len;
        const g = ctx.createLinearGradient(hx, hy, tx, ty);
        g.addColorStop(0, `rgba(235,240,255,${0.85 * fade})`);
        g.addColorStop(1, 'rgba(235,240,255,0)');
        ctx.strokeStyle = g;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.fillStyle = `rgba(255,255,255,${0.9 * fade})`;
        ctx.beginPath(); ctx.arc(hx, hy, 1.1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}

/** Огибающая блика: рост до SKY_GLINT_PEAK, затем спад. 0 вне [0, 1]. */
function getSkyGlintEnvelope(e) {
    if (e < 0 || e > 1) return 0;
    return e < SKY_GLINT_PEAK
        ? Math.sin(e / SKY_GLINT_PEAK * Math.PI / 2)
        : Math.cos((e - SKY_GLINT_PEAK) / (1 - SKY_GLINT_PEAK) * Math.PI / 2);
}

/** Блики — в мире, поверх звёзд (зовётся внутри трансформа камеры). */
function drawSkyGlintsWorld() {
    const list = skyLifeEvents.glints;
    if (!list.length) return;
    const t = millis();
    const ctx = drawingContext;
    for (const g of list) {
        const star = getStarById(g.starId);
        if (!star) continue;
        const e = (t - g.t0) / g.dur;
        const k = getSkyGlintEnvelope(e);
        if (k <= 0) continue;
        const size = getSkyLifeStarDrawSize(star);
        const L = size * SKY_GLINT_LEN_MULT * k, thin = size * 0.09;
        const c = getStarTierRgb(star);
        const mix = `${(c[0] + 255) / 2 | 0},${(c[1] + 255) / 2 | 0},${(c[2] + 255) / 2 | 0}`;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const halo = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, size * 2.6);
        halo.addColorStop(0, `rgba(255,255,255,${0.28 * k})`);
        halo.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(star.x, star.y, size * 2.6, 0, Math.PI * 2); ctx.fill();
        ctx.translate(star.x, star.y);
        ctx.rotate(g.rot * e);
        for (let i = 0; i < 2; i++) {
            const len = i ? L * SKY_GLINT_SHORT_MULT : L;
            const lg = ctx.createLinearGradient(-len, 0, len, 0);
            lg.addColorStop(0, 'rgba(255,255,255,0)');
            lg.addColorStop(0.5, `rgba(${mix},${0.75 * k})`);
            lg.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = lg;
            ctx.beginPath();
            ctx.moveTo(-len, 0);
            ctx.quadraticCurveTo(0, -thin, len, 0);
            ctx.quadraticCurveTo(0, thin, -len, 0);
            ctx.fill();
            ctx.rotate(Math.PI / 2);
        }
        ctx.restore();
    }
}

// =============================================================================
// ВРАЩЕНИЕ ЛУЧЕЙ
// =============================================================================

/** Параметры вращения — от места звезды (как дыхание K-03), не через random(). */
const starSpinParams = new WeakMap();

function getStarSpinParams(star) {
    let p = starSpinParams.get(star);
    if (!p) {
        p = {
            dir: starTwinkleNoise(star, 31.7) < 0.5 ? -1 : 1,
            speed: STAR_SPIN_SPEED_MIN + starTwinkleNoise(star, 47.3) * (STAR_SPIN_SPEED_MAX - STAR_SPIN_SPEED_MIN),
            angle0: starTwinkleNoise(star, 59.1) * Math.PI * 2,
            phase: starTwinkleNoise(star, 73.9) * Math.PI * 2
        };
        starSpinParams.set(star, p);
    }
    return p;
}

function getStarSpinLive(star, t) {
    const p = getStarSpinParams(star);
    return {
        angle: p.angle0 + p.dir * p.speed * t / 1000,
        longMult: 1 + STAR_SPIN_LONG_AMP * Math.sin(t / 1000 * STAR_SPIN_LONG_RATE + p.phase)
    };
}

/** Звезда вошла в созвездие — угол замирает там, где был: лепестки ещё видны
 *  до волны V-12 и не должны дёрнуться. Откат (K-04) снова отпускает.
 *  Звезда, которую в этой сессии свободной не видели (сейв, F5), замирает на
 *  своём базовом угле — не на угле случайного первого кадра: так кадр раскрытой
 *  ночи после перезагрузки детерминирован (sky-pixels.js). Ключ — сама звезда:
 *  новое поле и загрузка сейва дают новые объекты. */
const starSpinFrozen = new WeakMap();
const starSpinSeenFree = new WeakSet();

/**
 * Поворот лепестков в кадре: `{angle, longMult}` или null (рисовать прямо).
 * `motion` — результат isSkyLifeMotionAllowed() за кадр.
 */
function getStarPetalSpin(star, t, motion) {
    if (!motion || !star || star.suppressed || star.extinguished) return null;
    if (typeof isTutorialAllowedStar === 'function' && !isTutorialAllowedStar(star.id)) return null;
    if (star.locked) {
        let f = starSpinFrozen.get(star);
        if (!f) {
            f = starSpinSeenFree.has(star)
                ? getStarSpinLive(star, t)
                : { angle: getStarSpinParams(star).angle0, longMult: 1 };
            starSpinFrozen.set(star, f);
        }
        return f;
    }
    starSpinFrozen.delete(star);
    starSpinSeenFree.add(star);
    return getStarSpinLive(star, t);
}

// =============================================================================
// СРЕЗ ДЛЯ АВТОПРОВЕРОК (__test.skyLife)
// =============================================================================

function skyLifeState() {
    const t = millis();
    const motion = isSkyLifeMotionAllowed();
    const inField = typeof appMode === 'undefined' || appMode === 'field';
    return {
        nebula: Object.assign({}, nebulaState.params, { renders: nebulaState.renders, live: nebulaState.live }),
        meteors: skyLifeEvents.meteors.map(m => ({
            x: m.x, y: m.y, vx: m.vx, vy: m.vy, speed: m.speed, len: m.len,
            ageMs: t - m.t0, lifeMs: m.life, lineWidth: SKY_METEOR_LINE_PX
        })),
        glints: skyLifeEvents.glints.map(g => {
            const star = getStarById(g.starId);
            const size = star ? getSkyLifeStarDrawSize(star) : 0;
            return {
                starId: g.starId, ageMs: t - g.t0, durMs: g.dur, rot: g.rot,
                peakMs: g.dur * SKY_GLINT_PEAK, size,
                longLen: size * SKY_GLINT_LEN_MULT, shortLen: size * SKY_GLINT_LEN_MULT * SKY_GLINT_SHORT_MULT,
                composite: 'lighter'
            };
        }),
        /** Вращение свободной звезды; null — не вращается. */
        spin(starId) {
            const star = getStarById(starId);
            if (!motion || !inField || !isStarFreeForSkyLife(star)) return null;
            const p = getStarSpinParams(star);
            const live = getStarSpinLive(star, t);
            return { angle: live.angle, dir: p.dir, speed: p.speed, longMult: live.longMult };
        },
        /** Угол, которым лепестки рисуются сейчас (у вошедшей в созвездие — замерший). */
        drawAngle(starId) {
            const star = getStarById(starId);
            if (!motion || !inField || !star || star.suppressed || star.extinguished) return null;
            if (typeof isTutorialAllowedStar === 'function' && !isTutorialAllowedStar(star.id)) return null;
            const f = star.locked ? starSpinFrozen.get(star) : null;
            return (f || getStarSpinLive(star, t)).angle;
        }
    };
}
