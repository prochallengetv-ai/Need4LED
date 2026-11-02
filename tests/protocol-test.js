/**
 * Need4Led — Test Suite Protocolli BLE
 * Verifica frame esadecimali generati per LotusLantern (Standard e V2), Triones,
 * calibrazione ordine canali (GRB, BRG...) e modalità Massimo Bianco ELK-BLEDOM.
 */

import {
  Protocols,
  bytesToHex,
  hexToBytes,
  remapColorChannels,
  LotusStandardEncoder,
  LotusV2Encoder,
  TrionesEncoder
} from '../js/protocols.js';

let totalTests = 0;
let passedTests = 0;

function assertEqual(actual, expected, testName) {
  totalTests++;
  const actualStr = actual instanceof Uint8Array ? bytesToHex(actual) : actual;
  const expectedStr = expected instanceof Uint8Array ? bytesToHex(expected) : expected;

  if (actualStr === expectedStr) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    console.error(`  [FAIL] ${testName}`);
    console.error(`         Atteso:  ${expectedStr}`);
    console.error(`         Ricevuto: ${actualStr}`);
  }
}

console.log('\n=== ESECUZIONE TEST PROTOCOLLI BLE (Need4Led) ===\n');

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

console.log(`\n========================================`);
console.log(`RISULTATO TEST: ${passedTests}/${totalTests} superati con successo.`);
console.log(`========================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
