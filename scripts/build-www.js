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
const ITEMS = ['index.html', 'css', 'js', 'images'];

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
        fs.cpSync(src, path.join(WWW, item), { recursive: true });
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

    console.log(`[build-www] www/ собран: ${files} файлов, ${(bytes / 1024 / 1024).toFixed(2)} МБ`);
}

main();
