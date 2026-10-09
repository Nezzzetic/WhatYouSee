// save.js — Save/load game state via localStorage

// L-01: v02 → v03. В сохранённом небе лежат `constellations[].shape/name`
// русскими именами — после перехода на ASCII-ID они не резолвятся ни в SHAPES,
// ни в атласе. Новый ключ означает чистое небо.
// R-04: чистка старого ключа `starsReborn_v02` при загрузке снята — после L-01
// прошло полтора месяца, а забытый ключ ни на что не влияет.
// S-05: небо больше не живёт этим ключом — у каждого неба свой слот (ниже).
// Ключ остался только источником миграции: `migrateLegacySkySave()` один раз
// перекладывает его в слот сегодняшнего дня и удаляет.
const LEGACY_SAVE_KEY = 'starsReborn_v03';

// =============================================================================
// SKY SLOTS (S-05)
// =============================================================================
//
// Слот — одно небо: `day:<dateInt>` (небо дня, сутки с 05:00) или
// `prologue:<n>`, n = 1…SKY_SLOT_PROLOGUE_MAX (уровни Пролога, пишет S-07).
// Один ключ localStorage на слот: запись дня не переписывает Пролог, битый
// JSON одного слота не ломает остальные. Содержимое — прежний формат сейва
// неба плюс поле `slot`; поля, которых saveGame() не знает (например,
// `nightFlags` S-07), не стираются — запись накладывается поверх лежащего.
// Версия сейва не поднималась: формат тот же, ключи новые.

const SKY_SLOT_KEY_PREFIX = 'starsReborn_sky_';
const SKY_SLOT_PROLOGUE_MAX = 7;

// Закрепление активного слота за уровнем Пролога. null — «небо дня»: активным
// считается `day:<сегодня>`, вычисляется на каждом обращении, поэтому граница
// суток переключать ничего не требует. Вне сейва — живёт до перезагрузки.
let pinnedSkySlotId = null;

/** @returns {{kind:'day', date:number}|{kind:'prologue', n:number}|null} */
function parseSkySlotId(id) {
    if (typeof id !== 'string') return null;
    let m = /^day:(\d{8})$/.exec(id);
    if (m) return { kind: 'day', date: Number(m[1]) };
    m = /^prologue:(\d+)$/.exec(id);
    if (m) {
        const n = Number(m[1]);
        if (String(n) === m[1] && n >= 1 && n <= SKY_SLOT_PROLOGUE_MAX) return { kind: 'prologue', n };
    }
    return null;
}

function skySlotStorageKey(parsed) {
    return SKY_SLOT_KEY_PREFIX + (parsed.kind === 'day' ? 'day_' + parsed.date : 'prologue_' + parsed.n);
}

function skySlotIdFromStorageKey(key) {
    if (typeof key !== 'string' || key.indexOf(SKY_SLOT_KEY_PREFIX) !== 0) return null;
    const m = /^(day|prologue)_(\d+)$/.exec(key.slice(SKY_SLOT_KEY_PREFIX.length));
    if (!m) return null;
    const id = m[1] + ':' + m[2];
    return parseSkySlotId(id) ? id : null;
}

/** Прошлый день не читается и не пишется (S-04, решение 1). */
function isSkySlotAccessible(parsed) {
    return !!parsed && (parsed.kind !== 'day' || parsed.date === getEffectiveSkyDateInt());
}

function getTodaySkySlotId() {
    return 'day:' + getEffectiveSkyDateInt();
}

function getActiveSkySlotId() {
    return pinnedSkySlotId || getTodaySkySlotId();
}

/**
 * S-07: `'prologue:<n>'` — закрепить активный слот за уровнем Пролога;
 * `null` — вернуться к небу дня (активный снова следует за датой).
 * `day:<сегодня>` принимается как то же, что null: закреплять фиксированную
 * дату незачем, после 05:00 она стала бы вчерашней.
 * @returns {boolean} принят ли вызов (иначе активный слот не изменился)
 */
