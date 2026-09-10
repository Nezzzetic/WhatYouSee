// release-apk.js — release-сборка APK, её проверка и публикация (P-04).
//
//   npm run apk:release                 собрать и проверить → dist/<версия>/WhatYouSee.apk
//   npm run apk:release -- --no-analytics   то же, явно без аналитики
//   npm run apk:release -- --trust-cert     первый раз: запомнить отпечаток ключа
//   npm run publish-apk                 собрать, проверить и выложить GitHub Release
//
// Проверяется не «сборка прошла», а сам файл: подписан не debug-ключом, подписан
// ИМЕННО тем ключом, чей отпечаток лежит в android/release-cert.sha256 (подпись
// случайным новым ключом навсегда ломает обновления у всех, кто уже поставил),
// не debuggable, версия и пакет те, что в build.gradle, dev-панели внутри нет.
//
// Правило версий — dev/docs/tasks/P-04: versionCode +1 на каждый APK, покидающий
// машину, versionName от 1.0; источник обоих — android/app/build.gradle.
//
// Никаких зависимостей: голый node + то, что уже стоит для P-02 (SDK, gh).

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const ANDROID = path.join(ROOT, 'android');
const GRADLE_FILE = path.join(ANDROID, 'app', 'build.gradle');
const CERT_FILE = path.join(ANDROID, 'release-cert.sha256');
const BUILT_APK = path.join(ANDROID, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const PACKAGED_INDEX = path.join(ANDROID, 'app', 'src', 'main', 'assets', 'public', 'index.html');

const APP_ID = 'com.nezzzetic.whatyousee';
// Имя ассета постоянное — на нём держится вечная ссылка
// https://github.com/Nezzzetic/WhatYouSee/releases/latest/download/WhatYouSee.apk
const ASSET_NAME = 'WhatYouSee.apk';
const RELEASE_BRANCH = 'capacitor';

const KNOWN_FLAGS = ['--no-analytics', '--trust-cert', '--publish'];
const FLAGS = process.argv.slice(2);

function fail(msg) {
    console.error(`[release-apk] ✗ ${msg}`);
    process.exit(1);
}

function log(msg) {
    console.log(`[release-apk] ${msg}`);
}

/** Команда с выводом в консоль; ненулевой код — конец сборки. */
function runLoud(cmd, args, cwd) {
    const r = spawnSync(cmd, args, { cwd: cwd || ROOT, stdio: 'inherit', shell: true });
    if (r.status !== 0) fail(`упало: ${cmd} ${args.join(' ')}`);
}

/** Команда, чей вывод нужен скрипту. */
function runQuiet(cmd, args, opts) {
    const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', shell: true, ...opts });
    return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}

function readVersion() {
    const gradle = fs.readFileSync(GRADLE_FILE, 'utf8');
    const name = gradle.match(/versionName\s+"([^"]+)"/);
    const code = gradle.match(/versionCode\s+(\d+)/);
    if (!name || !code) fail('не нашёл versionName/versionCode в android/app/build.gradle');
    return { name: name[1], code: Number(code[1]) };
}

/** Самые свежие build-tools, где есть и apksigner, и aapt2. */
function findBuildTools() {
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    if (!sdk) fail('ANDROID_HOME не задан');
    const dir = path.join(sdk, 'build-tools');
    const byVersionDesc = (a, b) => b.localeCompare(a, undefined, { numeric: true });
    const versions = fs.existsSync(dir) ? fs.readdirSync(dir).sort(byVersionDesc) : [];
    for (const v of versions) {
        const apksigner = path.join(dir, v, 'apksigner.bat');
        const aapt2 = path.join(dir, v, 'aapt2.exe');
        if (fs.existsSync(apksigner) && fs.existsSync(aapt2)) return { apksigner, aapt2 };
    }
    fail(`в ${dir} нет build-tools с apksigner и aapt2`);
}

// =============================================================================
// До сборки: для публикации дерево должно быть тем, что лежит на GitHub
// =============================================================================

