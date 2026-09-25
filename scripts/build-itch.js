#!/usr/bin/env node
// build-itch.js — P-03: zip для itch.io (ветка `itch`, в `main` не мёржится).
//
//   node scripts/build-itch.js        → dist/itch/WhatYouSee-itch-<sha>.zip
//
// Что едет в архив: тот же явный список, что у сборки APK (`build-www.js` на
// ветке `capacitor`) — `index.html` корнем архива (требование itch), `css/`,
// `js/`, `images/`, `music/`. Берутся ТОЛЬКО файлы под git (`git ls-files`),
// а не всё, что лежит в каталоге: так в архив физически не попадут ни
// `music/masters/`, ни `www/`/`node_modules/` соседней ветки, ни
// `analytics.local.json`. `music/CREDITS.md` — док разработчика, не игры.
//
// Незакоммиченные правки в архив не попадают (читается HEAD), и скрипт
// отказывается собирать при грязном дереве — иначе zip разошёлся бы с тем,
// что вы видите локально.
//
// Две правки поверх исходников — только в архиве, репозиторий не трогается:
//
//   • Dev-панели в архиве нет. Вычёркивается и невидимая кнопка тройного тапа
//     (`#devToggleBtn`), и сама разметка панели (`#devControls`): игру можно
//     открыть по прямому адресу iframe с `?dev=1`, и без разметки флагу нечего
//     показывать. Код игры ищет эти узлы через `?.`/`if (!el)` и без них молчит.
//
//   • Аналитика (P-05) включена с `channel: 'itch'`. Адрес и ключ — из
//     `analytics.local.json` в корне рабочей копии (под .gitignore, тот же файл,
//     что у сборки APK). Нет файла — сборка падает: zip без аналитики легко
//     залить, ожидая данных. Осознанно без неё — `--no-analytics`, тогда модуль
//     вычёркивается из архива целиком.
//     Второй замок — адрес страницы: CONFIG живой только на `*.itch.zone`.
//     Тот же zip, открытый локально, запросов не делает.
//
//   node scripts/build-itch.js --no-analytics   → без аналитики, явно
//
//   • P-12: `--diag` — пробная сборка для опытов на закрытой странице itch.
//     Кладёт `scripts/itch-diag.js` в архив как `js/itch-diag.js` (плашка
//     диагностики ввода поверх игры) и подразумевает `--no-analytics`: опыты
//     не засоряют статистику. Архив — `WhatYouSee-itch-<sha>-diag.zip`.
//     Файл диагностики берётся с диска, а не из HEAD: сборка одноразовая.
//
//   node scripts/build-itch.js --diag           → с диагностикой, без аналитики
//
// Zip пишется руками (store/deflate + CRC32 из zlib) — ни одной зависимости.

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
// + manifest.webmanifest: на него ссылается index.html, без файла — 404 в консоли.
const ITEMS = ['index.html', 'manifest.webmanifest', 'css', 'js', 'images', 'music'];
const EXCLUDED = ['music/CREDITS.md'];
const ANALYTICS_LOCAL = path.join(ROOT, 'analytics.local.json');
// Хост iframe itch: html.itch.zone / html-classic.itch.zone и т.п.
const ITCH_HOST_RE = '/(^|\\.)itch\\.zone$/';

const KNOWN_FLAGS = ['--no-analytics', '--diag'];
const FLAGS = process.argv.slice(2);
for (const f of FLAGS) {
    if (!KNOWN_FLAGS.includes(f)) {
        console.error(`[build-itch] незнакомый флаг ${f}; знаю: ${KNOWN_FLAGS.join(', ')}`);
        process.exit(1);
    }
}
const DIAG = FLAGS.includes('--diag');
const NO_ANALYTICS = DIAG || FLAGS.includes('--no-analytics');
const DIAG_SRC = path.join(ROOT, 'scripts', 'itch-diag.js');

function git(args, opts) {
    return execFileSync('git', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, ...opts });
}

function fail(msg) {
    console.error('[build-itch] ' + msg);
    process.exit(1);
}

