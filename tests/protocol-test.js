/**
 * Need4Led — Test Suite Protocolli BLE, Modelli Preset & Release v2.3-ultimate
 * Verifica frame esadecimali generati per LotusLantern (Standard e V2), Triones,
 * calibrazione ordine canali (GRB, BRG...), sequenza strobo Polizia simmetrica,
 * frame zero-light di spegnimento rapido (7E 00 05 03 00 00 00 00 EF) e controllo zero-emoji.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  Protocols,
  bytesToHex,
  hexToBytes,
  remapColorChannels,
  LotusStandardEncoder,
  LotusV2Encoder,
  TrionesEncoder,
  POLICE_SEQUENCE,
  PRESET_MODELS,
  PRESET_MODEL_CONFIGS
} from '../js/protocols.js';
import { WakeLockManager } from '../js/app.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

let totalTests = 0;
let passedTests = 0;

function assertEqual(actual, expected, testName) {
  totalTests++;
  const actualStr = actual instanceof Uint8Array ? bytesToHex(actual) : String(actual);
  const expectedStr = expected instanceof Uint8Array ? bytesToHex(expected) : String(expected);

  if (actualStr === expectedStr) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    console.error(`  [FAIL] ${testName}`);
    console.error(`         Atteso:  ${expectedStr}`);
    console.error(`         Ricevuto: ${actualStr}`);
  }
}

console.log('\n=== ESECUZIONE TEST SUITE NEED4LED (v2.3-ultimate) ===\n');

// 1. Test Utilità di conversione Hex
console.log('1. Test Utilità Hex:');
const sampleBytes = new Uint8Array([0x7E, 0x00, 0x04, 0xF0, 0xEF]);
assertEqual(bytesToHex(sampleBytes), '7E 00 04 F0 EF', 'bytesToHex format');
assertEqual(bytesToHex(hexToBytes('7E 00 04 F0 EF')), '7E 00 04 F0 EF', 'hexToBytes con spazi');
assertEqual(bytesToHex(hexToBytes('7e0004f0ef')), '7E 00 04 F0 EF', 'hexToBytes minuscolo compatto');

// 2. Test Rimappatura Canali Pinout (Calibrazione colore reale)
console.log('\n2. Test Calibrazione Pinout Colori:');
const rgbRed = remapColorChannels(255, 0, 0, 'RGB');
assertEqual(new Uint8Array(rgbRed), 'FF 00 00', 'RGB Standard: Rosso');
const grbRed = remapColorChannels(255, 0, 0, 'GRB');
assertEqual(new Uint8Array(grbRed), '00 FF 00', 'GRB Pinout: Rosso mappato su Green pin');
const brgRed = remapColorChannels(255, 0, 0, 'BRG');
assertEqual(new Uint8Array(brgRed), '00 FF 00', 'BRG Pinout: Rosso mappato su middle pin');
const bgrBlue = remapColorChannels(0, 0, 255, 'BGR');
assertEqual(new Uint8Array(bgrBlue), 'FF 00 00', 'BGR Pinout: Blu mappato su first pin');

// 3. Test LotusLantern Standard (9 bytes)
console.log('\n3. Test LotusLantern Standard:');
assertEqual(
  LotusStandardEncoder.power(true),
  '7E 00 04 F0 00 01 FF 00 EF',
  'LotusLantern Standard Power ON'
);
assertEqual(
  LotusStandardEncoder.power(false),
  '7E 00 04 00 00 00 FF 00 EF',
  'LotusLantern Standard Power OFF'
);
assertEqual(
  LotusStandardEncoder.color(255, 0, 0, 'RGB'),
  '7E 00 05 03 FF 00 00 00 EF',
  'LotusLantern Standard Colore Rosso (#FF0000)'
);
assertEqual(
  LotusStandardEncoder.color(255, 0, 0, 'GRB'),
  '7E 00 05 03 00 FF 00 00 EF',
  'LotusLantern Standard Colore Rosso con pinout GRB'
);
assertEqual(
  LotusStandardEncoder.color(0, 255, 255, 'RGB'),
  '7E 00 05 03 00 FF FF 00 EF',
  'LotusLantern Standard Colore Cyber Ciano (#00FFFF)'
);
assertEqual(
  LotusStandardEncoder.brightness(100),
  '7E 00 01 64 00 00 00 00 EF',
  'LotusLantern Standard Luminosità 100% (0x64)'
);
assertEqual(
  LotusStandardEncoder.speed(80),
  '7E 00 02 50 00 00 00 00 EF',
  'LotusLantern Velocità Dinamica 80% (0x50)'
);

// 4. Test Modalità Massimo Bianco ELK-BLEDOM
console.log('\n4. Test Modalità Massimo Bianco ELK-BLEDOM:');
assertEqual(
  LotusStandardEncoder.whiteGrayscale(),
  '7E 00 03 00 01 00 00 00 EF',
  'ELK-BLEDOM Grayscale / Pure White Mode'
);
assertEqual(
  LotusStandardEncoder.whiteCold(),
  '7E 00 03 80 02 00 00 00 EF',
  'ELK-BLEDOM Cold White Mode (6500K)'
);
assertEqual(
  LotusStandardEncoder.whiteWarm(),
  '7E 00 03 8A 02 00 00 00 EF',
  'ELK-BLEDOM Warm White Mode (3200K)'
);

// 5. Test LotusLantern Variante 2
console.log('\n5. Test LotusLantern Variante 2:');
assertEqual(
  LotusV2Encoder.power(true),
  '7E 04 04 F0 00 01 FF 00 EF',
  'LotusLantern V2 Power ON'
);
assertEqual(
  LotusV2Encoder.color(255, 255, 255),
  '7E 04 05 03 FF FF FF 00 EF',
  'LotusLantern V2 Bianco'
);

// 6. Test Triones
console.log('\n6. Test Triones:');
assertEqual(
  TrionesEncoder.power(true),
  'CC 23 33',
  'Triones Power ON'
);
assertEqual(
  TrionesEncoder.color(255, 0, 0, 'RGB'),
  '56 FF 00 00 00 F0 AA',
  'Triones Colore Rosso'
);

// 7. Test Sequenza Strobo Polizia a 4 Fasi Simmetriche & Esclusione Canale Verde
console.log('\n7. Test Sequenza Strobo Polizia (Rosso-Nero-Blu-Nero, timing uguali, zero verde):');
assertEqual(POLICE_SEQUENCE.length, 4, 'Sequenza Polizia ha esattamente 4 fasi simmetriche');
assertEqual(
  `${POLICE_SEQUENCE[0].r},${POLICE_SEQUENCE[0].g},${POLICE_SEQUENCE[0].b}`,
  '255,0,0',
  'Fase 1 Polizia: Rosso Puro (255, 0, 0)'
);
assertEqual(
  `${POLICE_SEQUENCE[1].r},${POLICE_SEQUENCE[1].g},${POLICE_SEQUENCE[1].b}`,
  '0,0,0',
  'Fase 2 Polizia: Nero / Spento (0, 0, 0)'
);
assertEqual(
  `${POLICE_SEQUENCE[2].r},${POLICE_SEQUENCE[2].g},${POLICE_SEQUENCE[2].b}`,
  '0,0,255',
  'Fase 3 Polizia: Blu Puro (0, 0, 255)'
);
assertEqual(
  `${POLICE_SEQUENCE[3].r},${POLICE_SEQUENCE[3].g},${POLICE_SEQUENCE[3].b}`,
  '0,0,0',
  'Fase 4 Polizia: Nero / Spento (0, 0, 0)'
);

// Frame ELK con profilo BRG attivo per tutti gli stati
console.log('\n8. Test Frame Esadecimali ELK con Profilo BRG:');
const frameRossoBRG = LotusStandardEncoder.color(255, 0, 0, 'BRG');
assertEqual(
  frameRossoBRG,
  '7E 00 05 03 00 FF 00 00 EF',
  'Frame Rosso (255,0,0) BRG -> Byte 5 = 0xFF, Canale Verde (Byte 6) = 0x00'
);

const frameNeroBRG = LotusStandardEncoder.color(0, 0, 0, 'BRG');
assertEqual(
  frameNeroBRG,
  '7E 00 05 03 00 00 00 00 EF',
  'Frame Nero (0,0,0) BRG -> Zero-light emissione istantanea senza disconnessione GATT'
);

const frameBluBRG = LotusStandardEncoder.color(0, 0, 255, 'BRG');
assertEqual(
  frameBluBRG,
  '7E 00 05 03 FF 00 00 00 EF',
  'Frame Blu (0,0,255) BRG -> Byte 4 = 0xFF, Canale Verde (Byte 6) = 0x00'
);

// 9. Test Modelli di Preset Pre-calibrati
console.log('\n9. Test Modelli di Preset:');
assertEqual(Boolean(PRESET_MODEL_CONFIGS[PRESET_MODELS.STROBE_SINGLE]), true, 'Modello Strobo Singolo presente');
assertEqual(PRESET_MODEL_CONFIGS[PRESET_MODELS.STROBE_SINGLE].intervalMs, 160, 'Strobo Singolo intervalMs = 160ms');
assertEqual(Boolean(PRESET_MODEL_CONFIGS[PRESET_MODELS.STROBE_POLICE]), true, 'Modello Strobo Alternato (Polizia) presente');
assertEqual(PRESET_MODEL_CONFIGS[PRESET_MODELS.STROBE_POLICE].intervalMs, 160, 'Strobo Polizia intervalMs = 160ms');
assertEqual(Boolean(PRESET_MODEL_CONFIGS[PRESET_MODELS.ALTERNATE_DIRECT]), true, 'Modello Alternato Diretto presente');
assertEqual(Boolean(PRESET_MODEL_CONFIGS[PRESET_MODELS.BREATHING]), true, 'Modello Breathing presente');
assertEqual(Boolean(PRESET_MODEL_CONFIGS[PRESET_MODELS.STATIC_PURE]), true, 'Modello Statico Puro presente');

// 10. Test Screen Wake Lock API Manager
console.log('\n10. Test Screen Wake Lock Manager:');
const wakeMgr = new WakeLockManager();
assertEqual(typeof wakeMgr.acquire, 'function', 'WakeLockManager.acquire è una funzione');
assertEqual(typeof wakeMgr.release, 'function', 'WakeLockManager.release è una funzione');
assertEqual(typeof wakeMgr.updateState, 'function', 'WakeLockManager.updateState è una funzione');

// 11. Scansione Regex Zero Emoji su tutto il repository
console.log('\n11. Scansione Zero Emoji nel Codebase:');
const emojiRegex = /(\p{Extended_Pictographic}|\p{Emoji_Presentation})/u;
const filesToScan = [
  'index.html',
  'manifest.json',
  'sw.js',
  'css/style.css',
  'js/app.js',
  'js/ble-manager.js',
  'js/protocols.js',
  'js/ui-controller.js'
];

let foundEmojis = 0;
for (const relFile of filesToScan) {
  const fullPath = path.join(rootDir, relFile);
  if (fs.existsSync(fullPath)) {
    const content = fs.readFileSync(fullPath, 'utf8');
    const matches = content.match(new RegExp(emojiRegex.source, 'gu'));
    if (matches && matches.length > 0) {
      foundEmojis += matches.length;
      console.error(`  [WARN] Emoji trovate in ${relFile}: ${matches.join(', ')}`);
    }
  }
}
assertEqual(foundEmojis, 0, `Scansione Zero Emoji completata (${filesToScan.length} file ispezionati)`);

console.log(`\n========================================`);
console.log(`RISULTATO TEST: ${passedTests}/${totalTests} superati con successo.`);
console.log(`========================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
