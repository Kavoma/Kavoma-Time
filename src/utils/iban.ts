/**
 * IBAN Validierung nach MOD 97 Verfahren
 */
export function isValidIban(iban: string): boolean {
  const sanitized = iban.replace(/\s+/g, '').toUpperCase();
  if (sanitized.length < 15 || sanitized.length > 34) return false;

  const rearranged = sanitized.slice(4) + sanitized.slice(0, 4);
  let numeric = '';
  for (let i = 0; i < rearranged.length; i++) {
    const code = rearranged.charCodeAt(i);
    if (code >= 65 && code <= 90) { // A-Z
      numeric += (code - 55).toString();
    } else if (code >= 48 && code <= 57) { // 0-9
      numeric += rearranged[i];
    } else {
      return false;
    }
  }

  try {
    return BigInt(numeric) % 97n === 1n;
  } catch (e) {
    return false;
  }
}

/**
 * Holt den Banknamen anhand der BLZ (nur für deutsche IBANs)
 */
const COMMON_BANKS: Record<string, string> = {
  // Großbanken & Klassiker
  '10010010': 'Postbank',
  '10010111': 'Postbank',
  '10020000': 'Berliner Bank',
  '10050000': 'Berliner Sparkasse',
  '10070000': 'Deutsche Bank',
  '12030000': 'DKB (Deutsche Kreditbank)',
  '20040000': 'Commerzbank',
  '20050550': 'Haspa (Hamburger Sparkasse)',
  '30020900': 'Targobank',
  '31010833': 'Santander',
  '37050198': 'Sparkasse KölnBonn',
  '50010517': 'ING-DiBa',
  '50050201': '1822direkt',
  '60050101': 'BW-Bank',
  '70020270': 'HypoVereinsbank',
  '70150000': 'Stadtsparkasse München',

  // Neo-Banken & Fintechs
  '10011001': 'N26 / Solaris / Trade Republic',
  '11010100': 'Solaris SE',
  '37019000': 'bunq (German Branch)',
  '70022200': 'Fidor Bank',

  // Spezial- & Business-Banken
  '43060967': 'GLS Bank',
  '50031000': 'Triodos Bank',
  '83094495': 'EthikBank',
  '20030000': 'netbank',
};

export function getBankName(iban: string): string | null {
  const sanitized = iban.replace(/\s+/g, '').toUpperCase();
  if (!sanitized.startsWith('DE') || sanitized.length < 12) return null;

  const blz = sanitized.substring(4, 12);
  return COMMON_BANKS[blz] || null;
}

/**
 * Validiert BIC (einfacher Regex)
 */
export function isValidBic(bic: string): boolean {
  const sanitized = bic.replace(/\s+/g, '').toUpperCase();
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(sanitized);
}

/**
 * Formatiert IBAN in 4er Blöcke
 */
export function formatIban(v: string): string {
  const sanitized = v.replace(/\s+/g, '').toUpperCase();
  const parts = sanitized.match(/.{1,4}/g);
  return parts ? parts.join(' ') : sanitized;
}

/**
 * Formatiert BIC (einfach nur Uppercase)
 */
export function formatBic(v: string): string {
  return v.replace(/\s+/g, '').toUpperCase();
}

/**
 * Formatiert Telefonnummer (+49 123 456789)
 * Berücksichtigt gängige deutsche Mobilfunkvorwahlen
 */
export function formatPhone(v: string): string {
  let cleaned = v.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2);
  if (cleaned.startsWith('0')) cleaned = '+49' + cleaned.slice(1);

  if (cleaned.startsWith('+49')) {
    const rest = cleaned.slice(3);

    // Mobilfunk-Heuristik für Deutschland
    // 15x, 16x, 17x sind typisch
    if (rest.startsWith('15') || rest.startsWith('16') || rest.startsWith('17')) {
      // 15x und 16x haben oft 4 Stellen nach +49 (z.B. 1575)
      if ((rest.startsWith('15') || rest.startsWith('16')) && rest.length > 4) {
        return `+49 ${rest.slice(0, 4)} ${rest.slice(4)}`;
      }
      // 17x hat oft 3 Stellen nach +49 (z.B. 171)
      if (rest.startsWith('17') && rest.length > 3) {
        return `+49 ${rest.slice(0, 3)} ${rest.slice(3)}`;
      }
    }

    // Standard-Fallback: Nach 3 Stellen trennen
    if (rest.length > 3) {
      return `+49 ${rest.slice(0, 3)} ${rest.slice(3)}`;
    }
    return `+49 ${rest}`;
  }
  return cleaned;
}

/**
 * Formatiert Steuernummer / USt-IdNr / Steuer-IdNr
 * DE123456789 -> DE 123 456 789
 * 76340894519 -> 76 340 894 519 (Steuer-IdNr)
 */
export function formatTaxId(v: string): string {
  const sanitized = v.replace(/\s+/g, '').toUpperCase();

  // USt-IdNr (DE...)
  if (sanitized.startsWith('DE')) {
    const num = sanitized.slice(2);
    const parts = num.match(/.{1,3}/g);
    return `DE ${parts ? parts.join(' ') : num}`;
  }

  // Steuer-Identifikationsnummer (11 Stellen)
  if (/^\d{11}$/.test(sanitized)) {
    return `${sanitized.slice(0, 2)} ${sanitized.slice(2, 5)} ${sanitized.slice(5, 8)} ${sanitized.slice(8, 11)}`;
  }

  return sanitized;
}