function setActiveSkySlot(id) {
    if (id === null) {
        pinnedSkySlotId = null;
        return true;
    }
    const parsed = parseSkySlotId(id);
    if (!isSkySlotAccessible(parsed)) return false;
    pinnedSkySlotId = parsed.kind === 'prologue' ? id : null;
    return true;
}

/** @returns {object|false} содержимое слота целиком, false — нет, чужая дата или битый JSON. */
function loadSkySlot(id) {
    const parsed = parseSkySlotId(id);
    if (!isSkySlotAccessible(parsed)) return false;
    try {
        const raw = localStorage.getItem(skySlotStorageKey(parsed));
        if (!raw) return false;
        const state = JSON.parse(raw);
        return state && typeof state === 'object' ? state : false;
    } catch (e) {
        console.warn('Sky slot read failed:', id, e);
        return false;
    }
}

function hasSkySlot(id) {
    return loadSkySlot(id) !== false;
}

/**
 * Накладывает `fields` на уже лежащее в слоте: известные поля перезаписываются,
 * остальные остаются. Слот прошлого дня и не-слот — отказ без записи.
 * @returns {boolean} записано ли
 */
function saveSkySlot(id, fields) {
    const parsed = parseSkySlotId(id);
    if (!isSkySlotAccessible(parsed)) return false;
    try {
        const existing = loadSkySlot(id) || {};
        const state = Object.assign({}, existing, fields || {}, { slot: id });
        if (parsed.kind === 'day') state.skyDate = parsed.date;
        localStorage.setItem(skySlotStorageKey(parsed), JSON.stringify(state));
        return true;
    } catch (e) {
        console.warn('Save failed:', id, e);
        return false;
    }
}

function clearSkySlot(id) {
    const parsed = parseSkySlotId(id);
    if (!parsed) return false;
    try {
        localStorage.removeItem(skySlotStorageKey(parsed));
        return true;
    } catch (e) {
        console.warn('Sky slot clear failed:', id, e);
        return false;
    }
}

/** Все слоты, что лежат в localStorage, — и сегодняшние, и (если остались) чужих дат. */
function listSkySlotIds() {
    const ids = [];
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const id = skySlotIdFromStorageKey(localStorage.key(i));
            if (id) ids.push(id);
        }
    } catch (e) {
        return ids;
    }
    return ids.sort();
}

/** Смена суток: отпустить все `day:*`. Слоты Пролога не трогаются. */
function clearAllDaySkySlots() {
    for (const id of listSkySlotIds()) {
        if (id.indexOf('day:') === 0) clearSkySlot(id);
    }
}

/** Полный сброс: все слоты, старый ключ и закрепление. */
function clearAllSkySlots() {
    for (const id of listSkySlotIds()) clearSkySlot(id);
    try {
        localStorage.removeItem(LEGACY_SAVE_KEY);
    } catch (e) { /* ignore */ }
    pinnedSkySlotId = null;
}

/**
 * Один раз до первого loadGame(), идемпотентна. Старое небо ложится в слот
 * сегодняшнего дня; старый ключ удаляется только после того, как запись слота
 * прочитана обратно и совпала. Не вышло записать — ключ остаётся как был.
 */
function migrateLegacySkySave() {
    let raw;
    try {
        raw = localStorage.getItem(LEGACY_SAVE_KEY);
    } catch (e) {
        console.warn('Sky save migration skipped:', e);
        return;
    }
    if (raw === null) return;

    const removeLegacy = () => {
        try {
            localStorage.removeItem(LEGACY_SAVE_KEY);
        } catch (e) { /* ignore */ }
    };

    let state;
    try {
        state = JSON.parse(raw);
    } catch (e) {
        console.warn('Sky save migration: old save is not JSON, dropped:', e);
        removeLegacy();
        return;
    }
    if (!state || typeof state !== 'object' || isSavedSkyDateStale(state.skyDate)) {
        // Небо чужой даты текущий код тоже выбрасывал.
        removeLegacy();
        return;
    }

    const todayId = getTodaySkySlotId();
    const key = skySlotStorageKey(parseSkySlotId(todayId));
    try {
        if (localStorage.getItem(key) === null) {
            const value = JSON.stringify(Object.assign({}, state, { slot: todayId }));
            localStorage.setItem(key, value);
            if (localStorage.getItem(key) !== value) {
                console.warn('Sky save migration: slot read-back mismatch, old save kept');
                return;
            }
        }
        // Слот уже есть (или только что записан и сверен) — слот главнее.
        removeLegacy();
    } catch (e) {
        console.warn('Sky save migration failed, old save kept:', e);
    }
}

