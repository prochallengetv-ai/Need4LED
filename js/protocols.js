/**
 * Need4Led — Protocol Definitions & Frame Encoders
 * Supporta i protocolli di illuminazione BLE più diffusi sui controller aftermarket (LotusLantern, ELK-BLEDOM, Triones)
 */

export const Protocols = {
  LOTUS_STANDARD: 'lotus_standard',
  LOTUS_V2: 'lotus_v2',
  TRIONES: 'triones',
  RAW: 'raw'
};

export const PROTOCOL_CONFIGS = {
  [Protocols.LOTUS_STANDARD]: {
    name: 'LotusLantern / ELK-BLEDOM (Standard 9-byte)',
    defaultServiceUuid: '0000fff0-0000-1000-8000-00805f9b34fb',
    defaultCharUuid: '0000fff3-0000-1000-8000-00805f9b34fb',
    preferredWriteType: 'withoutResponse'
  },
  [Protocols.LOTUS_V2]: {
    name: 'LotusLantern Variant 2 (Index 0x04)',
    defaultServiceUuid: '0000fff0-0000-1000-8000-00805f9b34fb',
    defaultCharUuid: '0000fff3-0000-1000-8000-00805f9b34fb',
    preferredWriteType: 'withoutResponse'
  },
  [Protocols.TRIONES]: {
    name: 'Triones / HappyLighting',
    defaultServiceUuid: '0000ffd5-0000-1000-8000-00805f9b34fb',
    defaultCharUuid: '0000ffd9-0000-1000-8000-00805f9b34fb',
    preferredWriteType: 'withoutResponse'
  },
  [Protocols.RAW]: {
    name: 'Comando Hex Personalizzato',
    defaultServiceUuid: '0000fff0-0000-1000-8000-00805f9b34fb',
    defaultCharUuid: '0000fff3-0000-1000-8000-00805f9b34fb',
    preferredWriteType: 'withoutResponse'
  }
};

/**
 * Converte un array o Uint8Array in stringa esadecimale formattata (es: "7E 00 04 F0 ...")
 */
export function bytesToHex(bytes) {
  if (!bytes) return '';
  const arr = bytes instanceof Uint8Array ? Array.from(bytes) : bytes;
  return arr.map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

/**
 * Converte una stringa esadecimale (es: "7E 00 04" o "7E0004") in Uint8Array
 */
export function hexToBytes(hexString) {
  const cleanHex = hexString.replace(/[^0-9A-Fa-f]/g, '');
  if (cleanHex.length % 2 !== 0) {
    throw new Error('Stringa esadecimale non valida: lunghezza dispari');
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Limita un valore numerico tra min e max intero
 */
function clamp(val, min, max) {
  return Math.min(Math.max(Math.round(val), min), max);
}

/**
 * Generatori di comandi per LotusLantern Standard (Frame da 9 byte)
 * Header: 0x7E, Terminator: 0xEF
 */
export const LotusStandardEncoder = {
  power(on) {
    // ON:  7E 00 04 F0 00 01 FF 00 EF
    // OFF: 7E 00 04 00 00 00 FF 00 EF
    return new Uint8Array(
      on
        ? [0x7E, 0x00, 0x04, 0xF0, 0x00, 0x01, 0xFF, 0x00, 0xEF]
        : [0x7E, 0x00, 0x04, 0x00, 0x00, 0x00, 0xFF, 0x00, 0xEF]
    );
  },

  color(r, g, b) {
    // 7E 00 05 03 RR GG BB 00 EF
    return new Uint8Array([
      0x7E,
      0x00,
      0x05,
      0x03,
      clamp(r, 0, 255),
      clamp(g, 0, 255),
      clamp(b, 0, 255),
      0x00,
      0xEF
    ]);
  },

  brightness(percent) {
    // 7E 00 01 LEVEL 00 00 00 00 EF (LEVEL: 0x00 .. 0x64)
    const level = clamp(percent, 0, 100);
    return new Uint8Array([0x7E, 0x00, 0x01, level, 0x00, 0x00, 0x00, 0x00, 0xEF]);
  }
};

/**
 * Generatori per LotusLantern Variante 2 (Index byte 0x04 anziché 0x00)
 */
export const LotusV2Encoder = {
  power(on) {
    return new Uint8Array(
      on
        ? [0x7E, 0x04, 0x04, 0xF0, 0x00, 0x01, 0xFF, 0x00, 0xEF]
        : [0x7E, 0x04, 0x04, 0x00, 0x00, 0x00, 0xFF, 0x00, 0xEF]
    );
  },

  color(r, g, b) {
    return new Uint8Array([
      0x7E,
      0x04,
      0x05,
      0x03,
      clamp(r, 0, 255),
      clamp(g, 0, 255),
      clamp(b, 0, 255),
      0x00,
      0xEF
    ]);
  },

  brightness(percent) {
    const level = clamp(percent, 0, 100);
    return new Uint8Array([0x7E, 0x04, 0x01, level, 0x00, 0x00, 0x00, 0x00, 0xEF]);
  }
};

/**
 * Generatori per Triones / HappyLighting
 */
export const TrionesEncoder = {
  power(on) {
    // ON:  CC 23 33
    // OFF: CC 24 33
    return new Uint8Array(on ? [0xCC, 0x23, 0x33] : [0xCC, 0x24, 0x33]);
  },

  color(r, g, b) {
    // 56 RR GG BB 00 F0 AA
    return new Uint8Array([
      0x56,
      clamp(r, 0, 255),
      clamp(g, 0, 255),
      clamp(b, 0, 255),
      0x00,
      0xF0,
      0xAA
    ]);
  },

  brightness(percent) {
    // 56 00 00 00 LEVEL 0F AA (LEVEL: 0x00 .. 0x64)
    const level = clamp(percent, 0, 100);
    return new Uint8Array([0x56, 0x00, 0x00, 0x00, level, 0x0F, 0xAA]);
  }
};

/**
 * Factory che restituisce l'encoder per il protocollo specificato
 */
export function getEncoder(protocol) {
  switch (protocol) {
    case Protocols.LOTUS_V2:
      return LotusV2Encoder;
    case Protocols.TRIONES:
      return TrionesEncoder;
    case Protocols.LOTUS_STANDARD:
    default:
      return LotusStandardEncoder;
  }
}
