/**
 * Need4Led — BLE Manager
 * Gestione connessione Web Bluetooth Low Energy, scoperta GATT,
 * scrittura resiliente (withoutResponse / withResponse) e rate-limiting.
 */

export class BLEManager {
  constructor(options = {}) {
    this.options = Object.assign({
      onStatusChange: () => {},
      onLog: () => {},
      onGattDiscovered: () => {},
      throttleIntervalMs: 65 // intervallo minimo tra pacchetti successivi
    }, options);

    this.device = null;
    this.server = null;
    this.activeService = null;
    this.activeCharacteristic = null;
    this.discoveredGatt = [];
    this.writeMode = 'auto'; // 'auto' | 'withoutResponse' | 'withResponse'
    this.isConnected = false;

    // Rate limiter & queue
    this.sendQueue = null;
    this.lastSendTime = 0;
    this.sendTimer = null;
    this.isTransmitting = false;

    // UUID noti comunemente usati da controller LED
    this.knownServiceUuids = [
      '0000fff0-0000-1000-8000-00805f9b34fb', // LotusLantern / ELK-BLEDOM
      '0000ffd5-0000-1000-8000-00805f9b34fb', // Triones / HappyLighting
      '0000ffe5-0000-1000-8000-00805f9b34fb', // Triones alt
      '0000fee7-0000-1000-8000-00805f9b34fb', // Tencent / Jerry chipset
      '0000ff00-0000-1000-8000-00805f9b34fb',
      '00005301-0000-1000-8000-00805f9b34fb'
    ];
  }

  isSupported() {
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  log(direction, hexString, detail = '') {
    this.options.onLog({
      time: new Date().toLocaleTimeString() + '.' + String(new Date().getMilliseconds()).padStart(3, '0'),
      direction, // 'TX', 'RX', 'INFO', 'ERROR'
      hex: hexString,
      detail
    });
  }

  setStatus(state, message) {
    this.options.onStatusChange({ state, message });
  }

  /**
   * Avvia scansione Web Bluetooth
   * @param {boolean} acceptAll - se true usa acceptAllDevices: true con optionalServices
   */
  async requestDevice(acceptAll = true) {
    if (!this.isSupported()) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const errMsg = isIOS
        ? 'Web Bluetooth non è supportato da Safari. Apri questa pagina tramite l\'app Bluefy su iPhone.'
        : 'Web Bluetooth non è disponibile su questo browser. Usa Google Chrome o Microsoft Edge.';
      this.log('ERROR', '', errMsg);
      this.setStatus('error', errMsg);
      throw new Error(errMsg);
    }

    try {
      this.setStatus('scanning', 'Ricerca dispositivi LED nelle vicinanze...');
      this.log('INFO', '', 'Apertura dialogo scansione BLE...');

      const requestOptions = acceptAll
        ? {
            acceptAllDevices: true,
            optionalServices: this.knownServiceUuids
          }
        : {
            filters: [
              { services: ['0000fff0-0000-1000-8000-00805f9b34fb'] },
              { services: ['0000ffd5-0000-1000-8000-00805f9b34fb'] },
              { namePrefix: 'ELK' },
              { namePrefix: 'Lotus' },
              { namePrefix: 'LED' },
              { namePrefix: 'SP1' }
            ],
            optionalServices: this.knownServiceUuids
          };

      const device = await navigator.bluetooth.requestDevice(requestOptions);
      this.device = device;
      this.device.addEventListener('gattserverdisconnected', () => this.handleDisconnected());

      this.log('INFO', '', `Dispositivo selezionato: "${device.name || 'Senza Nome'}" (ID: ${device.id})`);
      await this.connect();
      return device;
    } catch (err) {
      if (err.name === 'NotFoundError') {
        this.setStatus('disconnected', 'Scansione annullata dall\'utente.');
        this.log('INFO', '', 'Scansione annullata.');
      } else {
        this.setStatus('error', `Errore selezione dispositivo: ${err.message}`);
        this.log('ERROR', '', err.message);
      }
      throw err;
    }
  }

  async connect() {
    if (!this.device) {
      throw new Error('Nessun dispositivo selezionato.');
    }

    try {
      this.setStatus('connecting', `Connessione a ${this.device.name || 'Dispositivo'}...`);
      this.log('INFO', '', 'Connessione al server GATT in corso...');

      this.server = await this.device.gatt.connect();
      this.isConnected = true;
      this.log('INFO', '', 'GATT Server connesso con successo!');

      await this.discoverServicesAndCharacteristics();
      this.setStatus('connected', `Connesso a ${this.device.name || 'LED Controller'}`);
    } catch (err) {
      this.isConnected = false;
      this.setStatus('error', `Errore di connessione: ${err.message}`);
      this.log('ERROR', '', `Fallimento connessione GATT: ${err.message}`);
      throw err;
    }
  }