// =============================================================================
// SAVE
// =============================================================================

/**
 * Небо на экране → слот. Без аргумента — активный слот (так зовут все прежние
 * вызовы); `slotId` нужен смене суток, которая пишет именно небо дня.
 * Поля, которых здесь нет, в слоте сохраняются (S-05).
 */
function saveGame(slotId) {
    try {
        // R-03: totalScore, bestScore, uniqueShapesFound, bonusAwardedClasses
        // и customTypes из сейва неба сняты вместе со старым счётом. Версия не
        // поднимается: сейв прошлой версии с этими полями читается как раньше,
        // поля просто игнорируются и умирают со сменой суток.
        const state = {
            constellations,
            fieldStars,
            fieldBackgroundStars,
            constellationArtRevealed,
            // S-05: `skyDate` у слота дня проставляет saveSkySlot — по дате слота.
            // R-04: `dailyTargetShapes` снят вместе с якорями M-03. Сейв тех же
            // суток с этим полем читается как раньше — поле просто игнорируется.
            // M-10: память имён отменённых созвездий. Поле необязательное —
            // версия сейва из-за него не поднимается: сохранение без него
            // читается как ночь, в которой ещё ничего не отменяли.
            undoneConstellationNames: typeof dumpUndoneNameMemory === 'function'
                ? dumpUndoneNameMemory()
                : [],
            // S-07: ночные флаги достижений — свойство поля, едут с небом.
            nightFlags: typeof getPerNightAchievementFlags === 'function'
                ? getPerNightAchievementFlags()
                : undefined
            // M-05: `levelCompletePointsAwarded` убран вместе с выплатой за ночь.
            // «Ночь уже оплачена» теперь живёт в блоке суток достижений и привязано
            // к дате, а не к сессии поля: дев-сброс неба больше не позволяет
            // забрать награду за те же сутки второй раз.
        };
        saveSkySlot(typeof slotId === 'string' ? slotId : getActiveSkySlotId(), state);
    } catch (e) {
        console.warn('Save failed:', e);
    }
}

function autoSave() {
    saveGame();
}

// =============================================================================
// LOAD
// =============================================================================

function isSavedSkyDateStale(savedSkyDate) {
    if (typeof savedSkyDate !== 'number') return true;
    return savedSkyDate !== getEffectiveSkyDateInt();
}

