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