/** Вычеркнуть из текста кусок по регэкспу; не нашёл — сборка падает. */
function strip(text, re, what) {
    const out = text.replace(re, '');
    if (out === text) fail(`не нашёл ${what} в index.html — вычёркивать нечего`);
    return out;
}

function stripDevPanel(html) {
    html = strip(html, /[ \t]*<button[^>]*\bid="devToggleBtn"[^>]*><\/button>\r?\n/, 'кнопку #devToggleBtn');
    // Комментарий D-02 над панелью и сама панель до её закрывающего </div>
    // (внутри один вложенный div-ряд на строку — закрывается на той же строке
    // или парой ниже; панель кончается первым </div> с отступом самой панели).
    html = strip(html, /[ \t]*<!-- D-02:[^\n]*-->\r?\n/, 'комментарий D-02 над панелью');
    const m = html.match(/([ \t]*)<div id="devControls"[^>]*>/);
    if (!m) fail('не нашёл #devControls в index.html');
    const start = m.index;
    const closeRe = new RegExp('\\r?\\n' + m[1] + '</div>[ \\t]*\\r?\\n');
    const rest = html.slice(start);
    const close = rest.match(closeRe);
    if (!close) fail('не нашёл конец #devControls в index.html');
    const block = rest.slice(0, close.index + close[0].length);
    if (/id="devToggleBtn"|id="canvas-container"/.test(block)) fail('граница #devControls посчитана неверно');
    return html.slice(0, start) + html.slice(start + block.length);
}

function stripAnalytics(html) {
    html = strip(html, /[ \t]*<script src="js\/analytics\.js"><\/script>\r?\n/, '<script src="js/analytics.js">');
    return html.replace(/[ \t]*<!-- P-05:[\s\S]*?-->\r?\n/, '');
}

/** P-12: плашка диагностики — сразу после p5, раньше скриптов игры. */
function injectDiag(html) {
    const re = /([ \t]*)<script src="js\/vendor\/p5\.min\.js"><\/script>\r?\n/;
    const m = html.match(re);
    if (!m) fail('не нашёл <script src="js/vendor/p5.min.js"> — диагностику подключить некуда');
    const tag = `${m[1]}<!-- P-12: диагностика ввода (build-itch.js --diag) -->\n` +
        `${m[1]}<script src="js/itch-diag.js"></script>\n`;
    return html.replace(re, m[0] + tag);
}

function injectAnalyticsConfig(src, build) {
    let cfg;
    try {
        cfg = JSON.parse(fs.readFileSync(ANALYTICS_LOCAL, 'utf8'));
    } catch (e) {
        fail('analytics.local.json не читается как JSON: ' + e.message);
    }
    // Как в build-www.js: значения не экранируются, а проверяются форматом.
    const host = String(cfg.host || '');
    const key = String(cfg.key || '');
    if (!/^https:\/\/[A-Za-z0-9.-]+$/.test(host)) fail(`analytics.local.json: host должен быть https-адресом без пути, получено "${host}"`);
    if (!/^phc_[A-Za-z0-9_-]+$/.test(key)) fail('analytics.local.json: key должен быть ключом проекта PostHog (phc_…)');

    const marker = /(\/\/ >>> P-05 CONFIG)[\s\S]*?(\/\/ <<< P-05 CONFIG)/;
    if (!marker.test(src)) fail('в js/analytics.js нет маркеров P-05 CONFIG — подставить адрес некуда');
    const block = `$1
    // P-03 (build-itch.js): живой только в iframe itch — тот же zip локально молчит.
    const CONFIG = ${ITCH_HOST_RE}.test(location.hostname)
        ? { host: '${host}', key: '${key}', channel: 'itch', build: '${build}' }
        : { host: '', key: '', channel: 'itch', build: '${build}' };
    $2`;
    return { src: src.replace(marker, block), host };
}

