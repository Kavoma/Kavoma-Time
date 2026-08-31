#!/usr/bin/env node
// ============================================================
// Tag vor dem Veröffentlichen setzen
// ============================================================
// Ohne vorhandenen Tag legt electron-builder das GitHub-Release selbst an —
// und erzeugt den Tag dabei als Nebenwirkung. Das geht schief, sobald mehrere
// Artefakte gleichzeitig hochgeladen werden: Jedes Artefakt startet einen
// eigenen Publisher, alle sehen "Release existiert nicht", alle wollen es
// anlegen. Einer gewinnt, die übrigen bekommen
//
//   422 Unprocessable Entity — "Published releases must have a valid tag"
//
// und mit ihnen stirbt ihr Upload. Beim 1.1.2-Release blieb so nur die
// .blockmap übrig, der Installer fehlte — ein Release, das aussieht als wäre
// es fertig, aus dem sich aber nichts herunterladen lässt.
//
// Existiert der Tag vorher, findet jeder Publisher dasselbe Release vor und
// hängt sein Artefakt einfach an.

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const lauf = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim();

const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const tag = `v${version}`;

// Nichts taggen, was nicht committet ist — der Tag zeigte sonst auf einen
// Stand, den es nirgends gibt.
if (lauf('git status --porcelain')) {
  console.error('✗ Es liegen uncommittete Änderungen vor. Erst committen, dann taggen.');
  process.exit(1);
}

const zweig = lauf('git rev-parse --abbrev-ref HEAD');
if (zweig !== 'master') {
  console.error(`✗ Aktueller Branch ist "${zweig}". Releases werden von master gebaut.`);
  process.exit(1);
}

const vorhanden = lauf('git tag --list ' + tag);
if (vorhanden) {
  const zeigtAuf = lauf(`git rev-list -n 1 ${tag}`);
  const kopf = lauf('git rev-parse HEAD');
  if (zeigtAuf !== kopf) {
    console.error(`✗ ${tag} existiert schon und zeigt auf ${zeigtAuf.slice(0, 7)}, HEAD ist ${kopf.slice(0, 7)}.`);
    console.error('  Entweder die Version hochzählen oder den alten Tag bewusst entfernen.');
    process.exit(1);
  }
  console.log(`• ${tag} existiert bereits und zeigt richtig — nichts zu tun.`);
} else {
  lauf(`git tag -a ${tag} -m "Kavoma Time ${version}"`);
  console.log(`• ${tag} angelegt`);
}

lauf(`git push origin ${tag}`);
console.log(`• ${tag} nach GitHub geschoben`);
console.log('\nJetzt kann veröffentlicht werden: pnpm dist:publish bzw. dist:publish:mac');
