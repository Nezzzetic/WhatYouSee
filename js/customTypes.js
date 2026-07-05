// customTypes.js — Custom constellation type creation, signature matching

// =============================================================================
// STATE
// =============================================================================

let customTypes = [];
let pendingTypeCreation = false; // kept for legacy compat

// =============================================================================
// GEOMETRIC SIGNATURE
// =============================================================================

function computeConstellationSignature(lines, starIds) {
    const starCount = starIds.size;
    const lineCount = lines.length;

    const degree = {};
    for (let id of starIds) degree[id] = 0;
    for (let seg of lines) {
        degree[seg.startId]++;
        degree[seg.endId]++;
    }
    const degreeSequence = Object.values(degree).sort((a, b) => a - b);

    const isClosed = degreeSequence.every(d => d === 2);
    const degreeOnceCount = degreeSequence.filter(d => d === 1).length;
    const degreeTwiceCount = degreeSequence.filter(d => d === 2).length;
    const isChain = degreeOnceCount === 2 && degreeTwiceCount === starCount - 2;

    let sortedAngles = [];
    let sortedEdgeRatios = [];

    if (isClosed && lineCount === starCount) {
        const ordered = getOrderedStarsForClosedShape(lines, starIds);
        const lengths = getEdgeLengthsClosed(ordered);
        const angles = getInternalAngles(ordered);
        sortedAngles = [...angles].sort((a, b) => a - b);

        const meanLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;
        if (meanLen > 0) {
            sortedEdgeRatios = lengths.map(l => l / meanLen).sort((a, b) => a - b);
        }
    } else if (isChain) {
        const ordered = getOrderedStarsForChain(lines, starIds);
        const chainAng = getChainAngles(ordered);
        sortedAngles = [...chainAng].sort((a, b) => a - b);

        const lengths = [];
        for (let i = 0; i < ordered.length - 1; i++) {
            const a = getStarById(ordered[i]);
            const b = getStarById(ordered[i + 1]);
            if (a && b) lengths.push(dist(a.x, a.y, b.x, b.y));
        }
        const meanLen = lengths.length > 0 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
        if (meanLen > 0) {
            sortedEdgeRatios = lengths.map(l => l / meanLen).sort((a, b) => a - b);
        }
    } else {
        const adj = {};
        for (let id of starIds) adj[id] = [];
        for (let seg of lines) {
            adj[seg.startId].push(seg.endId);
            adj[seg.endId].push(seg.startId);
        }

        const allAngles = [];
        for (let id of starIds) {
            const neighbors = adj[id];
            if (neighbors.length >= 2) {
                const curr = getStarById(id);
                for (let i = 0; i < neighbors.length; i++) {
                    for (let j = i + 1; j < neighbors.length; j++) {
                        const a = getStarById(neighbors[i]);
                        const b = getStarById(neighbors[j]);
                        if (a && curr && b) {
                            allAngles.push(angleBetweenPoints(a, curr, b));
                        }
                    }
                }
            }
        }
        sortedAngles = allAngles.sort((a, b) => a - b);

        const lengths = [];
        for (let seg of lines) {
            const a = getStarById(seg.startId);
            const b = getStarById(seg.endId);
            if (a && b) lengths.push(dist(a.x, a.y, b.x, b.y));
        }
        const meanLen = lengths.length > 0 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
        if (meanLen > 0) {
            sortedEdgeRatios = lengths.map(l => l / meanLen).sort((a, b) => a - b);
        }
    }

    return { starCount, lineCount, degreeSequence, sortedAngles, sortedEdgeRatios };
}

function buildPatternSnapshot(lines, starIds) {
    if (!starIds || starIds.size === 0) return null;

    const orderedIds = [...starIds].sort((a, b) => Number(a) - Number(b));
    const stars = orderedIds
        .map(id => ({ id, star: getStarById(id) }))
        .filter(item => !!item.star);

    if (stars.length < 2) return null;

    const xs = stars.map(item => item.star.x);
    const ys = stars.map(item => item.star.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);

    const idToIndex = new Map();
    const normalizedStars = stars.map((item, index) => {
        idToIndex.set(item.id, index);
        const nx = 0.1 + ((item.star.x - minX) / spanX) * 0.8;
        const ny = 0.1 + ((item.star.y - minY) / spanY) * 0.8;
        return [nx, ny];
    });

    const normalizedLines = [];
    for (const seg of lines || []) {
        const start = idToIndex.get(seg.startId);
        const end = idToIndex.get(seg.endId);
        if (start === undefined || end === undefined) continue;
        normalizedLines.push([start, end]);
    }

    if (normalizedLines.length === 0) return null;

    return {
        stars: normalizedStars,
        lines: normalizedLines
    };
}