function preflightPublish(version) {
    const branch = runQuiet('git', ['rev-parse', '--abbrev-ref', 'HEAD']).out.trim();
    if (branch !== RELEASE_BRANCH) fail(`публикация только с ветки ${RELEASE_BRANCH}, сейчас ${branch}`);

    // Неотслеживаемые файлы APK не меняют (build-www.js берёт явный список),
    // отслеживаемые правки — меняют, и тогда APK не соответствует ни одному коммиту.
    const dirty = runQuiet('git', ['status', '--porcelain', '--untracked-files=no']).out.trim();
    if (dirty) fail(`есть незакоммиченные правки — APK не совпадёт с тегом:\n${dirty}`);

    runQuiet('git', ['fetch', '-q', 'origin', RELEASE_BRANCH]);
    const head = runQuiet('git', ['rev-parse', 'HEAD']).out.trim();
    const remote = runQuiet('git', ['rev-parse', `origin/${RELEASE_BRANCH}`]).out.trim();
    if (head !== remote) fail(`HEAD не совпадает с origin/${RELEASE_BRANCH} — сначала пуш`);

    const tag = `v${version.name}`;
    const remoteTag = runQuiet('git', ['ls-remote', '--tags', 'origin', `refs/tags/${tag}`]).out.trim();
    if (remoteTag) fail(`тег ${tag} уже есть — подними versionName/versionCode в build.gradle`);

    // versionCode только растёт: Android не ставит поверх APK с меньшим или равным кодом.
    // Прошлый код читается из заметок последнего релиза (строка «versionCode: N»).
    const latest = runQuiet('gh', ['release', 'view', '--json', 'body', '-q', '.body']);
    if (latest.code === 0) {
        const m = latest.out.match(/versionCode:\s*(\d+)/);
        if (!m) fail('в заметках последнего релиза нет строки «versionCode: N» — не с чем сравнить');
        if (version.code <= Number(m[1])) {
            fail(`versionCode ${version.code} не больше опубликованного ${m[1]} — подними его в build.gradle`);
        }
    } else if (!/release not found/i.test(latest.out)) {
        fail(`gh release view: ${latest.out.trim()}`);
    }
    return head;
}

// =============================================================================
// После сборки: проверяем сам файл
// =============================================================================

