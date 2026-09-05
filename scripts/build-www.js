// build-www.js — собирает веб-корень для Capacitor (P-02).
//
// Веб-корень игры совпадает с корнем репозитория, а рядом лежат .git со всей
// историей и служебные файлы. `cap copy` тащит содержимое webDir целиком,
// поэтому webDir не может быть корнем: история публичного репозитория уехала бы
// внутрь APK. Скрипт копирует в www/ ровно то, что нужно игре, и ничего больше.
//
// Никаких зависимостей: голый node, как и вся остальная сборка проекта.
//
//   node scripts/build-www.js

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const WWW = path.join(ROOT, 'www');

// Всё, что нужно игре в рантайме. Список явный, а не «всё кроме» — иначе любой
// новый служебный файл в корне молча уедет в APK.
const ITEMS = ['index.html', 'css', 'js', 'images', 'music'];

// A-07: из music/ едут только пережатые треки. Рядом с ними лежит masters/ —
// оригиналы 320 kbps на 25 МБ, втрое тяжелее всей остальной сборки. В git их
// нет (.gitignore), но cpSync ходит по файловой системе, а не по индексу, и без
// явного отсева они уехали бы в APK у любого, кто скачал их себе для пережатия.
// CREDITS.md отсеивается по тому же правилу «ровно то, что нужно игре»: это
// док разработчика (адреса скачивания, рецепт пережатия), а видимое игроку
// указание авторства живёт на странице настроек, а не файлом в пакете.
const EXCLUDED = [path.join('music', 'masters'), path.join('music', 'CREDITS.md')];

function isExcluded(src) {
    const rel = path.relative(ROOT, src);
    return EXCLUDED.some(ex => rel === ex || rel.startsWith(ex + path.sep));
}

// =============================================================================
// P-05: адрес приёма аналитики
// =============================================================================
//
// На `main` блок CONFIG в js/analytics.js пуст, и модуль там инертен целиком —
// у Pages и itch внешних запросов ноль, это утверждение стерегут
// verify-book-system.js и verify-analytics.js. Настоящий адрес живёт ТОЛЬКО в
// сборке APK и подставляется здесь, в www/, а не в исходнике.
//
// Ключ проекта PostHog по замыслу публичный (пишет события, читать данные им
// нельзя), но в репозиторий он всё равно не кладётся: репозиторий публичный,
// а лишний повод его туда занести — не повод. Он лежит в `analytics.local.json`
// рядом со сборкой, под .gitignore.
//
// ⚠ Отсутствие файла сборку НЕ валит, в отличие от охран p5 и музыки: собрать
// APK без аналитики — законный случай (свежий клон, чужая машина). Но молчать
// об этом нельзя — APK без аналитики выглядит точно так же, как с ней, и его
// легко раздать, ожидая данных. Поэтому строка в логе печатается ВСЕГДА, в обе
// стороны. Испорченный файл — уже не выбор, а ошибка, и он сборку валит.
const ANALYTICS_LOCAL = path.join(ROOT, 'analytics.local.json');

function readAppVersion() {
    try {
        const gradle = fs.readFileSync(
            path.join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');
        const name = gradle.match(/versionName\s+"([^"]+)"/);
        const code = gradle.match(/versionCode\s+(\d+)/);
        if (name && code) return `${name[1]} (${code[1]})`;
    } catch (e) { /* сборка без android/ — версии просто не будет */ }
    return 'unknown';
}

function injectAnalyticsConfig() {
    const target = path.join(WWW, 'js', 'analytics.js');
    const marker = /(\/\/ >>> P-05 CONFIG)[\s\S]*?(\/\/ <<< P-05 CONFIG)/;
    const src = fs.readFileSync(target, 'utf8');
    if (!marker.test(src)) {
        console.error('[build-www] в js/analytics.js нет маркеров P-05 CONFIG — подставить адрес некуда');
        process.exit(1);
    }

    if (!fs.existsSync(ANALYTICS_LOCAL)) {
        console.log('[build-www] [analytics] ВЫКЛЮЧЕНА: нет analytics.local.json — APK не пришлёт ни одного события');
        return;
    }

    let cfg;
    try {
        cfg = JSON.parse(fs.readFileSync(ANALYTICS_LOCAL, 'utf8'));
    } catch (e) {
        console.error('[build-www] analytics.local.json не читается как JSON: ' + e.message);
        process.exit(1);
    }

    // Значения не экранируются, а ПРОВЕРЯЮТСЯ: строгий формат надёжнее любого
    // экранирования — в JS-литерал попадает только то, что не может его сломать.
    const host = String(cfg.host || '');
    const key = String(cfg.key || '');
    if (!/^https:\/\/[A-Za-z0-9.-]+$/.test(host)) {
        console.error(`[build-www] analytics.local.json: host должен быть https-адресом без пути, получено "${host}"`);
        process.exit(1);
    }
    if (!/^phc_[A-Za-z0-9_-]+$/.test(key)) {
        console.error('[build-www] analytics.local.json: key должен быть ключом проекта PostHog (phc_…)');
        process.exit(1);
    }

    const build = readAppVersion();
    const block = `$1
    const CONFIG = { host: '${host}', key: '${key}', channel: 'apk', build: '${build}' };
    $2`;
    fs.writeFileSync(target, src.replace(marker, block), 'utf8');
    console.log(`[build-www] [analytics] включена: ${host}, канал apk, сборка ${build}`);
}

function main() {
    // www/ пересобирается с нуля: иначе удалённый в репозитории файл остаётся
    // жить в сборке и APK расходится с исходниками.
    fs.rmSync(WWW, { recursive: true, force: true });
    fs.mkdirSync(WWW, { recursive: true });

    let files = 0;
    let bytes = 0;

    for (const item of ITEMS) {
        const src = path.join(ROOT, item);
        if (!fs.existsSync(src)) {
            console.error(`[build-www] НЕТ ИСХОДНИКА: ${item}`);
            process.exit(1);
        }
        fs.cpSync(src, path.join(WWW, item), { recursive: true, filter: from => !isExcluded(from) });
    }

    injectAnalyticsConfig();

    // Считаем то, что реально легло, — цифра ловит и пустую копию, и раздувшийся
    // images/ раньше, чем это заметит вес APK.
    (function walk(dir) {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else { files += 1; bytes += fs.statSync(full).size; }
        }
    })(WWW);

    // Страховка от главной ошибки этой сборки: p5 вендорится (P-02, шаг 1),
    // и если файла нет — APK стартует в пустоту, причём только без сети.
    const p5 = path.join(WWW, 'js', 'vendor', 'p5.min.js');
    if (!fs.existsSync(p5)) {
        console.error('[build-www] НЕТ js/vendor/p5.min.js — офлайн игра не запустится');
        process.exit(1);
    }

    // A-07: страница настроек обещает музыку и называет авторов — пакет без
    // треков не падает, он просто молча врёт. На глаз в APK это не видно.
    const musicDir = path.join(WWW, 'music');
    const tracks = fs.existsSync(musicDir) ? fs.readdirSync(musicDir).filter(f => f.endsWith('.mp3')) : [];
    if (tracks.length === 0) {
        console.error('[build-www] НЕТ music/*.mp3 — настройки обещают музыку, которой в APK не будет');
        process.exit(1);
    }
    if (fs.existsSync(path.join(musicDir, 'masters'))) {
        console.error('[build-www] в www/ уехали мастера 320 kbps — APK потяжелел на 25 МБ впустую');
        process.exit(1);
    }

    console.log(`[build-www] www/ собран: ${files} файлов, ${(bytes / 1024 / 1024).toFixed(2)} МБ`);
}

main();