  async discoverServicesAndCharacteristics() {
    this.setStatus('discovering', 'Rilevamento servizi e caratteristiche GATT...');
    this.discoveredGatt = [];
    this.activeService = null;
    this.activeCharacteristic = null;

    try {
      // 1. Prova prima con il servizio primario principale noto (0xFFF0 o 0xFFD5)
      let primaryServices = [];
      try {
        primaryServices = await this.server.getPrimaryServices();
      } catch (e) {
        this.log('INFO', '', `getPrimaryServices generale non consentito o fallito (${e.message}). Tento servizi noti singoli.`);
        for (const uuid of this.knownServiceUuids) {
          try {
            const s = await this.server.getPrimaryService(uuid);
            primaryServices.push(s);
          } catch (_) {
            // Ignora se non presente
          }
        }
      }

      for (const service of primaryServices) {
        const sEntry = {
          uuid: service.uuid,
          characteristics: []
        };

        try {
          const chars = await service.getCharacteristics();
          for (const char of chars) {
            const props = [];
            if (char.properties.read) props.push('READ');
            if (char.properties.write) props.push('WRITE');
            if (char.properties.writeWithoutResponse) props.push('WRITE_NO_RESP');
            if (char.properties.notify) props.push('NOTIFY');
            if (char.properties.indicate) props.push('INDICATE');

            const cEntry = {
              uuid: char.uuid,
              properties: props,
              rawChar: char
            };
            sEntry.characteristics.push(cEntry);

            // Auto-selezione caratteristica attiva:
            // Cerca FFF3 o FFD9 o una caratteristica con capacità di scrittura
            const isFff3 = char.uuid.toLowerCase().includes('fff3');
            const isFfd9 = char.uuid.toLowerCase().includes('ffd9');
            const canWrite = char.properties.write || char.properties.writeWithoutResponse;

            if (!this.activeCharacteristic && (isFff3 || isFfd9 || canWrite)) {
              this.activeService = service;
              this.activeCharacteristic = char;
              this.log('INFO', '', `Caratteristica di scrittura attiva agganciata: ${char.uuid} [${props.join(', ')}]`);
            }
          }
        } catch (charErr) {
          this.log('ERROR', '', `Errore lettura caratteristiche per servizio ${service.uuid}: ${charErr.message}`);
        }

        this.discoveredGatt.push(sEntry);
      }

      this.options.onGattDiscovered(this.discoveredGatt);

      if (!this.activeCharacteristic) {
        this.log('ERROR', '', 'Attenzione: nessuna caratteristica con permessi di scrittura individuata nei servizi scansionati!');
      }
    } catch (err) {
      this.log('ERROR', '', `Errore scansione GATT: ${err.message}`);
      throw err;
    }
  }

  setActiveCharacteristicByUuid(charUuid) {
    for (const s of this.discoveredGatt) {
      for (const c of s.characteristics) {
        if (c.uuid.toLowerCase() === charUuid.toLowerCase()) {
          this.activeCharacteristic = c.rawChar;
          this.log('INFO', '', `Caratteristica attiva cambiata manualmente a: ${charUuid}`);
          return true;
        }
      }
    }
    return false;
  }

  handleDisconnected() {
    this.isConnected = false;
    this.activeService = null;
    this.activeCharacteristic = null;
    this.setStatus('disconnected', 'Dispositivo disconnesso.');
    this.log('INFO', '', 'Evento gattserverdisconnected ricevuto.');
  }

  async disconnect() {
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.handleDisconnected();
  }

  /**
   * Invio con rate-limiting per evitare buffer overflow BLE durante movimenti slider rapidi
   */
  async sendPacket(uint8Bytes, immediate = false) {
    if (!this.isConnected || !this.activeCharacteristic) {
      this.log('ERROR', '', 'Tentativo di invio senza connessione BLE attiva o caratteristica non pronta.');
      throw new Error('Nessuna connessione BLE attiva');
    }

    if (immediate) {
      return this._executeWrite(uint8Bytes);
    }

    // Rate limiter: memorizza l'ultimo pacchetto
    this.sendQueue = uint8Bytes;

    const now = Date.now();
    const elapsed = now - this.lastSendTime;

    if (elapsed >= this.options.throttleIntervalMs && !this.isTransmitting) {
      this._flushQueue();
    } else if (!this.sendTimer) {
      const waitTime = Math.max(0, this.options.throttleIntervalMs - elapsed);
      this.sendTimer = setTimeout(() => {
        this.sendTimer = null;
        this._flushQueue();
      }, waitTime);
    }
  }

  async _flushQueue() {
    if (!this.sendQueue || this.isTransmitting) return;
    const packet = this.sendQueue;
    this.sendQueue = null;
    await this._executeWrite(packet);
  }

  async _executeWrite(uint8Bytes) {
    this.isTransmitting = true;
    this.lastSendTime = Date.now();

    const char = this.activeCharacteristic;
    const hex = Array.from(uint8Bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

    try {
      // Determina il metodo di scrittura
      const supportsNoResp = char.properties && char.properties.writeWithoutResponse;
      const supportsWithResp = char.properties && char.properties.write;

      const useNoResponse = (this.writeMode === 'withoutResponse') ||
        (this.writeMode === 'auto' && (supportsNoResp || typeof char.writeValueWithoutResponse === 'function'));

      if (useNoResponse && typeof char.writeValueWithoutResponse === 'function') {
        await char.writeValueWithoutResponse(uint8Bytes);
        this.log('TX', hex, `(${uint8Bytes.length} bytes, writeWithoutResponse)`);
      } else if (typeof char.writeValueWithResponse === 'function') {
        await char.writeValueWithResponse(uint8Bytes);
        this.log('TX', hex, `(${uint8Bytes.length} bytes, writeWithResponse)`);
      } else if (typeof char.writeValue === 'function') {
        // Fallback per standard Web Bluetooth precedente
        await char.writeValue(uint8Bytes);
        this.log('TX', hex, `(${uint8Bytes.length} bytes, writeValue standard)`);
      } else {
        throw new Error('Nessun metodo di scrittura supportato sulla caratteristica selezionata');
      }
    } catch (err) {
      this.log('ERROR', hex, `Invio fallito: ${err.message}`);
      throw err;
    } finally {
      this.isTransmitting = false;
      // Se c'è ancora un pacchetto in coda arrivato mentre trasmetteva, invialo
      if (this.sendQueue) {
        setTimeout(() => this._flushQueue(), this.options.throttleIntervalMs);
      }
    }
  }
}