function verifyApk(version, tools, trustCert) {
    if (!fs.existsSync(BUILT_APK)) fail(`нет ${path.relative(ROOT, BUILT_APK)} — сборка не дала подписанный APK`);

    const sig = runQuiet(`"${tools.apksigner}"`, ['verify', '--print-certs', `"${BUILT_APK}"`]);
    if (sig.code !== 0) fail(`apksigner verify не прошёл:\n${sig.out}`);
    const signers = [...sig.out.matchAll(/Signer #\d+ certificate SHA-256 digest:\s*([0-9a-f]+)/gi)];
    if (signers.length !== 1) fail(`ожидал ровно одного подписанта, нашёл ${signers.length}`);
    if (/CN=Android Debug/.test(sig.out)) fail('APK подписан debug-ключом');
    const digest = signers[0][1].toLowerCase();

    if (fs.existsSync(CERT_FILE)) {
        const trusted = fs.readFileSync(CERT_FILE, 'utf8').trim().toLowerCase();
        if (digest !== trusted) {
            fail(`APK подписан НЕ тем ключом, что раньше:\n  ждал  ${trusted}\n  вижу  ${digest}\n` +
                'Такой APK не встанет поверх уже установленного ни у кого. Найди прежний keystore.');
        }
    } else if (trustCert) {
        fs.writeFileSync(CERT_FILE, digest + '\n', 'utf8');
        log(`отпечаток ключа записан в android/release-cert.sha256 — закоммить его: ${digest}`);
    } else {
        fail(`отпечаток ключа ещё не записан. Если это твой release-ключ — запусти с --trust-cert:\n  ${digest}`);
    }

    const badging = runQuiet(`"${tools.aapt2}"`, ['dump', 'badging', `"${BUILT_APK}"`]);
    if (badging.code !== 0) fail(`aapt2 dump badging не прошёл:\n${badging.out}`);
    const pkg = badging.out.match(/package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/);
    if (!pkg) fail('не разобрал строку package из aapt2 dump badging');
    if (pkg[1] !== APP_ID) fail(`пакет ${pkg[1]}, ждал ${APP_ID}`);
    if (Number(pkg[2]) !== version.code || pkg[3] !== version.name) {
        fail(`в APK ${pkg[3]} (${pkg[2]}), в build.gradle ${version.name} (${version.code})`);
    }
    if (/application-debuggable/.test(badging.out)) fail('APK debuggable — это не release');
    // A-08: без VIBRATE WebView отказывает navigator.vibrate() молча (isTrusted=true,
    // игра узнать не может) — регенерация android/ (P-02) может стереть правку манифеста.
    if (!/uses-permission:\s*name='android\.permission\.VIBRATE'/.test(badging.out)) {
        fail('в APK нет android.permission.VIBRATE — вибро в релизе не будет работать (A-08)');
    }

    // В APK упаковывается то, что cap sync положил сюда, а не www/.
    const packaged = fs.readFileSync(PACKAGED_INDEX, 'utf8');
    if (packaged.includes('devToggleBtn')) fail('в упакованном index.html осталась кнопка dev-панели');
    const analyticsOn = fs.existsSync(path.join(path.dirname(PACKAGED_INDEX), 'js', 'analytics.js'));

    return { digest, analyticsOn };
}

function publish(version, apkPath, sha256, commit) {
    const tag = `v${version.name}`;
    const notes = [
        `What You See ${version.name} — Android APK.`,
        '',
        'Download `WhatYouSee.apk` below and open it on the phone; Android will ask to allow',
        'installing apps from this source. Updates install over the previous version and keep progress.',
        '',
        `versionCode: ${version.code}`,
        `SHA-256 (APK): ${sha256}`,
    ].join('\n');
    const notesFile = path.join(path.dirname(apkPath), 'release-notes.md');
    fs.writeFileSync(notesFile, notes + '\n', 'utf8');
    runLoud('gh', ['release', 'create', tag, `"${apkPath}"`,
        '--target', commit, '--title', `"What You See ${version.name}"`,
        '--notes-file', `"${notesFile}"`, '--latest']);
    log(`опубликовано: https://github.com/Nezzzetic/WhatYouSee/releases/tag/${tag}`);
    log(`вечная ссылка: https://github.com/Nezzzetic/WhatYouSee/releases/latest/download/${ASSET_NAME}`);
}

function main() {
    const unknownFlag = FLAGS.find(f => !KNOWN_FLAGS.includes(f));
    if (unknownFlag) fail(`незнакомый флаг ${unknownFlag}; знаю: ${KNOWN_FLAGS.join(', ')}`);
    const doPublish = FLAGS.includes('--publish');

    const version = readVersion();
    const tools = findBuildTools();
    log(`версия ${version.name} (${version.code})`);

    const commit = doPublish ? preflightPublish(version) : null;

    // Старый APK удаляется заранее: иначе упавшая на подписи сборка оставила бы
    // прошлый файл, и проверка ниже прошла бы по нему.
    fs.rmSync(BUILT_APK, { force: true });

    const wwwFlags = ['--release'];
    if (FLAGS.includes('--no-analytics')) wwwFlags.push('--no-analytics');
    runLoud('node', ['scripts/build-www.js', ...wwwFlags]);
    runLoud('npx', ['cap', 'sync', 'android']);
    runLoud('.\\gradlew.bat', ['assembleRelease'], ANDROID);

    const { digest, analyticsOn } = verifyApk(version, tools, FLAGS.includes('--trust-cert'));

    const outDir = path.join(ROOT, 'dist', version.name);
    fs.mkdirSync(outDir, { recursive: true });
    const outApk = path.join(outDir, ASSET_NAME);
    fs.copyFileSync(BUILT_APK, outApk);
    const sha256 = crypto.createHash('sha256').update(fs.readFileSync(outApk)).digest('hex');
    const mb = (fs.statSync(outApk).size / 1024 / 1024).toFixed(2);

    log(`✓ ${path.relative(ROOT, outApk)} — ${mb} МБ, SHA-256 ${sha256}`);
    log(`  ключ ${digest}`);
    log(`  аналитика ${analyticsOn ? 'ВКЛЮЧЕНА' : 'ВЫКЛЮЧЕНА'}, dev-панели нет, не debuggable`);

    if (doPublish) publish(version, outApk, sha256, commit);
}

main();