function main() {
    const dirty = git(['status', '--porcelain', '--', ...ITEMS]).toString().trim();
    if (dirty) {
        console.error('[build-itch] в игровых файлах есть незакоммиченные правки — сначала коммит:\n' + dirty);
        process.exit(1);
    }

    const files = git(['ls-files', '-z', '--', ...ITEMS]).toString()
        .split('\0').filter(Boolean)
        .filter(f => !EXCLUDED.includes(f));
    if (!files.includes('index.html')) {
        console.error('[build-itch] index.html не найден в git — собирать нечего');
        process.exit(1);
    }

    const sha = git(['rev-parse', '--short', 'HEAD']).toString().trim();
    const outDir = path.join(ROOT, 'dist', 'itch');
    fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `WhatYouSee-itch-${sha}${DIAG ? '-diag' : ''}.zip`);

    if (!NO_ANALYTICS && !fs.existsSync(ANALYTICS_LOCAL)) {
        fail('нет analytics.local.json в корне рабочей копии: положи файл (тот же, что у сборки APK) или собери явно с --no-analytics');
    }

    let entries = files.map(name => ({ name, data: git(['show', `HEAD:${name}`]) }));
    const text = name => entries.find(e => e.name === name).data.toString('utf8');
    const put = (name, str) => { entries.find(e => e.name === name).data = Buffer.from(str, 'utf8'); };

    let html = stripDevPanel(text('index.html'));
    console.log('[build-itch] dev-панель вычеркнута (кнопка тройного тапа и разметка панели)');

    if (NO_ANALYTICS) {
        html = stripAnalytics(html);
        entries = entries.filter(e => e.name !== 'js/analytics.js');
        console.log(`[build-itch] [analytics] ВЫКЛЮЧЕНА явно (${DIAG ? '--diag' : '--no-analytics'}) — модуля в архиве нет`);
    } else {
        const build = `itch ${sha}`;
        const { src, host } = injectAnalyticsConfig(text('js/analytics.js'), build);
        put('js/analytics.js', src);
        console.log(`[build-itch] [analytics] включена: ${host}, канал itch, сборка "${build}", только на *.itch.zone`);
    }
    if (DIAG) {
        if (!fs.existsSync(DIAG_SRC)) fail('нет scripts/itch-diag.js — диагностику собрать не из чего');
        html = injectDiag(html);
        entries.push({ name: 'js/itch-diag.js', data: fs.readFileSync(DIAG_SRC) });
        console.log('[build-itch] [diag] плашка диагностики ввода подключена (js/itch-diag.js)');
    }
    put('index.html', html);

    fs.writeFileSync(outFile, buildZip(entries));

    const kb = Math.round(fs.statSync(outFile).size / 1024);
    console.log(`[build-itch] ${entries.length} файлов → ${path.relative(ROOT, outFile)} (${kb} КБ)`);
}

// =============================================================================
// ZIP
// =============================================================================

function dosTime(d) {
    return {
        time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
        date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    };
}

function buildZip(entries) {
    const { time, date } = dosTime(new Date());
    const locals = [];
    const centrals = [];
    let offset = 0;

    for (const { name, data } of entries) {
        const nameBuf = Buffer.from(name, 'utf8');
        const crc = zlib.crc32(data);
        const deflated = zlib.deflateRawSync(data, { level: 9 });
        // Уже сжатое (mp3, png) deflate не берёт — тогда кладём как есть.
        const useDeflate = deflated.length < data.length;
        const body = useDeflate ? deflated : data;
        const method = useDeflate ? 8 : 0;

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);          // имена в UTF-8
        local.writeUInt16LE(method, 8);
        local.writeUInt16LE(time, 10);
        local.writeUInt16LE(date, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(body.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(nameBuf.length, 26);
        local.writeUInt16LE(0, 28);
        locals.push(local, nameBuf, body);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE(20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(method, 10);
        central.writeUInt16LE(time, 12);
        central.writeUInt16LE(date, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(body.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(nameBuf.length, 28);
        central.writeUInt32LE(offset, 42);
        centrals.push(central, nameBuf);

        offset += local.length + nameBuf.length + body.length;
    }

    const centralBuf = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralBuf.length, 12);
    end.writeUInt32LE(offset, 16);

    return Buffer.concat([...locals, centralBuf, end]);
}

main();
