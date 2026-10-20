2. Apri **Need4LED** in Bluefy.
3. Premi **"Connetti Strisce LED"**.
4. Nella finestra di dialogo Bluetooth, seleziona il dispositivo del controller (spesso denominato `ELK-BLEDOM`, `LotusLantern`, `LED...`, oppure con una stringa generica).
5. Una volta connesso:
   - Apri il cassetto di diagnostica premendo il pulsante **⚡** in alto a destra.
   - Osserva la sezione **GATT Explorer**: vedrai i servizi e le caratteristiche scoperte (es. `0000fff0...` e `0000fff3...`).
   - Chiudi la diagnostica e premi **ACCENDI** o **Strada (Bianco)**.
6. **Se la striscia risponde immediatamente:** il protocollo standard LotusLantern è confermato!
7. **Se la striscia non risponde:**
   - Riapri ** Diagnostica**.
   - Nel menu *Protocollo*, seleziona **LotusLantern Variante 2 (Index 0x04)** oppure **Triones / HappyLighting**.
   - Nel menu *Modalità di Scrittura*, prova ad alternare tra **Auto** e **Forza writeWithoutResponse**.
   - Il terminale live mostrerà esattamente i byte trasmessi (`TX ➔`) e qualsiasi risposta o errore.
---
##  Esecuzione dei Test Unitari
Per verificare l'integrità dei frame esadecimali e prevenire regressioni sul codice:
```powershell
npm test
```
I test controllano la corrispondenza esatta dei byte, i delimitatori `0x7E` e `0xEF`, gli offset di colore RGB e le conversioni di luminosità.
---
##  Linee Guida di Sicurezza alla Guida
- Non utilizzare i controlli complessi (slider RGB) mentre il monopattino è in movimento.
- Usa esclusivamente i preset fisici a grande impatto visivo (**Strada** per illuminazione anteriore, **Stop** per visibilità/freno).
- Fissa saldamente l'iPhone al manubrio con un supporto antivibrazioni.
