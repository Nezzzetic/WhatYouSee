// recognition.js — Shape recognition (geometric + topological)

// =============================================================================
// GEOMETRIC HELPERS
// =============================================================================

function angleBetweenPoints(a, b, c) {
    const abx = a.x - b.x;
    const aby = a.y - b.y;
    const cbx = c.x - b.x;
    const cby = c.y - b.y;
    const dot = abx * cbx + aby * cby;
    const cross = abx * cby - aby * cbx;
    let angle = Math.atan2(Math.abs(cross), dot);
    return degrees(angle);
}

function isCollinear(starArray) {
    if (starArray.length < 3) return true;
    const [a, b, c] = starArray;
    const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y));
    const baseLength = dist(a.x, a.y, c.x, c.y);
    if (baseLength === 0) return true;
    const height = area / baseLength;
    return height < COLLINEAR_HEIGHT;
}

function sideRatioOk(lengths, threshold) {
    if (lengths.length === 0) return false;
    const maxLen = Math.max(...lengths);
    const minLen = Math.min(...lengths);
    if (minLen === 0) return false;
    return (maxLen / minLen) <= threshold;
}

// =============================================================================
// GRAPH TRAVERSAL
// =============================================================================

function getOrderedStarsForClosedShape(lines, starIds) {
    const adj = {};
    for (let id of starIds) adj[id] = [];
    for (let seg of lines) {
        adj[seg.startId].push(seg.endId);
        adj[seg.endId].push(seg.startId);
    }

    const ordered = [];
    const startId = [...starIds][0];
    ordered.push(startId);
    let prev = null;
    let current = startId;

    for (let i = 1; i < starIds.size; i++) {
        const neighbors = adj[current];
        let next = null;
        for (let n of neighbors) {
            if (n !== prev) {
                next = n;
                break;
            }
        }
        prev = current;
        current = next;
        ordered.push(current);
    }

    return ordered;
}

function getOrderedStarsForChain(lines, starIds) {
    const adj = {};
    for (let id of starIds) adj[id] = [];
    for (let seg of lines) {
        adj[seg.startId].push(seg.endId);
        adj[seg.endId].push(seg.startId);
    }

    // Find chain endpoint (degree 1)
    let startId = null;
    for (let id of starIds) {
        if (adj[id].length === 1) {
            startId = id;
            break;
        }
    }
    if (startId === null) startId = [...starIds][0];

    const ordered = [startId];
    let prev = null;
    let current = startId;

    for (let i = 1; i < starIds.size; i++) {
        const neighbors = adj[current];
        let next = null;
        for (let n of neighbors) {
            if (n !== prev) {
                next = n;
                break;
            }
        }
        prev = current;
        current = next;
        ordered.push(current);
    }

    return ordered;
}

// =============================================================================
// EDGE / ANGLE ANALYSIS
// =============================================================================

function getEdgeLengthsClosed(orderedStarIds) {
    const lengths = [];
    const n = orderedStarIds.length;
    for (let i = 0; i < n; i++) {
        const a = getStarById(orderedStarIds[i]);
        const b = getStarById(orderedStarIds[(i + 1) % n]);
        if (a && b) {
            lengths.push(dist(a.x, a.y, b.x, b.y));
        }
    }
    return lengths;
}

function getChainSegmentLengths(orderedStarIds) {
    const lengths = [];
    for (let i = 0; i < orderedStarIds.length - 1; i++) {
        const a = getStarById(orderedStarIds[i]);
        const b = getStarById(orderedStarIds[i + 1]);
        if (a && b) {
            lengths.push(dist(a.x, a.y, b.x, b.y));
        }
    }
    return lengths;
}

function getInternalAngles(orderedStarIds) {
    const n = orderedStarIds.length;
    const angles = [];
    for (let i = 0; i < n; i++) {
        const prev = getStarById(orderedStarIds[(i - 1 + n) % n]);
        const curr = getStarById(orderedStarIds[i]);
        const next = getStarById(orderedStarIds[(i + 1) % n]);
        if (prev && curr && next) {
            angles.push(angleBetweenPoints(prev, curr, next));
        }
    }
    return angles;
}

function getChainAngles(orderedStarIds) {
    const angles = [];
    for (let i = 1; i < orderedStarIds.length - 1; i++) {
        const prev = getStarById(orderedStarIds[i - 1]);
        const curr = getStarById(orderedStarIds[i]);
        const next = getStarById(orderedStarIds[i + 1]);
        if (prev && curr && next) {
            angles.push(angleBetweenPoints(prev, curr, next));
        }
    }
    return angles;
}

// =============================================================================
// ARC DETECTION
// =============================================================================

function isConsistentArc(orderedStarIds) {
    if (orderedStarIds.length < 3) return false;

    let positiveCount = 0;
    let negativeCount = 0;

    for (let i = 1; i < orderedStarIds.length - 1; i++) {
        const prev = getStarById(orderedStarIds[i - 1]);
        const curr = getStarById(orderedStarIds[i]);
        const next = getStarById(orderedStarIds[i + 1]);
        if (!prev || !curr || !next) return false;

        const cross = (curr.x - prev.x) * (next.y - curr.y) -
                      (curr.y - prev.y) * (next.x - curr.x);

        if (cross > 0) positiveCount++;
        else if (cross < 0) negativeCount++;
    }

    return positiveCount === 0 || negativeCount === 0;
}

// =============================================================================
// ALTERNATING TURN DETECTION (W/M shapes)
// =============================================================================

function isAlternatingTurns(orderedStarIds) {
    if (orderedStarIds.length < 4) return false;

    const signs = [];
    for (let i = 1; i < orderedStarIds.length - 1; i++) {
        const prev = getStarById(orderedStarIds[i - 1]);
        const curr = getStarById(orderedStarIds[i]);
        const next = getStarById(orderedStarIds[i + 1]);
        if (!prev || !curr || !next) return false;

        const cross = (curr.x - prev.x) * (next.y - curr.y) -
                      (curr.y - prev.y) * (next.x - curr.x);
        signs.push(Math.sign(cross));
    }

    for (let i = 0; i < signs.length - 1; i++) {
        if (signs[i] === signs[i + 1] || signs[i] === 0) return false;
    }
    return true;
}

