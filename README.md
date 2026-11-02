# Need4Led
**Web Bluetooth App ad alte prestazioni in stile Cockpit Liquid Glass per il controllo delle strisce LED Bluetooth (ELK-BLEDOM / LotusLantern) su monopattino elettrico.**

Sviluppata interamente su PC Windows per l'utilizzo su iPhone tramite il browser **Bluefy**, senza necessità di Mac o abbonamenti a pagamento.

---

## Novità Versione 2.2 (Clean UI & Liquid Glass)

1. **Design Pulito Liquid Glass & Rimozione Totale Emoji:**
   - Eliminazione completa di qualsiasi emoji dall'interfaccia, sostituite da tipografia tecnica pulita (uppercase, letter-spacing calibrato), indicatori geometrici LED luminosi e contrasto elevato conforme alle specifiche Apple Liquid Glass.
   - Superfici traslucide con `backdrop-filter: blur(22px) saturate(160%)` e bordi sottili speculari.

2. **Sfondo Dinamico Fluido con Fallback GPU:**
   - Animazione fluida a scorrimento lento (`@keyframes slowDrift` 35s alternate) con sfocatura e contrasto calibrati per un effetto ipnotico e non affaticante. Fallback GPU automatico con gradienti radiali scuri.

3. **Sequenza Strobo Polizia Rigorosa a 3 Fasi:**
   - Ciclo continuo pulito: `ROSSO PURO (255, 0, 0) -> NERO (0, 0, 0) -> BLU PURO (0, 0, 255)`.
   - Ogni frame attraversa la funzione di rimappatura canali del dispositivo (`BRG` per ELK-BLEDOM), garantendo che il canale verde resti rigorosamente a 0 assoluto, eliminando qualsiasi artefatto giallo.

4. **Generatore Preset da Modelli Calibrati (Senza Timing Manuali):**
   - Eliminati tutti gli slider e input manuali di millisecondi.
   - Creazione preset guidata basata su 5 modelli di comportamento con timing BLE interni anti-saturazione GATT:
     - `Strobo Singolo` (Colore 1 -> Nero)
     - `Strobo Alternato (Stile Polizia)` (Colore 1 -> Nero -> Colore 2)
     - `Alternato Diretto` (Colore 1 -> Colore 2 senza stacco)
     - `Pulsazione / Breathing` (Transizione fluida)
     - `Statico Puro` (Colore continuo ad alta luminosità)
   - Salvataggio in `localStorage` e richiamo immediato a 1 tocco.

5. **Pannello Impostazioni & Auto-Associazione:**
   - Auto-riconnessione Bluetooth all'avvio con `getDevices()` e watchdog anti-collisione.
   - Profilo hardware per dispositivo (`need4led_dev_<id>`) con pinout selector (`BRG`, `GRB`, `RGB`, `BGR`, `RBG`, `GBR`).
   - Test rapido visivo a 3 canali fisici (Rosso, Verde, Blu) e scorciatoie di correzione pinout.
   - Modalità Massimo Bianco ELK (Full 100%, Freddo 6500K, Puro RGB, Caldo 3200K).

---

## Struttura del Progetto

- `index.html`: interfaccia utente Liquid Glass Safe-Area aware
- `css/style.css`: design system Liquid Glass e animazioni
- `js/app.js`: entry point dell'applicazione e registrazione Service Worker
- `js/ble-manager.js`: gestione Web Bluetooth GATT, auto-connessione e code di trasmissione protette
- `js/protocols.js`: encoder protocolli (LotusStandard, LotusV2, Triones), rimappatura canali e modelli preset
- `js/ui-controller.js`: controller UI, gestione eventi e animazioni stroboscopiche
- `sw.js`: Service Worker Network-First per aggiornamento immediato della cache
- `swiftui/Need4LedApp.swift`: controparte nativa iOS in SwiftUI e CoreBluetooth
- `rollback.ps1`: script PowerShell per ripristino istantaneo di qualsiasi versione precedente
