// electron-builder Hook — läuft nach dem Packen, vor dem eigentlichen Signieren.
//
// Ohne Apple-Developer-ID überspringt electron-builder das Signieren komplett.
// Das gepackte Bundle trägt dann nur noch die geerbte, "linker-signed"
// Ad-hoc-Signatur der Electron-Binary — mit Identifier "Electron" und ohne
// versiegelte Ressourcen. Zwei Folgen:
//   1. Auf Apple Silicon ist eine gültige Signatur Pflicht; eine unversiegelte
//      erhöht das Risiko, dass macOS das Bundle als beschädigt ablehnt.
//   2. safeStorage hängt den Keychain-Eintrag an die Code-Identität. Mit dem
//      Fremd-Identifier "Electron" wird der AES-Schlüssel bei jedem Rebuild
//      neu angelegt — der verschlüsselte Store wäre dann nicht mehr lesbar.
//
// Deshalb hier eine saubere Ad-hoc-Signatur mit der echten App-ID. Liegt eine
// Developer ID vor, überschreibt electron-builder sie im nächsten Schritt.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const identifier = context.packager.appInfo.id;

  try {
    execFileSync('codesign', [
      '--force',
      '--deep',
      '--sign', '-',
      '--identifier', identifier,
      appPath,
    ], { stdio: 'pipe' });
    console.log(`  • ad-hoc signiert  identifier=${identifier}`);
  } catch (error) {
    // Nicht fatal — der Build bleibt brauchbar, nur eventuell mit
    // Gatekeeper-Reibung beim ersten Start.
    console.warn(`  • Ad-hoc-Signatur fehlgeschlagen: ${error.stderr?.toString() || error.message}`);
  }
};