// =============================================================================
// SIGNATURE MATCHING
// =============================================================================

function findMatchingCustomType(signature) {
    const result = findMatchingCustomTypeDetailed(signature);
    return result ? result.name : null;
}

function normalizeDistance(distance, scale) {
    if (scale <= 0) return 1;
    return Math.max(0, Math.min(1, distance / scale));
}

function scoreSignatureDistance(sigA, sigB) {
    if (!sigA || !sigB) return 0;

    const topologicalMatch = (
        sigA.starCount === sigB.starCount &&
        sigA.lineCount === sigB.lineCount &&
        sigA.degreeSequence.length === sigB.degreeSequence.length &&
        sigA.degreeSequence.every((value, idx) => value === sigB.degreeSequence[idx])
    );
    if (!topologicalMatch) return 0;

    const angleDistance = meanAbsDiff(sigA.sortedAngles || [], sigB.sortedAngles || []);
    const ratioDistance = meanAbsDiff(sigA.sortedEdgeRatios || [], sigB.sortedEdgeRatios || []);

    const angleScore = 1 - normalizeDistance(angleDistance, SIGNATURE_ANGLE_TOLERANCE);
    const ratioScore = 1 - normalizeDistance(ratioDistance, SIGNATURE_RATIO_TOLERANCE);

    return Math.max(0, Math.min(1, angleScore * 0.55 + ratioScore * 0.45));
}

function findMatchingCustomTypeDetailed(signature) {
    const scored = [];
    for (const ct of customTypes) {
        if (!ct.signature) continue;
        const score = scoreSignatureDistance(signature, ct.signature);
        scored.push({ name: ct.name, score });
    }
    scored.sort((a, b) => b.score - a.score);

    if (scored.length === 0) return null;
    const best = scored[0];
    const second = scored[1] || null;
    const margin = second ? (best.score - second.score) : best.score;
    const state = (best.score >= CUSTOM_MATCH_ACCEPT_THRESHOLD && margin >= CUSTOM_MATCH_MARGIN_THRESHOLD)
        ? 'accept'
        : 'reject';

    if (state !== 'accept') return null;
    return {
        name: best.name,
        score: best.score,
        margin,
        state,
        candidates: scored.slice(0, RECOG_MAX_CANDIDATES_TO_SHOW)
    };
}

function matchesSignature(sig1, sig2) {
    if (sig1.starCount !== sig2.starCount) return false;
    if (sig1.lineCount !== sig2.lineCount) return false;
    if (sig1.degreeSequence.length !== sig2.degreeSequence.length) return false;
    for (let i = 0; i < sig1.degreeSequence.length; i++) {
        if (sig1.degreeSequence[i] !== sig2.degreeSequence[i]) return false;
    }

    if (sig1.sortedAngles.length !== sig2.sortedAngles.length) return false;
    for (let i = 0; i < sig1.sortedAngles.length; i++) {
        if (Math.abs(sig1.sortedAngles[i] - sig2.sortedAngles[i]) > SIGNATURE_ANGLE_TOLERANCE) return false;
    }

    if (sig1.sortedEdgeRatios.length !== sig2.sortedEdgeRatios.length) return false;
    for (let i = 0; i < sig1.sortedEdgeRatios.length; i++) {
        if (Math.abs(sig1.sortedEdgeRatios[i] - sig2.sortedEdgeRatios[i]) > SIGNATURE_RATIO_TOLERANCE) return false;
    }

    return true;
}

// =============================================================================
// TYPE REGISTRATION
// =============================================================================

function registerCustomType(name, color, signature, patternSnapshot) {
    SHAPES[name] = { color: color, description: `Пользовательский вид: ${name}` };
    SHAPE_BASE_POINTS[name] = CUSTOM_TYPE_BASE_POINTS;
}


// =============================================================================
// COLOR GENERATION
// =============================================================================

function generateRandomTypeColor() {
    const h = Math.floor(Math.random() * 360);
    const s = 50 + Math.floor(Math.random() * 30);
    const b = 70 + Math.floor(Math.random() * 20);

    const sNorm = s / 100;
    const bNorm = b / 100;
    const c = bNorm * sNorm;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = bNorm - c;

    let r1, g1, b1;
    if (h < 60) { r1 = c; g1 = x; b1 = 0; }
    else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
    else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
    else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
    else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
    else { r1 = c; g1 = 0; b1 = x; }

    return [
        Math.round((r1 + m) * 255),
        Math.round((g1 + m) * 255),
        Math.round((b1 + m) * 255)
    ];
}
