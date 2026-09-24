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

function git(args, opts) {
    return execFileSync('git', args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, ...opts });
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
    const outFile = path.join(outDir, `WhatYouSee-itch-${sha}.zip`);

    const entries = files.map(name => ({ name, data: git(['show', `HEAD:${name}`]) }));
    fs.writeFileSync(outFile, buildZip(entries));

    const kb = Math.round(fs.statSync(outFile).size / 1024);
    console.log(`[build-itch] ${files.length} файлов → ${path.relative(ROOT, outFile)} (${kb} КБ)`);
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