function mustacheFiveStarGeometryOk(lines, starIds) {
    if (starIds.size !== 5 || lines.length !== 4) return false;
    const degree = {};
    for (let id of starIds) degree[id] = 0;
    for (let seg of lines) {
        degree[seg.startId]++;
        degree[seg.endId]++;
    }
    const degrees = Object.values(degree);
    const degreeOnceCount = degrees.filter(d => d === 1).length;
    const degreeTwiceCount = degrees.filter(d => d === 2).length;
    if (degreeOnceCount !== 2 || degreeTwiceCount !== 3) return false;
    const ordered = getOrderedStarsForChain(lines, starIds);
    if (!ordered || ordered.length !== 5) return false;
    const chainAng = getChainAngles(ordered);
    return isAlternatingTurns(ordered) && mustacheChainGeometryOk(ordered, chainAng);
}

function mustacheChainGeometryOk(orderedStarIds, chainAng) {
    if (!orderedStarIds || orderedStarIds.length !== 5 || !chainAng || chainAng.length !== 3) return false;
    const orderedStars = orderedStarIds.map(id => getStarById(id)).filter(Boolean);
    if (orderedStars.length !== 5) return false;
    const xs = orderedStars.map(s => s.x);
    const ys = orderedStars.map(s => s.y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    const flatMax = typeof MUSTACHE_FLAT_MAX_SPAN_Y_OVER_X === 'number' ? MUSTACHE_FLAT_MAX_SPAN_Y_OVER_X : 0.58;
    if (spanX < 1e-6 || spanY / spanX > flatMax) return false;

    const a0 = chainAng[0];
    const a1 = chainAng[1];
    const a2 = chainAng[2];

    const obtMin = typeof MUSTACHE_OBTUSE_MIN === 'number' ? MUSTACHE_OBTUSE_MIN : 108;
    const obtMax = typeof MUSTACHE_OBTUSE_MAX === 'number' ? MUSTACHE_OBTUSE_MAX : 178;
    const obtSym = typeof MUSTACHE_OBTUSE_SIDE_SYMMETRY_MAX === 'number' ? MUSTACHE_OBTUSE_SIDE_SYMMETRY_MAX : 48;
    const obtMidSlack = typeof MUSTACHE_OBTUSE_MIDDLE_MAX_BELOW_SIDES === 'number' ? MUSTACHE_OBTUSE_MIDDLE_MAX_BELOW_SIDES : 22;

    const allObtuse = a0 >= obtMin && a0 <= obtMax && a1 >= obtMin && a1 <= obtMax && a2 >= obtMin && a2 <= obtMax;
    if (allObtuse) {
        if (Math.abs(a0 - a2) > obtSym) return false;
        const sideMin = Math.min(a0, a2);
        if (a1 < sideMin - obtMidSlack) return false;
        return true;
    }

    if (a0 < MUSTACHE_PEAK_ANGLE_MIN || a0 > MUSTACHE_PEAK_ANGLE_MAX) return false;
    if (a2 < MUSTACHE_PEAK_ANGLE_MIN || a2 > MUSTACHE_PEAK_ANGLE_MAX) return false;
    if (a1 < MUSTACHE_VALLEY_ANGLE_MIN || a1 > MUSTACHE_VALLEY_ANGLE_MAX) return false;
    if (a1 <= a0 + MUSTACHE_VALLEY_OVER_PEAK_MIN || a1 <= a2 + MUSTACHE_VALLEY_OVER_PEAK_MIN) return false;
    if (Math.abs(a0 - a2) > MUSTACHE_PEAK_SYMMETRY_MAX) return false;
    return true;
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

function anglesCloseToTarget(angles, targetDeg, toleranceDeg) {
    return angles.every(a => Math.abs(a - targetDeg) <= toleranceDeg);
}

function isSquareLikeQuad(angles, spanX, spanY) {
    if (!angles || angles.length !== 4) return false;
    const angleTol = typeof SQUARE_ANGLE_TOLERANCE === 'number' ? SQUARE_ANGLE_TOLERANCE : 6;
    const maxAspect = typeof SQUARE_MAX_MAJOR_OVER_MINOR === 'number' ? SQUARE_MAX_MAJOR_OVER_MINOR : 1.10;
    if (!anglesCloseToTarget(angles, 90, angleTol)) return false;
    const minSpan = Math.max(1, Math.min(spanX, spanY));
    return Math.max(spanX, spanY) / minSpan <= maxAspect;
}

function chainAnglesOk(angles, minAngle) {
    return angles.every(a => a >= minAngle);
}

function isClosedTriangleThreeStars(lines, starIds) {
    if (starIds.size !== 3 || lines.length !== 3) return false;
    const degree = {};
    for (let id of starIds) degree[id] = 0;
    for (let seg of lines) {
        degree[seg.startId]++;
        degree[seg.endId]++;
    }
    return Object.values(degree).every(d => d === 2);
}

function pizzaSliceMetricsPass(lengths, angles) {
    if (!angles || angles.length !== 3) return false;
    const minAngle = Math.min(...angles);
    return minAngle > PIZZA_SLICE_MIN_MIN_ANGLE;
}

function pizzaSliceTriangleGeometryOk(lines, starIds) {
    if (!isClosedTriangleThreeStars(lines, starIds)) return false;
    const ordered = getOrderedStarsForClosedShape(lines, starIds);
    const lengths = getEdgeLengthsClosed(ordered);
    const angles = getInternalAngles(ordered);
    return pizzaSliceMetricsPass(lengths, angles);
}

function kiteQuadMetricsFromOrdered(ordered) {
    const lengths = getEdgeLengthsClosed(ordered);
    const sideThreshold = typeof KITE_SIDE_RATIO_THRESHOLD === 'number'
        ? KITE_SIDE_RATIO_THRESHOLD
        : 3.5;
    if (!sideRatioOk(lengths, sideThreshold)) return false;
    const angles = getInternalAngles(ordered);
    const orderedStars = ordered.map(id => getStarById(id)).filter(Boolean);
    if (orderedStars.length !== 4) return false;
    const xs = orderedStars.map(s => s.x);
    const ys = orderedStars.map(s => s.y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    if (isSquareLikeQuad(angles, spanX, spanY)) return false;
    const minSpan = Math.max(1, Math.min(spanX, spanY));
    const majorOverMinor = Math.max(spanX, spanY) / minSpan;
    const minAspect = typeof KITE_MIN_SPAN_MAJOR_OVER_MINOR === 'number'
        ? KITE_MIN_SPAN_MAJOR_OVER_MINOR
        : 1.05;
    return majorOverMinor >= minAspect;
}

function kiteQuadGeometryOk(lines, starIds) {
    if (starIds.size !== 4 || lines.length !== 4) return false;
    const degree = {};
    for (let id of starIds) degree[id] = 0;
    for (let seg of lines) {
        degree[seg.startId]++;
        degree[seg.endId]++;
    }
    if (!Object.values(degree).every(d => d === 2)) return false;
    const ordered = getOrderedStarsForClosedShape(lines, starIds);
    return kiteQuadMetricsFromOrdered(ordered);
}

function trusyChainMetricsPass(chainAng, segmentLengths) {
    if (!chainAng || chainAng.length !== 2) return false;
    if (!segmentLengths || segmentLengths.length !== 3) return false;
    const lo = TRUSY_CHAIN_ANGLE_CENTER - TRUSY_CHAIN_ANGLE_TOLERANCE;
    const hi = TRUSY_CHAIN_ANGLE_CENTER + TRUSY_CHAIN_ANGLE_TOLERANCE;
    if (!chainAng.every(a => a >= lo && a <= hi)) return false;
    const lenRatio = Math.max(...segmentLengths) / Math.max(1e-6, Math.min(...segmentLengths));
    return lenRatio <= TRUSY_MAX_EDGE_LEN_RATIO;
}

function caterpillarChainGeometryOk(lines, starIds) {
    if (starIds.size !== 3 || lines.length !== 2) return false;
    const degree = {};
    for (let id of starIds) degree[id] = 0;
    for (let seg of lines) {
        degree[seg.startId]++;
        degree[seg.endId]++;
    }
    const degrees = Object.values(degree);
    if (degrees.filter(d => d === 1).length !== 2) return false;
    if (degrees.filter(d => d === 2).length !== 1) return false;

    const ordered = getOrderedStarsForChain(lines, starIds);
    const endA = getStarById(ordered[0]);
    const mid = getStarById(ordered[1]);
    const endB = getStarById(ordered[2]);
    if (!endA || !mid || !endB) return false;

    const lenA = dist(endA.x, endA.y, mid.x, mid.y);
    const lenB = dist(mid.x, mid.y, endB.x, endB.y);
    if (!sideRatioOk([lenA, lenB], SIDE_RATIO_THRESHOLD)) return false;

    const angle = angleBetweenPoints(endA, mid, endB);
    const minAngle = typeof CATERPILLAR_MIN_CHAIN_ANGLE === 'number'
        ? CATERPILLAR_MIN_CHAIN_ANGLE
        : 90 + ANGLE_TOLERANCE;
    return angle > minAngle;
}

function bananaChainMetricsPass(chainAng) {
    if (!chainAng || chainAng.length !== 2) return false;
    const lo = SHAPE_BANANA_INTERIOR_MIN_DEG;
    const hi = SHAPE_BANANA_INTERIOR_MAX_DEG;
    return chainAng.every(a => a >= lo && a <= hi);
}

function bananaChainGeometryOk(lines, starIds) {
    if (starIds.size !== 4 || lines.length !== 3) return false;
    const degree = {};
    for (let id of starIds) degree[id] = 0;
    for (let seg of lines) {
        degree[seg.startId]++;
        degree[seg.endId]++;
    }
    const degrees = Object.values(degree);
    const degreeOnceCount = degrees.filter(d => d === 1).length;
    const degreeTwiceCount = degrees.filter(d => d === 2).length;
    if (degreeOnceCount !== 2 || degreeTwiceCount !== 2) return false;

    const ordered = getOrderedStarsForChain(lines, starIds);
    if (!isConsistentArc(ordered)) return false;
    const chainAng = getChainAngles(ordered);
    return bananaChainMetricsPass(chainAng);
}

function trusyChainGeometryOk(lines, starIds) {
    if (starIds.size !== 4 || lines.length !== 3) return false;
    const degree = {};
    for (let id of starIds) degree[id] = 0;
    for (let seg of lines) {
        degree[seg.startId]++;
        degree[seg.endId]++;
    }
    const degrees = Object.values(degree);
    const degreeOnceCount = degrees.filter(d => d === 1).length;
    const degreeTwiceCount = degrees.filter(d => d === 2).length;
    if (degreeOnceCount !== 2 || degreeTwiceCount !== 2) return false;

    const ordered = getOrderedStarsForChain(lines, starIds);
    if (!isConsistentArc(ordered)) return false;
    const chainAng = getChainAngles(ordered);
    const segLens = getChainSegmentLengths(ordered);
    if (!trusyChainMetricsPass(chainAng, segLens)) return false;

    const orderedStars = ordered.map(id => getStarById(id)).filter(Boolean);
    if (orderedStars.length !== ordered.length) return false;
    const xs = orderedStars.map(s => s.x);
    const ys = orderedStars.map(s => s.y);
    const spanX = Math.max(...xs) - Math.min(...xs);
    const spanY = Math.max(...ys) - Math.min(...ys);
    const chainAspect = spanX / Math.max(1, spanY);
    return chainAspect >= TRUSY_MIN_CHAIN_ASPECT;
}

// =============================================================================
// MAIN RECOGNITION FUNCTION
// =============================================================================

function recognizeShapeLegacy(lines, starIds) {
    const starCount = starIds.size;
    const lineCount = lines.length;

    if (starCount < 3 || starCount > 5) return 'Фигура';

    // Build graph: degree of each vertex
    const degree = {};
    for (let id of starIds) degree[id] = 0;
    for (let seg of lines) {
        degree[seg.startId]++;
        degree[seg.endId]++;
    }

    const degrees = Object.values(degree);
    const maxDegree = Math.max(...degrees);
    const isClosed = degrees.every(d => d === 2);
    const degreeOnceCount = degrees.filter(d => d === 1).length;
    const degreeTwiceCount = degrees.filter(d => d === 2).length;
    const isChain = degreeOnceCount === 2 && degreeTwiceCount === starCount - 2;
    const hasCenter = degrees.some(d => d >= 3);
    const centerDegree = maxDegree;

    // === 3 stars ===
    if (starCount === 3) {
        if (lineCount === 3 && isClosed) {
            const ordered = getOrderedStarsForClosedShape(lines, starIds);
            const lengths = getEdgeLengthsClosed(ordered);
            const angles = getInternalAngles(ordered);
            const minAngle = Math.min(...angles);
            const maxAngle = Math.max(...angles);
            const lenRatio = Math.max(...lengths) / Math.max(1, Math.min(...lengths));

            // Check specific silhouettes before generic triangle.
            // Pizza slice: any closed triangle; reject needles (min interior angle <= 15°).
            if (pizzaSliceMetricsPass(lengths, angles)) {
                return 'Кусок пиццы';
            }

            // Elongated sharp triangle silhouette is interpreted as a mouse cursor.
            if (minAngle <= 40 && maxAngle >= 80) {
                return 'Курсор мыши';
            }
            if (sideRatioOk(lengths, SIDE_RATIO_THRESHOLD)) {
                return 'Треугольник';
            }
            return 'Фигура';
        }
        if (lineCount === 2 && isChain) {
            const ordered = getOrderedStarsForChain(lines, starIds);
            const endA = getStarById(ordered[0]);
            const mid  = getStarById(ordered[1]);
            const endB = getStarById(ordered[2]);

            if (endA && mid && endB) {
                const lenA = dist(endA.x, endA.y, mid.x, mid.y);
                const lenB = dist(mid.x, mid.y, endB.x, endB.y);
                const sidesOk = sideRatioOk([lenA, lenB], SIDE_RATIO_THRESHOLD);
                const lenRatio = Math.max(lenA, lenB) / Math.max(1, Math.min(lenA, lenB));
                const angle = angleBetweenPoints(endA, mid, endB);

                if (angle >= 35 && angle <= 80 && lenRatio >= 1.15 && lenRatio <= 2.8) {
                    return 'Мороженное';
                }

                if (caterpillarChainGeometryOk(lines, starIds)) {
                    return 'Гусеница';
                }

                if (sidesOk && Math.abs(angle - 90) <= ANGLE_TOLERANCE) {
                    return 'Победа';
                }
            }
        }
        return 'Фигура';
    }

    // === 4 stars ===
    if (starCount === 4) {
        if (lineCount === 4 && isClosed) {
            const ordered = getOrderedStarsForClosedShape(lines, starIds);
            const lengths = getEdgeLengthsClosed(ordered);
            const angles = getInternalAngles(ordered);
            const sidesOk = sideRatioOk(lengths, SIDE_RATIO_THRESHOLD);
            const anglesOk = anglesCloseToTarget(angles, 90, ANGLE_TOLERANCE);
            const minAngle = Math.min(...angles);
            const maxAngle = Math.max(...angles);
            const maxLen = Math.max(...lengths);
            const minLen = Math.min(...lengths);
            const orderedStars = ordered.map(id => getStarById(id)).filter(Boolean);
            let spanX = 0;
            let spanY = 0;
            if (orderedStars.length === ordered.length) {
                const xs = orderedStars.map(s => s.x);
                const ys = orderedStars.map(s => s.y);
                spanX = Math.max(...xs) - Math.min(...xs);
                spanY = Math.max(...ys) - Math.min(...ys);
            }
            const squarish = isSquareLikeQuad(angles, spanX, spanY);

            if (!sidesOk && minAngle <= 65 && maxAngle >= 120 && (maxLen / Math.max(1, minLen)) >= 1.45) {
                return 'Утюг';
            }

            if (sidesOk && squarish && (spanX / Math.max(1, spanY)) >= 1.45) {
                return 'Очки';
            }

            if (sidesOk && squarish) return 'Квадрат';
            const kiteEn = typeof isBuiltinShapeEnabled === 'function' && isBuiltinShapeEnabled('Кайт');
            if (kiteEn && kiteQuadMetricsFromOrdered(ordered)) return 'Кайт';
            if (sidesOk) {
                const rombEn = typeof isBuiltinShapeEnabled === 'function' && isBuiltinShapeEnabled('Ромб');
                if (rombEn) return 'Ромб';
            }
            return 'Четырёхугольник';
        }
        if (lineCount === 3) {
            if (isChain) {
                const ordered = getOrderedStarsForChain(lines, starIds);
                const chainAng = getChainAngles(ordered);
                const minChainAngle = Math.min(...chainAng);
                const maxChainAngle = Math.max(...chainAng);
                const meanChainAngle = average(chainAng);
                const arcShape = isConsistentArc(ordered);
                const orderedStars = ordered.map(id => getStarById(id)).filter(Boolean);
                let chainAspect = 0;
                if (orderedStars.length === ordered.length) {
                    const xs = orderedStars.map(s => s.x);
                    const ys = orderedStars.map(s => s.y);
                    const spanX = Math.max(...xs) - Math.min(...xs);
                    const spanY = Math.max(...ys) - Math.min(...ys);
                    chainAspect = spanX / Math.max(1, spanY);
                }

                if (arcShape &&
                    minChainAngle < 55 &&
                    maxChainAngle > 120) {
                    return 'Крюк';
                }

                const segLens = getChainSegmentLengths(ordered);
                if (arcShape &&
                    trusyChainMetricsPass(chainAng, segLens) &&
                    chainAspect >= TRUSY_MIN_CHAIN_ASPECT) {
                    return 'Трусы';
                }

                if (arcShape && bananaChainMetricsPass(chainAng)) {
                    return 'Банан';
                }

                if (arcShape &&
                    chainAng.every(a => a >= 95 && a <= 170)) {
                    return 'Сосиска';
                }

                if (!arcShape &&
                    minChainAngle <= 80 &&
                    maxChainAngle >= 120) {
                    return 'Носок';
                }

                if (chainAnglesOk(chainAng, CHAIN_MIN_ANGLE)) {
                    return 'Цепочка-4';
                }
                return 'Зигзаг';
            }
            if (hasCenter && centerDegree === 3) {
                let centerId = null;
                for (let id of starIds) {
                    if (degree[id] === 3) {
                        centerId = id;
                        break;
                    }
                }
                if (centerId !== null) {
                    const centerStar = getStarById(centerId);
                    const branchLengths = [];
                    for (let seg of lines) {
                        const neighborId = seg.startId === centerId ? seg.endId : (seg.endId === centerId ? seg.startId : null);
                        if (neighborId !== null) {
                            const neighbor = getStarById(neighborId);
                            if (centerStar && neighbor) {
                                branchLengths.push(dist(centerStar.x, centerStar.y, neighbor.x, neighbor.y));
                            }
                        }
                    }
                    if (branchLengths.length === 3) {
                        branchLengths.sort((a, b) => a - b);
                        const shortestRatio = branchLengths[0] / Math.max(1, branchLengths[2]);
                        const middleRatio = branchLengths[1] / Math.max(1, branchLengths[2]);
                        if (shortestRatio <= 0.72 && middleRatio >= 0.76) {
                            return 'Резиновая уточка';
                        }
                    }
                }
                return 'Вилка';
            }
            return 'Зигзаг';
        }
        if (lineCount === 4 && hasCenter) {
            if (centerDegree === 3) {
                let centerId = null;
                for (let id of starIds) {
                    if (degree[id] === 3) {
                        centerId = id;
                        break;
                    }
                }
                if (centerId !== null) {
                    const centerStar = getStarById(centerId);
                    const branchLengths = [];
                    for (let seg of lines) {
                        const neighborId = seg.startId === centerId ? seg.endId : (seg.endId === centerId ? seg.startId : null);
                        if (neighborId !== null) {
                            const neighbor = getStarById(neighborId);
                            if (centerStar && neighbor) {
                                branchLengths.push(dist(centerStar.x, centerStar.y, neighbor.x, neighbor.y));
                            }
                        }
                    }
                    if (branchLengths.length === 3) {
                        branchLengths.sort((a, b) => a - b);
                        const shortToMid = branchLengths[0] / Math.max(1, branchLengths[1]);
                        const longToMid = branchLengths[2] / Math.max(1, branchLengths[1]);
                        if (shortToMid >= 0.7 && longToMid >= 1.2) {
                            return 'Бабочка';
                        }
                    }
                }
            }
            return 'Песочные часы';
        }
        return 'Фигура';
    }

    // === 5 stars ===
    if (starCount === 5) {
        if (lineCount === 5 && isClosed) {
            const ordered = getOrderedStarsForClosedShape(lines, starIds);
            const lengths = getEdgeLengthsClosed(ordered);
            if (sideRatioOk(lengths, SIDE_RATIO_THRESHOLD)) {
                return 'Пентагон';
            }
            return 'Пятиугольник';
        }
        if (lineCount === 4 && isChain) {
            const ordered = getOrderedStarsForChain(lines, starIds);
            const chainAng = getChainAngles(ordered);

            if (isConsistentArc(ordered)) {
                const centerAngle = chainAng[1];
                const outerAverage = (chainAng[0] + chainAng[2]) / 2;
                if (centerAngle <= 65 && outerAverage >= 95 && outerAverage <= 165) {
                    return 'Сердечко';
                }
            }

            if (mustacheFiveStarGeometryOk(lines, starIds)) {
                return 'Усы';
            }

            if (chainAnglesOk(chainAng, CHAIN_MIN_ANGLE)) {
                return 'Цепочка-5';
            }
            return 'Фигура';
        }
        if (hasCenter && centerDegree >= 4) {
            if (centerDegree === 4) {
                let centerId = null;
                for (let id of starIds) {
                    if (degree[id] === 4) {
                        centerId = id;
                        break;
                    }
                }
                if (centerId !== null) {
                    const centerStar = getStarById(centerId);
                    const rayLengths = [];
                    for (let seg of lines) {
                        const neighborId = seg.startId === centerId ? seg.endId : (seg.endId === centerId ? seg.startId : null);
                        if (neighborId !== null) {
                            const neighbor = getStarById(neighborId);
                            if (centerStar && neighbor) {
                                rayLengths.push(dist(centerStar.x, centerStar.y, neighbor.x, neighbor.y));
                            }
                        }
                    }
                    if (rayLengths.length === 4) {
                        const maxRay = Math.max(...rayLengths);
                        const minRay = Math.min(...rayLengths);
                        if ((maxRay / Math.max(1, minRay)) >= 1.8) {
                            return 'Единорог';
                        }
                    }
                }
            }
            return 'Звезда';
        }
        if (hasCenter && centerDegree === 3) {
            let centerId = null;
            for (let id of starIds) {
                if (degree[id] === 3) {
                    centerId = id;
                    break;
                }
            }
            if (centerId !== null) {
                const centerStar = getStarById(centerId);
                const branchLengths = [];
                for (let seg of lines) {
                    const neighborId = seg.startId === centerId ? seg.endId : (seg.endId === centerId ? seg.startId : null);
                    if (neighborId !== null) {
                        const neighbor = getStarById(neighborId);
                        if (centerStar && neighbor) {
                            branchLengths.push(dist(centerStar.x, centerStar.y, neighbor.x, neighbor.y));
                        }
                    }
                }
                if (branchLengths.length === 3) {
                    branchLengths.sort((a, b) => a - b);
                    // Jellyfish silhouette: one short "dome" branch and two longer similar tentacles.
                    const shortIsDistinct = (branchLengths[0] / Math.max(1, branchLengths[1])) <= 0.8;
                    const longPairSimilar = (branchLengths[2] / Math.max(1, branchLengths[1])) <= 1.35;
                    if (shortIsDistinct && longPairSimilar) {
                        return 'Медуза';
                    }
                }
            }
            return 'Дерево';
        }
        return 'Фигура';
    }

    return 'Фигура';
}

// =============================================================================
// SCORE-BASED RECOGNITION (hybrid: topology gate + weighted similarity)
// =============================================================================

const recognitionPatternFeatureCache = new Map();

function clamp01(value) {
    return Math.max(0, Math.min(1, value));
}

function average(values) {
    if (!values || values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function meanAbsDiff(a, b) {
    if (!a || !b || a.length === 0 || b.length === 0) return 1;
    const n = Math.min(a.length, b.length);
    let sum = 0;
    for (let i = 0; i < n; i++) {
        sum += Math.abs(a[i] - b[i]);
    }
    sum += Math.abs(a.length - b.length);
    return sum / Math.max(1, Math.max(a.length, b.length));
}

function rotateArray(arr, shift) {
    const n = arr.length;
    if (n === 0) return [];
    const normalizedShift = ((shift % n) + n) % n;
    if (normalizedShift === 0) return [...arr];
    return [...arr.slice(normalizedShift), ...arr.slice(0, normalizedShift)];
}

function circularMinMeanAbsDiff(a, b) {
    if (!a || !b || a.length === 0 || b.length === 0 || a.length !== b.length) {
        return meanAbsDiff(a || [], b || []);
    }
    let best = Infinity;
    const revB = [...b].reverse();
    for (let shift = 0; shift < b.length; shift++) {
        const shifted = rotateArray(b, shift);
        const shiftedRev = rotateArray(revB, shift);
        best = Math.min(best, meanAbsDiff(a, shifted), meanAbsDiff(a, shiftedRev));
    }
    return best;
}

function turnInvariantMinMeanAbsDiff(a, b) {
    if (!a || !b || a.length === 0 || b.length === 0) {
        return meanAbsDiff(a || [], b || []);
    }
    const negB = b.map(value => -value);
    return Math.min(
        circularMinMeanAbsDiff(a, b),
        circularMinMeanAbsDiff(a, negB)
    );
}

function getAdjacency(starIds, lines) {
    const adj = {};
    for (const id of starIds) adj[id] = [];
    for (const seg of lines) {
        if (adj[seg.startId] && adj[seg.endId]) {
            adj[seg.startId].push(seg.endId);
            adj[seg.endId].push(seg.startId);
        }
    }
    return adj;
}

function getDegreeMap(starIds, lines) {
    const degree = {};
    for (const id of starIds) degree[id] = 0;
    for (const seg of lines) {
        if (degree[seg.startId] !== undefined) degree[seg.startId]++;
        if (degree[seg.endId] !== undefined) degree[seg.endId]++;
    }
    return degree;
}

function getOrderedChainByAdj(adj, starIds) {
    let startId = null;
    for (const id of starIds) {
        if ((adj[id] || []).length === 1) {
            startId = id;
            break;
        }
    }
    if (startId === null) startId = starIds[0];
    const ordered = [startId];
    let prev = null;
    let current = startId;
    for (let i = 1; i < starIds.length; i++) {
        const neighbors = adj[current] || [];
        const next = neighbors.find(n => n !== prev);
        if (next === undefined) break;
        ordered.push(next);
        prev = current;
        current = next;
    }
    return ordered;
}

function getOrderedCycleByAdj(adj, starIds) {
    const startId = starIds[0];
    const ordered = [startId];
    let prev = null;
    let current = startId;
    for (let i = 1; i < starIds.length; i++) {
        const neighbors = adj[current] || [];
        const next = neighbors.find(n => n !== prev);
        if (next === undefined) break;
        ordered.push(next);
        prev = current;
        current = next;
    }
    return ordered;
}

function buildGraphFeatureVector(starIdsInput, linesInput, pointResolver) {
    const starIds = [...starIdsInput];
    const lines = [...(linesInput || [])];
    const degree = getDegreeMap(starIds, lines);
    const degreeSequence = Object.values(degree).sort((a, b) => a - b);
    const maxDegree = degreeSequence.length > 0 ? Math.max(...degreeSequence) : 0;
    const degreeOnceCount = degreeSequence.filter(d => d === 1).length;
    const degreeTwiceCount = degreeSequence.filter(d => d === 2).length;
    const isClosed = degreeSequence.length > 0 && degreeSequence.every(d => d === 2);
    const isChain = degreeOnceCount === 2 && degreeTwiceCount === starIds.length - 2;
    const hasCenter = degreeSequence.some(d => d >= 3);
    const centerIds = starIds.filter(id => degree[id] === maxDegree);
    const centerId = centerIds.length === 1 ? centerIds[0] : null;

    const edges = [];
    const edgeLengths = [];
    for (const seg of lines) {
        const a = pointResolver(seg.startId);
        const b = pointResolver(seg.endId);
        if (!a || !b) continue;
        const length = dist(a.x, a.y, b.x, b.y);
        edgeLengths.push(length);
        edges.push({ startId: seg.startId, endId: seg.endId, length });
    }
    const meanEdgeLength = average(edgeLengths);
    const sortedEdgeRatios = meanEdgeLength > 0
        ? edgeLengths.map(len => len / meanEdgeLength).sort((a, b) => a - b)
        : [];

    const adj = getAdjacency(starIds, lines);
    let ordered = [];
    if (isClosed) ordered = getOrderedCycleByAdj(adj, starIds);
    else if (isChain) ordered = getOrderedChainByAdj(adj, starIds);

    let angles = [];
    let signedTurns = [];
    if (ordered.length >= 3 && isClosed) {
        const n = ordered.length;
        for (let i = 0; i < n; i++) {
            const prev = pointResolver(ordered[(i - 1 + n) % n]);
            const curr = pointResolver(ordered[i]);
            const next = pointResolver(ordered[(i + 1) % n]);
            if (!prev || !curr || !next) continue;
            angles.push(angleBetweenPoints(prev, curr, next));
            const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
            signedTurns.push(Math.sign(cross));
        }
    } else if (ordered.length >= 3 && isChain) {
        for (let i = 1; i < ordered.length - 1; i++) {
            const prev = pointResolver(ordered[i - 1]);
            const curr = pointResolver(ordered[i]);
            const next = pointResolver(ordered[i + 1]);
            if (!prev || !curr || !next) continue;
            angles.push(angleBetweenPoints(prev, curr, next));
            const cross = (curr.x - prev.x) * (next.y - curr.y) - (curr.y - prev.y) * (next.x - curr.x);
            signedTurns.push(Math.sign(cross));
        }
    } else {
        for (const id of starIds) {
            const neighbors = adj[id] || [];
            if (neighbors.length < 2) continue;
            const curr = pointResolver(id);
            if (!curr) continue;
            for (let i = 0; i < neighbors.length; i++) {
                for (let j = i + 1; j < neighbors.length; j++) {
                    const a = pointResolver(neighbors[i]);
                    const b = pointResolver(neighbors[j]);
                    if (!a || !b) continue;
                    angles.push(angleBetweenPoints(a, curr, b));
                }
            }
        }
    }
    const sortedAngles = [...angles].sort((a, b) => a - b);

    const points = starIds.map(id => pointResolver(id)).filter(Boolean);
    const xs = points.map(p => p.x);
    const ys = points.map(p => p.y);
    const spanX = xs.length > 0 ? (Math.max(...xs) - Math.min(...xs)) : 0;
    const spanY = ys.length > 0 ? (Math.max(...ys) - Math.min(...ys)) : 0;
    const aspect = Math.max(spanX, spanY) / Math.max(1, Math.min(spanX || 1, spanY || 1));

    const meanX = average(xs);
    const meanY = average(ys);
    const centered = points.map(p => ({ x: p.x - meanX, y: p.y - meanY }));
    let covXX = 0;
    let covYY = 0;
    let covXY = 0;
    for (const p of centered) {
        covXX += p.x * p.x;
        covYY += p.y * p.y;
        covXY += p.x * p.y;
    }
    const denom = Math.max(1, centered.length);
    covXX /= denom;
    covYY /= denom;
    covXY /= denom;
    const trace = covXX + covYY;
    const det = covXX * covYY - covXY * covXY;
    const delta = Math.max(0, trace * trace - 4 * det);
    const eigen1 = 0.5 * (trace + Math.sqrt(delta));
    const eigen2 = 0.5 * (trace - Math.sqrt(delta));
    const eccentricity = Math.sqrt(Math.max(1e-6, eigen1) / Math.max(1e-6, eigen2));

    let centerRayRatios = [];
    if (centerId !== null && maxDegree >= 3) {
        const center = pointResolver(centerId);
        if (center) {
            const rays = [];
            for (const neighborId of adj[centerId] || []) {
                const neighbor = pointResolver(neighborId);
                if (!neighbor) continue;
                rays.push(dist(center.x, center.y, neighbor.x, neighbor.y));
            }
            const maxRay = rays.length > 0 ? Math.max(...rays) : 0;
            if (maxRay > 0) {
                centerRayRatios = rays.map(r => r / maxRay).sort((a, b) => a - b);
            }
        }
    }

    const shortEdgesCount = edgeLengths.filter(len => len < RECOG_MIN_EDGE_LENGTH).length;
    const degeneracyPenalty = clamp01(
        shortEdgesCount / Math.max(1, edgeLengths.length) +
        (points.length !== starIds.length ? 0.5 : 0)
    );

    return {
        starCount: starIds.length,
        lineCount: lines.length,
        degreeSequence,
        cyclomatic: lines.length - starIds.length + 1,
        isClosed,
        isChain,
        hasCenter,
        maxDegree,
        sortedEdgeRatios,
        sortedAngles,
        signedTurns,
        aspect,
        eccentricity,
        centerRayRatios,
        degeneracyPenalty
    };
}

function buildPatternFeatureVector(shapeName) {
    if (recognitionPatternFeatureCache.has(shapeName)) {
        return recognitionPatternFeatureCache.get(shapeName);
    }
    const pattern = SHAPE_PATTERNS[shapeName];
    if (!pattern || !Array.isArray(pattern.stars) || !Array.isArray(pattern.lines)) {
        return null;
    }
    const ids = pattern.stars.map((_, index) => index);
    const lines = pattern.lines.map(([startId, endId]) => ({ startId, endId }));
    const points = pattern.stars.map(([x, y]) => ({ x, y }));
    const feature = buildGraphFeatureVector(ids, lines, (id) => points[id] || null);
    recognitionPatternFeatureCache.set(shapeName, feature);
    return feature;
}

function getRecognitionCandidatesPool(inputFeatures) {
    const enabledBuiltinShapes =
        typeof ACTIVE_BUILTIN_SHAPE_NAMES !== 'undefined' && Array.isArray(ACTIVE_BUILTIN_SHAPE_NAMES)
            ? ACTIVE_BUILTIN_SHAPE_NAMES
            : null;
    const hybridExcluded =
        typeof RECOG_HYBRID_EXCLUDED_SHAPE_NAMES !== 'undefined' && RECOG_HYBRID_EXCLUDED_SHAPE_NAMES
            ? RECOG_HYBRID_EXCLUDED_SHAPE_NAMES
            : null;
    const builtinCandidates = (enabledBuiltinShapes || (typeof BUILTIN_SHAPE_NAMES !== 'undefined' ? BUILTIN_SHAPE_NAMES : Object.keys(SHAPE_PATTERNS || {})))
        .filter(name => name !== 'Фигура')
        .filter(name => !!SHAPE_PATTERNS[name])
        .filter(name => !hybridExcluded || !hybridExcluded.has(name));
    const degreeSignature = inputFeatures.degreeSequence.join(',');
    let pool = builtinCandidates.filter(name => {
        const f = buildPatternFeatureVector(name);
        if (!f) return false;
        return f.starCount === inputFeatures.starCount &&
               f.lineCount === inputFeatures.lineCount &&
               f.degreeSequence.join(',') === degreeSignature;
    });
    if (pool.length === 0) {
        pool = builtinCandidates.filter(name => {
            const f = buildPatternFeatureVector(name);
            return !!f && f.starCount === inputFeatures.starCount && f.lineCount === inputFeatures.lineCount;
        });
    }
    if (pool.length === 0) {
        pool = builtinCandidates.filter(name => {
            const f = buildPatternFeatureVector(name);
            return !!f && f.starCount === inputFeatures.starCount;
        });
    }
    return pool;
}

function computeSimilarityBreakdown(inputFeatures, candidateFeatures) {
    const topoMatch = (
        inputFeatures.starCount === candidateFeatures.starCount &&
        inputFeatures.lineCount === candidateFeatures.lineCount &&
        inputFeatures.degreeSequence.join(',') === candidateFeatures.degreeSequence.join(',')
    );
    const topoScore = topoMatch ? 1 : 0;

    const lenDiff = meanAbsDiff(inputFeatures.sortedEdgeRatios, candidateFeatures.sortedEdgeRatios);
    const lenScore = clamp01(1 - lenDiff / 0.65);

    const angleDiff = circularMinMeanAbsDiff(inputFeatures.sortedAngles, candidateFeatures.sortedAngles);
    const angScore = clamp01(1 - angleDiff / 70);

    let turnScore = 0.5;
    if (inputFeatures.signedTurns.length > 0 && candidateFeatures.signedTurns.length > 0) {
        // Must be invariant to traversal direction: reversing path flips turn signs.
        const turnDiff = turnInvariantMinMeanAbsDiff(inputFeatures.signedTurns, candidateFeatures.signedTurns);
        turnScore = clamp01(1 - turnDiff / 1.8);
    }

    const aspectScore = clamp01(1 - Math.abs(inputFeatures.aspect - candidateFeatures.aspect) / 2.8);
    const eccScore = clamp01(1 - Math.abs(inputFeatures.eccentricity - candidateFeatures.eccentricity) / 3.2);
    const rayScore = clamp01(1 - meanAbsDiff(inputFeatures.centerRayRatios, candidateFeatures.centerRayRatios) / 0.85);
    const globalScore = clamp01((aspectScore * 0.45) + (eccScore * 0.35) + (rayScore * 0.20));

    const penalty = clamp01(inputFeatures.degeneracyPenalty + candidateFeatures.degeneracyPenalty * 0.2);

    return {
        topo: topoScore,
        len: lenScore,
        ang: angScore,
        turn: turnScore,
        global: globalScore,
        penalty
    };
}

function rankRecognitionCandidates(lines, starIds, legacyLabel) {
    const inputFeatures = buildGraphFeatureVector(starIds, lines, (id) => getStarById(id));
    const pool = getRecognitionCandidatesPool(inputFeatures);
    const ranked = [];

    for (const name of pool) {
        const candidateFeatures = buildPatternFeatureVector(name);
        if (!candidateFeatures) continue;

        const s = computeSimilarityBreakdown(inputFeatures, candidateFeatures);
        let score =
            RECOG_WEIGHT_TOPO * s.topo +
            RECOG_WEIGHT_LEN * s.len +
            RECOG_WEIGHT_ANG * s.ang +
            RECOG_WEIGHT_TURN * s.turn +
            RECOG_WEIGHT_GLOBAL * s.global -
            s.penalty * 0.22;

        if (legacyLabel && legacyLabel !== 'Фигура' && legacyLabel === name) {
            score += RECOG_LEGACY_BONUS;
        }
        if (typeof isShapeVisibleInAtlas === 'function' && isShapeVisibleInAtlas(name)) {
            score += typeof RECOG_ATLAS_VISIBLE_BONUS === 'number' ? RECOG_ATLAS_VISIBLE_BONUS : 0.1;
        }

        ranked.push({
            label: name,
            score: clamp01(score),
            components: s
        });
    }

    ranked.sort((a, b) => b.score - a.score);
    return {
        inputFeatures,
        ranked
    };
}

function recognizeShapeDetailed(lines, starIds) {
    const starCount = starIds ? starIds.size : 0;
    if (starCount < 3 || starCount > 7) {
        return {
            label: 'Фигура',
            confidence: 0,
            secondBest: null,
            delta: 0,
            state: 'fallback',
            candidates: [],
            legacyLabel: 'Фигура',
            details: null
        };
    }

    const legacyLabel = recognizeShapeLegacy(lines, starIds);
    const { ranked } = rankRecognitionCandidates(lines, starIds, legacyLabel);
    if (ranked.length === 0) {
        return {
            label: 'Фигура',
            confidence: 0,
            secondBest: null,
            delta: 0,
            state: 'fallback',
            candidates: [],
            legacyLabel,
            details: null
        };
    }

    const pizzaGeomOk = pizzaSliceTriangleGeometryOk(lines, starIds);
    const caterpillarGeomOk = caterpillarChainGeometryOk(lines, starIds);
    const trusyGeomOk = trusyChainGeometryOk(lines, starIds);
    const bananaGeomOk = bananaChainGeometryOk(lines, starIds);
    const kiteGeomOk = kiteQuadGeometryOk(lines, starIds);
    const mustacheGeomOk = mustacheFiveStarGeometryOk(lines, starIds);
    let rankedForPick = ranked.filter(entry => {
        if (entry.label === 'Кусок пиццы' && !pizzaGeomOk) return false;
        if (entry.label === 'Гусеница' && !caterpillarGeomOk) return false;
        if (entry.label === 'Трусы' && !trusyGeomOk) return false;
        if (entry.label === 'Банан' && !bananaGeomOk) return false;
        if (entry.label === 'Кайт' && !kiteGeomOk) return false;
        if (entry.label === 'Усы' && !mustacheGeomOk) return false;
        return true;
    });
    if (rankedForPick.length === 0) {
        rankedForPick = ranked.filter(entry =>
            entry.label !== 'Кусок пиццы' && entry.label !== 'Гусеница' && entry.label !== 'Трусы' &&
            entry.label !== 'Банан' && entry.label !== 'Кайт' && entry.label !== 'Усы');
    }
    if (rankedForPick.length === 0) {
        return {
            label: 'Фигура',
            confidence: 0,
            secondBest: null,
            delta: 0,
            state: 'fallback',
            candidates: [],
            legacyLabel,
            details: null
        };
    }

    const best = rankedForPick[0];
    const second = rankedForPick[1] || null;
    const delta = second ? (best.score - second.score) : best.score;

    let state = 'fallback';
    let label = 'Фигура';
    if (best.score >= RECOG_ACCEPT_THRESHOLD && delta >= RECOG_MARGIN_THRESHOLD) {
        state = 'accept';
        label = best.label;
    } else if (best.score >= RECOG_AMBIG_THRESHOLD) {
        state = 'ambiguous';
        label = best.label;
    }

    return applyAtlasUnlockedRecognitionPreference({
        label,
        confidence: best.score,
        secondBest: second ? second.label : null,
        delta,
        state,
        candidates: rankedForPick.slice(0, RECOG_MAX_CANDIDATES_TO_SHOW),
        legacyLabel,
        details: {
            top: best,
            second
        }
    });
}

/** Формы с открытых страниц атласа принимаем сразу (в т.ч. второй 3★ и т.д.). */
function applyAtlasUnlockedRecognitionPreference(result) {
    if (!result) return result;

    const canUseAtlasLabel = (name) => {
        if (!name || name === 'Фигура') return false;
        if (typeof isBuiltinShapeEnabled === 'function' && !isBuiltinShapeEnabled(name)) return false;
        return typeof isShapeVisibleInAtlas === 'function' && isShapeVisibleInAtlas(name);
    };

    let { label, state, legacyLabel, candidates } = result;

    if (canUseAtlasLabel(label) && state !== 'fallback') {
        return { ...result, label, state: 'accept' };
    }

    if (canUseAtlasLabel(legacyLabel)) {
        return {
            ...result,
            label: legacyLabel,
            state: 'accept',
            confidence: Math.max(result.confidence || 0, RECOG_AMBIG_THRESHOLD)
        };
    }

    for (const candidate of candidates || []) {
        if (!candidate || !canUseAtlasLabel(candidate.label)) continue;
        const score = typeof candidate.score === 'number' ? candidate.score : 0;
        if (score >= RECOG_AMBIG_THRESHOLD) {
            return {
                ...result,
                label: candidate.label,
                state: 'accept',
                confidence: score
            };
        }
    }

    return result;
}

function recognizeShape(lines, starIds) {
    return recognizeShapeDetailed(lines, starIds).label;
}

// =============================================================================
// FALLBACK NAME PICKER
// =============================================================================

/**
 * Returns a random name from FALLBACK_NAMES not already used on the field.
 * @param {string[]} usedNames - current constellation.name values on the field
 * @returns {string} unique fallback name, or 'Фигура' if pool is exhausted
 */
function pickFallbackName(usedNames) {
    const usedSet = new Set(usedNames);
    const available = FALLBACK_NAMES.filter(name => !usedSet.has(name));
    if (available.length === 0) return 'Фигура';
    return available[Math.floor(Math.random() * available.length)];
}