function loadGame() {
    try {
        const slotId = getActiveSkySlotId();
        const state = loadSkySlot(slotId);
        if (!state) return false;

        // S-05: у неба дня `skyDate` — страховка «свежести» поверх имени слота.
        if (slotId.indexOf('day:') === 0 && isSavedSkyDateStale(state.skyDate)) {
            return false;
        }

        constellations = state.constellations || [];
        fieldStars = state.fieldStars || [];
        fieldBackgroundStars = (state.fieldBackgroundStars || []).map(s =>
            s.phase !== undefined ? s : { ...s, phase: Math.random() * Math.PI * 2 }
        );
        constellationArtRevealed =
            state.constellationArtRevealed !== undefined ? !!state.constellationArtRevealed : true;

        // M-10: память имён отменённых созвездий переживает F5 — сейв тех же
        // суток, значит и поле, и id звёзд те же, и ключи всё ещё указывают
        // на настоящие связки.
        if (typeof restoreUndoneNameMemory === 'function') {
            restoreUndoneNameMemory(state.undoneConstellationNames);
        }

        // S-07: ночные флаги из слота. Поля нет — флаги не трогаются: на
        // запуске остаются поднятые прогрессией, при выборе неба — пустые
        // (resetFieldSessionState уже сбросил их до загрузки).
        if (state.nightFlags && typeof applyPerNightAchievementFlags === 'function') {
            applyPerNightAchievementFlags(state.nightFlags);
        }

        rebuildStarCountStateFromConstellations();

        for (const star of fieldStars) {
            if (!star) continue;
            if (typeof star.extinguished !== 'boolean') star.extinguished = false;
            // O-12: признак контура аддитивный — слот без поля читается как false
            // (`!!star.contour`); ключ не дописывается, чтобы слоты других небес
            // не менялись ни байтом.
            if ('contour' in star && typeof star.contour !== 'boolean') star.contour = !!star.contour;
            if (typeof star.sizeFactor !== 'number') star.sizeFactor = 1;
            if (typeof star.colorValue !== 'number' || !Number.isFinite(star.colorValue)) {
                star.colorValue = pickRandomStarColorValue();
            }
            // Совместимость со старыми сохранениями: назначить случайный appearDelay
            if (typeof star.appearDelay !== 'number') {
                star.appearDelay = Math.random() * STAR_APPEAR_DELAY_MAX;
            }
            // K-03: то же для дыхания. Параметры считаются от места звезды,
            // так что старое небо задышит ровно так же, как если бы его
            // сгенерировали сегодня. Версия сейва не поднимается.
            if (typeof star.twinklePeriodMs !== 'number') {
                assignStarTwinkleTo(star);
            }
        }

        normalizeAtlasCollectedOnField();

        for (const c of constellations) {
            if (constellationArtRevealed && Array.isArray(c.lines) && c.lines.length > 0) {
                const fallbackStarIds = new Set();
                for (const seg of c.lines) {
                    if (!seg) continue;
                    fallbackStarIds.add(seg.startId);
                    fallbackStarIds.add(seg.endId);
                }
                c.labelAnchor = computeConstellationLabelAnchor(c.lines, fallbackStarIds, c.name || c.shape);
            }
            // V-03: lineColor не сохраняется — пересчитываем при загрузке.
            // V-28: colorValue (среднее звёзд) — тем же способом.
            if (Array.isArray(c.lines) && c.lines.length > 0) {
                const ids = collectStarIdsFromLines(c.lines);
                const colorValue = getMeanColorValue([...ids]);
                c.lineColor = colorValueToConstellationLineRgb(colorValue);
                c.colorValue = colorValue;
            }
        }

        // V-29: старый сейв раскрытой ночи (до задачи) не несёт revealedLabelAnchor —
        // раскладываем недостающие один раз здесь (p5 уже умеет мерить текст —
        // грузимся из setup(), после createCanvas) и сразу сохраняем; дальше
        // ночь живёт как обычная раскрытая, без повторного пересчёта.
        // V-32: то же, если хоть один якорь лежит вне прямоугольника раскладки —
        // ночь раскрыта до картуша, и подпись могла встать в его полосу.
        if (constellationArtRevealed && constellations.some(c =>
            Array.isArray(c.lines) && c.lines.length > 0
            && (!c.revealedLabelAnchor || !isRevealedLabelAnchorInLayoutRect(c.revealedLabelAnchor)))) {
            if (typeof layoutAndStoreRevealedLabels === 'function') layoutAndStoreRevealedLabels();
            saveGame();
        }

        recomputeAtlasCollectedStarColors();
        recomputeSuppressedStars();
        // O-11: загруженное поле — свой состав соединимых звёзд, старый кеш не годится.
        if (typeof invalidateConnectableStarIdsCache === 'function') invalidateConnectableStarIdsCache();

        // V-13: без сцены финала — она принадлежит моменту завершения ночи,
        // а не её состоянию, и после перезагрузки играться не должна.
        tryRevealConstellationArtIfComplete(false);

        return true;
    } catch (e) {
        console.warn('Load failed:', e);
        return false;
    }
}

// =============================================================================
// UTILITIES
// =============================================================================

function hasSavedGame() {
    const slotId = getActiveSkySlotId();
    const state = loadSkySlot(slotId);
    if (!state) return false;
    return slotId.indexOf('day:') !== 0 || !isSavedSkyDateStale(state.skyDate);
}

/** Очистка активного слота (`onResetSky`, dev «Сбросить небо»). */
function clearSave() {
    clearSkySlot(getActiveSkySlotId());
}
