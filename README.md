# Need4Led 🛴⚡
**Web Bluetooth App ad alte prestazioni in stile Cockpit Liquid Glass per il controllo delle strisce LED Bluetooth (ELK-BLEDOM / LotusLantern) su monopattino elettrico.**

Sviluppata interamente su PC Windows per l'utilizzo su iPhone tramite il browser **Bluefy**, senza necessità di Mac o abbonamenti a pagamento.

---

## 🚀 Novità Versione 2.0

1. **Massimo Bianco ELK-BLEDOM (Potenza Massima Lumen):**
   - Eroga contemporaneamente la saturazione RGB completa `(255, 255, 255)`, il livello di luminosità al 100% (`0x64`) e il comando hardware di modalità scala di grigi/bianco puro `7E 00 03 00 01 00 00 00 EF`.
   - Selettori rapidi per **Freddo 6500K** (massima visibilità notturna), **Puro 100%** e **Caldo 3200K**.
2. **Corrispondenza Esatta dei Colori (Calibrazione Pinout Hardware):**
   - Se premendo *Rosso* la striscia fisica si accendeva di *Verde* o *Blu*, il motivo era la sequenza interna dei pin della striscia (spesso `GRB` o `BRG` sui controller cinesi).
   - È stata aggiunta una sezione con **Pulsanti di Test Rapido** (🔴 Test Rosso, 🟢 Test Verde, 🔵 Test Blu) e un selettore istantaneo di ordine pin (`RGB`, `GRB`, `BRG`, `BGR`, `RBG`, `GBR`) che viene memorizzato permanentemente.
3. **Modalità Dinamiche & Lampeggianti (Polizia Blu & Rosso):**
   - 🚨 **Polizia (Blu & Rosso Lampeggiante):** Strobo alternato ad alta intensità.
   - ⚡ **Strobo Notte Bianco:** Lampeggio ad alta frequenza per attraversamenti e incroci bui.
   - 🌈 **Flusso Arcobaleno:** Ciclo cromatico continuo sfumato.
   - 💜 **Respiro Cyberpunk:** Pulsazione sfumata tra Ciano e Viola neon.
   - ⚠️ **Hazard Fendinebbia:** Lampeggio intermittente ambra per pioggia e nebbia.
   - 🎉 **Party Strobe:** Scatto stroboscopico multicolore rapido.
   - Controllo velocità di frequenza regolabile con slider.
4. **I Miei Preset Personalizzati (Crea & Salva):**
   - Pulsante `+ Salva Corrente` per memorizzare qualsiasi combinazione di colore e luminosità assegnandole un nome personalizzato.
   - I preset vengono salvati nella memoria del telefono (`localStorage`) e restano sempre disponibili con attivazione a 1 tocco e pulsante di cancellazione `✕`.
5. **Nuova Interfaccia Cockpit Professionale:**
   - Navigazione a segmenti: **🏎️ Rapido**, **🚨 Dinamici & Strobo**, **🎨 Colori**, **⭐ I Miei Preset**.
   - Design Liquid Glass ad altissimo contrasto su nero OLED puro (`#000000`).
   - Rimossa ogni dicitura "PRO": l'app si chiama ufficialmente **Need4Led**.

---

## 📁 File da Aggiornare sul tuo GitHub

Per applicare le modifiche su GitHub Pages, trascina dal tuo PC (cartella `C:\Users\thoma\.gemini\antigravity\scratch\need4led`):
- `index.html`
- `sw.js`
- `manifest.json`
- la cartella `css` (con dentro `style.css`)
- la cartella `js` (con dentro i 4 file aggiornati)

Fai il **Commit changes** su GitHub. Entro 60 secondi il sito sarà aggiornato e su iPhone (in Bluefy) basterà ricaricare la pagina per avere la nuova versione!
