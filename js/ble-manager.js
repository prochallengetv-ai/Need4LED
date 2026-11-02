/**
 * Need4Led — BLE Manager
 * Gestione connessione Web Bluetooth Low Energy, auto-associazione all'avvio,
 * recupero dispositivi autorizzati, auto-reconnect watchdog, profili per dispositivo
 * e trasmissione a rate-limiting controllato.
 */

export class BLEManager {
  constructor(options = {}) {
    this.options = Object.assign({
      onStatusChange: () => {},
      onLog: () => {},
      onGattDiscovered: () => {},
      onDevicePaired: () => {},
      throttleIntervalMs: 60 // intervallo minimo tra pacchetti successivi
    }, options);

    this.device = null;
    this.server = null;
    this.activeService = null;
    this.activeCharacteristic = null;
    this.discoveredGatt = [];
    this.writeMode = 'auto'; // 'auto' | 'withoutResponse' | 'withResponse'
    this.isConnected = false;

    // Auto-reconnect watchdog
    this.autoReconnectEnabled = true;
    this.reconnectTimer = null;
    this.isReconnecting = false;
    this.userExplicitDisconnect = false;

    // Rate limiter & queue
    this.sendQueue = null;
    this.lastSendTime = 0;
    this.sendTimer = null;
    this.isTransmitting = false;

    // UUID noti comunemente usati da controller LED (LotusLantern / ELK-BLEDOM, Triones)
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
   * Tenta l'auto-associazione all'avvio dell'applicazione.
   * Utilizza navigator.bluetooth.getDevices() per connettersi istantaneamente
   * all'ultimo dispositivo associato senza mostrare finestre modali di pairing.
   */
  async tryAutoConnect() {
    if (!this.isSupported()) return false;
    if (this.isConnected || this.isReconnecting) return false;

    // Verifica supporto getDevices()
    if (typeof navigator.bluetooth.getDevices !== 'function') {
      this.log('INFO', '', 'getDevices() non supportato dal browser. Sarà necessaria la selezione manuale al primo avvio.');
      return false;
    }

    try {
      this.setStatus('scanning', 'Ricerca dispositivo associato...');
      this.log('INFO', '', 'Verifica dispositivi precedentemente autorizzati...');

      const devices = await navigator.bluetooth.getDevices();
      if (!devices || devices.length === 0) {
        this.setStatus('disconnected', 'Pronto per la connessione');
        this.log('INFO', '', 'Nessun dispositivo precedentemente autorizzato trovato.');
        return false;
      }

      const lastId = localStorage.getItem('need4led_last_device_id');
      let targetDevice = null;

      if (lastId) {
        targetDevice = devices.find(d => d.id === lastId);
      }
      if (!targetDevice) {
        targetDevice = devices[0];
      }

      this.log('INFO', '', `Dispositivo autorizzato trovato: "${targetDevice.name || 'LED'}" (${targetDevice.id}). Auto-connessione in corso...`);
      this.setStatus('connecting', `Auto-connessione a ${targetDevice.name || 'LED'}...`);

      this.device = targetDevice;
      this.device.addEventListener('gattserverdisconnected', () => this.handleDisconnected());

      await this.connect();
      return true;
    } catch (err) {
      this.log('INFO', '', `Auto-connessione non riuscita: ${err.message}. In attesa di tocco utente.`);
      this.setStatus('disconnected', 'Tocca "Connetti Strisce LED"');
      return false;
    }
  }

  /**
   * Avvia scansione manuale Web Bluetooth
   */
  async requestDevice(acceptAll = true) {
    if (!this.isSupported()) {
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      const errMsg = isIOS
        ? 'Web Bluetooth non è supportato da Safari nativo. Apri questa pagina tramite l\'app Bluefy su iPhone.'
        : 'Web Bluetooth non è disponibile su questo browser. Usa Google Chrome o Microsoft Edge.';
      this.log('ERROR', '', errMsg);
      this.setStatus('error', errMsg);
      throw new Error(errMsg);
    }

    this.userExplicitDisconnect = false;

    try {
      this.setStatus('scanning', 'Ricerca controller LED nelle vicinanze...');
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
        this.setStatus('disconnected', 'Scansione annullata.');
        this.log('INFO', '', 'Scansione annullata dall\'utente.');
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

    this._stopReconnectWatchdog();

    try {
      this.setStatus('connecting', `Connessione a ${this.device.name || 'Dispositivo'}...`);
      this.log('INFO', '', 'Connessione al server GATT in corso...');

      this.server = await this.device.gatt.connect();
      this.isConnected = true;
      this.userExplicitDisconnect = false;
      this.log('INFO', '', 'GATT Server connesso con successo!');

      // Salva come ultimo dispositivo associato per future sessioni
      localStorage.setItem('need4led_last_device_id', this.device.id);
      if (this.device.name) {
        localStorage.setItem('need4led_last_device_name', this.device.name);
      }

      await this.discoverServicesAndCharacteristics();
      this.setStatus('connected', `Connesso a ${this.device.name || 'LED Controller'}`);

      // Notifica pairing all'UI
      this.options.onDevicePaired(this.device);
    } catch (err) {
      this.isConnected = false;
      this.setStatus('error', `Errore connessione: ${err.message}`);
      this.log('ERROR', '', `Fallimento connessione GATT: ${err.message}`);
      
      // Se non è stata disconnessione manuale, pianifica retry
      if (!this.userExplicitDisconnect && this.autoReconnectEnabled) {
        this._scheduleReconnect();
      }
      throw err;
    }
  }

  async discoverServicesAndCharacteristics() {
    this.setStatus('discovering', 'Rilevamento servizi e caratteristiche GATT...');
    this.discoveredGatt = [];
    this.activeService = null;
    this.activeCharacteristic = null;

    try {
      let primaryServices = [];
      try {
        primaryServices = await this.server.getPrimaryServices();
      } catch (e) {
        this.log('INFO', '', `getPrimaryServices generale fallito (${e.message}). Tento scansione UUID singoli noti.`);
        for (const uuid of this.knownServiceUuids) {
          try {
            const s = await this.server.getPrimaryService(uuid);
            primaryServices.push(s);
          } catch (_) {}
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
          this.log('ERROR', '', `Errore lettura caratteristiche per ${service.uuid}: ${charErr.message}`);
        }

        this.discoveredGatt.push(sEntry);
      }

      this.options.onGattDiscovered(this.discoveredGatt);

      if (!this.activeCharacteristic) {
        this.log('ERROR', '', 'Attenzione: nessuna caratteristica con permessi di scrittura individuata!');
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
          this.log('INFO', '', `Caratteristica attiva cambiata a: ${charUuid}`);
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
    this.log('INFO', '', 'Dispositivo disconnesso.');

    // Avvia il watchdog di riconnessione automatica (se non disconnesso manualmente)
    if (!this.userExplicitDisconnect && this.autoReconnectEnabled && this.device) {
      this._scheduleReconnect();
    }
  }

  _scheduleReconnect() {
    this._stopReconnectWatchdog();
    this.isReconnecting = true;
    this.setStatus('connecting', `Riconnessione automatica a ${this.device.name || 'LED'}...`);
    this.log('INFO', '', 'Watchdog: tentativo di riconnessione automatica tra 3 secondi...');

    this.reconnectTimer = setTimeout(async () => {
      try {
        if (this.device && !this.isConnected && !this.userExplicitDisconnect) {
          await this.connect();
          this.isReconnecting = false;
        }
      } catch (_) {
        if (!this.userExplicitDisconnect) {
          this._scheduleReconnect();
        }
      }
    }, 3200);
  }

  _stopReconnectWatchdog() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isReconnecting = false;
  }

  async disconnect() {
    this.userExplicitDisconnect = true;
    this._stopReconnectWatchdog();
    if (this.device && this.device.gatt.connected) {
      this.device.gatt.disconnect();
    }
    this.handleDisconnected();
  }

  /**
   * Scrittura diretta immediata e non throttled per loop di animazione asincroni deterministici.
   * Restituisce una Promise che si risolve non appena il pacchetto è accettato dal buffer radio BLE.
   */
  async writePacketDirect(uint8Bytes) {
    if (!this.isConnected || !this.activeCharacteristic) {
      return false;
    }
    const char = this.activeCharacteristic;
    const hex = Array.from(uint8Bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');

    try {
      const supportsNoResp = char.properties && char.properties.writeWithoutResponse;
      const useNoResponse = (this.writeMode === 'withoutResponse') ||
        (this.writeMode === 'auto' && (supportsNoResp || typeof char.writeValueWithoutResponse === 'function'));

      if (useNoResponse && typeof char.writeValueWithoutResponse === 'function') {
        await char.writeValueWithoutResponse(uint8Bytes);
        this.log('TX', hex, `(${uint8Bytes.length} bytes, direct writeWithoutResponse)`);
      } else if (typeof char.writeValue === 'function') {
        await char.writeValue(uint8Bytes);
        this.log('TX', hex, `(${uint8Bytes.length} bytes, direct writeValue)`);
      } else if (typeof char.writeValueWithResponse === 'function') {
        await char.writeValueWithResponse(uint8Bytes);
        this.log('TX', hex, `(${uint8Bytes.length} bytes, direct writeWithResponse)`);
      }
      return true;
    } catch (err) {
      this.log('ERROR', hex, `Scrittura diretta fallita: ${err.message}`);
      return false;
    }
  }

  /**
   * Invio pacchetto con rate-limiting protetto (per slider ed eventi utente rapidi)
   */
  async sendPacket(uint8Bytes, immediate = false) {
    if (!this.isConnected || !this.activeCharacteristic) {
      return;
    }

    if (immediate) {
      return this._executeWrite(uint8Bytes);
    }

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
      const supportsNoResp = char.properties && char.properties.writeWithoutResponse;
      const useNoResponse = (this.writeMode === 'withoutResponse') ||
        (this.writeMode === 'auto' && (supportsNoResp || typeof char.writeValueWithoutResponse === 'function'));

      if (useNoResponse && typeof char.writeValueWithoutResponse === 'function') {
        await char.writeValueWithoutResponse(uint8Bytes);
        this.log('TX', hex, `(${uint8Bytes.length} bytes, writeWithoutResponse)`);
      } else if (typeof char.writeValueWithResponse === 'function') {
        await char.writeValueWithResponse(uint8Bytes);
        this.log('TX', hex, `(${uint8Bytes.length} bytes, writeWithResponse)`);
      } else if (typeof char.writeValue === 'function') {
        await char.writeValue(uint8Bytes);
        this.log('TX', hex, `(${uint8Bytes.length} bytes, writeValue standard)`);
      }
    } catch (err) {
      this.log('ERROR', hex, `Invio fallito: ${err.message}`);
    } finally {
      this.isTransmitting = false;
      if (this.sendQueue) {
        setTimeout(() => this._flushQueue(), this.options.throttleIntervalMs);
      }
    }
  }
}
