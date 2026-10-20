/**
 * Need4Led — UI Controller
 * Gestione degli elementi visivi, feedback tattile/visivo, eventi touch e diagnostica.
 */

import { Protocols, getEncoder, hexToBytes, bytesToHex } from './protocols.js';

export class UIController {
  constructor(bleManager) {
    this.ble = bleManager;
    this.currentProtocol = Protocols.LOTUS_STANDARD;
    this.encoder = getEncoder(this.currentProtocol);

    // Stato corrente illuminazione
    this.state = {
      isOn: false,
      brightness: 100,
      r: 0,
      g: 240,
      b: 255
    };

    this._bindElements();
    this._attachEvents();
  }

  _bindElements() {
    // Header & Status
    this.btnOpenDiag = document.getElementById('btnOpenDiag');
    this.statusBadge = document.getElementById('statusBadge');
    this.statusDot = document.getElementById('statusDot');
    this.statusLabel = document.getElementById('statusLabel');
    this.deviceSummary = document.getElementById('deviceSummary');
    this.btnConnect = document.getElementById('btnConnect');
    this.connectText = document.getElementById('connectText');
    this.connectIcon = document.getElementById('connectIcon');
    this.ambientTop = document.getElementById('ambientTop');
    this.toastNotice = document.getElementById('toastNotice');

    // Power
    this.btnPowerOn = document.getElementById('btnPowerOn');
    this.btnPowerOff = document.getElementById('btnPowerOff');

    // Presets
    this.presetButtons = document.querySelectorAll('.preset-btn');

    // Brightness
    this.brightnessSlider = document.getElementById('brightnessSlider');
    this.brightnessValBadge = document.getElementById('brightnessValBadge');

    // Color
    this.colorHexText = document.getElementById('colorHexText');
    this.colorIndicatorCircle = document.getElementById('colorIndicatorCircle');
    this.rgbSummaryText = document.getElementById('rgbSummaryText');
    this.nativeColorInput = document.getElementById('nativeColorInput');
    this.sliderR = document.getElementById('sliderR');
    this.sliderG = document.getElementById('sliderG');
    this.sliderB = document.getElementById('sliderB');
    this.valR = document.getElementById('valR');
    this.valG = document.getElementById('valG');
    this.valB = document.getElementById('valB');

    // Diagnostic Drawer
    this.diagDrawer = document.getElementById('diagDrawer');
    this.btnCloseDiag = document.getElementById('btnCloseDiag');
    this.selectProtocol = document.getElementById('selectProtocol');
    this.selectWriteMode = document.getElementById('selectWriteMode');
    this.selectCharUuid = document.getElementById('selectCharUuid');
    this.gattTreeContainer = document.getElementById('gattTreeContainer');
    this.inputRawHex = document.getElementById('inputRawHex');
    this.btnSendRawHex = document.getElementById('btnSendRawHex');
    this.termWindow = document.getElementById('termWindow');
    this.btnClearLog = document.getElementById('btnClearLog');
  }

  _attachEvents() {
    // Connessione Bluetooth
    this.btnConnect.addEventListener('click', () => this.handleConnectToggle());

    // Power
    this.btnPowerOn.addEventListener('click', () => this.setPower(true));
    this.btnPowerOff.addEventListener('click', () => this.setPower(false));

    // Presets
    this.presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const presetKey = btn.getAttribute('data-preset');
        this.applyPreset(presetKey);
      });
    });

    // Brightness Slider
    this.brightnessSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.brightnessValBadge.textContent = `${val}%`;
      this.state.brightness = val;
      this.sendBrightnessCommand(val);
    });

    // Native Color Input
    this.nativeColorInput.addEventListener('input', (e) => {
      const hex = e.target.value;
      const r = parseInt(hex.substr(1, 2), 16);
      const g = parseInt(hex.substr(3, 2), 16);
      const b = parseInt(hex.substr(5, 2), 16);
      this.updateColorValues(r, g, b, true);
    });

    // RGB Sliders
    const handleRgbChange = () => {
      const r = parseInt(this.sliderR.value, 10);
      const g = parseInt(this.sliderG.value, 10);
      const b = parseInt(this.sliderB.value, 10);
      this.updateColorValues(r, g, b, true);
    };

    this.sliderR.addEventListener('input', handleRgbChange);
    this.sliderG.addEventListener('input', handleRgbChange);
    this.sliderB.addEventListener('input', handleRgbChange);

    // Diagnostica Drawer
    this.btnOpenDiag.addEventListener('click', () => {
      this.diagDrawer.classList.add('open');
      this.vibrate(10);
    });

    this.btnCloseDiag.addEventListener('click', () => {
      this.diagDrawer.classList.remove('open');
      this.vibrate(10);
    });

    this.diagDrawer.addEventListener('click', (e) => {
      if (e.target === this.diagDrawer) {
        this.diagDrawer.classList.remove('open');
      }
    });

    // Cambio Protocollo
    this.selectProtocol.addEventListener('change', (e) => {
      this.currentProtocol = e.target.value;
      this.encoder = getEncoder(this.currentProtocol);
      this.ble.log('INFO', '', `Protocollo attivo modificato in: ${this.currentProtocol}`);
      this.showToast(`Protocollo: ${e.target.selectedOptions[0].text}`);
    });

    // Cambio Modalità Scrittura
    this.selectWriteMode.addEventListener('change', (e) => {
      this.ble.writeMode = e.target.value;
      this.ble.log('INFO', '', `Modalità scrittura impostata su: ${this.ble.writeMode}`);
      this.showToast(`Scrittura: ${this.ble.writeMode}`);
    });

    // Selezione Caratteristica Manuale
    this.selectCharUuid.addEventListener('change', (e) => {
      if (e.target.value) {
        this.ble.setActiveCharacteristicByUuid(e.target.value);
        this.showToast(`Caratteristica: ${e.target.value.substring(0, 8)}...`);
      }
    });

    // Invio Raw Hex Manuale
    this.btnSendRawHex.addEventListener('click', () => this.handleSendRawHex());
    this.inputRawHex.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleSendRawHex();
    });

    // Pulisci Log
    this.btnClearLog.addEventListener('click', () => {
      this.termWindow.innerHTML = '';
      this.showToast('Log terminale svuotato');
    });
  }

  vibrate(ms = 15) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(ms); } catch (_) {}
    }
  }

  showToast(message, durationMs = 2200) {
    this.toastNotice.textContent = message;
    this.toastNotice.classList.add('visible');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.toastNotice.classList.remove('visible');
    }, durationMs);
  }

  async handleConnectToggle() {
    this.vibrate(20);
    if (this.ble.isConnected) {
      await this.ble.disconnect();
      this.showToast('Strisce LED disconnesse');
    } else {
      try {
        await this.ble.requestDevice(true);
        this.showToast('Connessione completata!');
      } catch (err) {
        // Errore già tracciato dal bleManager
      }
    }
  }

  async setPower(on) {
    this.vibrate(25);
    this.state.isOn = on;

    if (on) {
      this.btnPowerOn.classList.add('active');
      this.btnPowerOff.classList.remove('active');
      this.showToast('Accensione inviata');
    } else {
      this.btnPowerOff.classList.add('active');
      this.btnPowerOn.classList.remove('active');
      this.showToast('Spegnimento inviato');
    }

    try {
      const packet = this.encoder.power(on);
      await this.ble.sendPacket(packet, true);
    } catch (err) {
      if (!this.ble.isConnected) {
        this.showToast('Connetti prima il Bluetooth!', 3000);
      }
    }
  }

  applyPreset(presetKey) {
    this.vibrate(30);
    switch (presetKey) {
      case 'white': // Strada
        this.state.brightness = 100;
        this.updateColorValues(255, 255, 255, true);
        this.showToast('Preset: Strada (Bianco)');
        break;
      case 'red': // Stop
        this.state.brightness = 100;
        this.updateColorValues(255, 0, 0, true);
        this.showToast('Preset: Stop (Rosso)');
        break;
      case 'cyan': // Cyber Ciano
        this.state.brightness = 90;
        this.updateColorValues(0, 240, 255, true);
        this.showToast('Preset: Cyber Ciano');
        break;
      case 'purple': // Neon Viola
        this.state.brightness = 90;
        this.updateColorValues(157, 0, 255, true);
        this.showToast('Preset: Neon Viola');
        break;
      case 'amber': // Ambra Sicurezza
        this.state.brightness = 100;
        this.updateColorValues(255, 149, 0, true);
        this.showToast('Preset: Ambra Sicurezza');
        break;
    }

    this.brightnessSlider.value = this.state.brightness;
    this.brightnessValBadge.textContent = `${this.state.brightness}%`;
    this.sendBrightnessCommand(this.state.brightness);
  }

  updateColorValues(r, g, b, transmit = false) {
    this.state.r = r;
    this.state.g = g;
    this.state.b = b;

    const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
    this.colorHexText.textContent = hex;
    this.colorIndicatorCircle.style.backgroundColor = hex;
    this.colorIndicatorCircle.style.boxShadow = `0 0 20px ${hex}88`;
    this.rgbSummaryText.textContent = `R: ${r} | G: ${g} | B: ${b}`;
    this.nativeColorInput.value = hex;

    this.sliderR.value = r;
    this.sliderG.value = g;
    this.sliderB.value = b;
    this.valR.textContent = r;
    this.valG.textContent = g;
    this.valB.textContent = b;

    // Aggiorna l'alone luminoso superiore con il colore scelto
    this.ambientTop.style.background = `radial-gradient(circle, ${hex}28 0%, rgba(0, 0, 0, 0) 70%)`;

    if (transmit) {
      this.sendColorCommand(r, g, b);
    }
  }

  sendColorCommand(r, g, b) {
    if (!this.ble.isConnected) return;
    try {
      const packet = this.encoder.color(r, g, b);
      this.ble.sendPacket(packet);
    } catch (_) {}
  }

  sendBrightnessCommand(level) {
    if (!this.ble.isConnected) return;
    try {
      const packet = this.encoder.brightness(level);
      this.ble.sendPacket(packet);
    } catch (_) {}
  }

  async handleSendRawHex() {
    const rawStr = this.inputRawHex.value.trim();
    if (!rawStr) return;

    try {
      const bytes = hexToBytes(rawStr);
      await this.ble.sendPacket(bytes, true);
      this.showToast(`Inviati ${bytes.length} bytes`);
      this.vibrate(15);
    } catch (err) {
      this.showToast(`Errore hex: ${err.message}`, 3000);
      this.ble.log('ERROR', rawStr, err.message);
    }
  }

  // Callback dal BLE Manager sullo stato di connessione
  onBleStatusChange({ state, message }) {
    this.statusBadge.className = `status-badge ${state}`;
    this.statusLabel.textContent = message;

    if (state === 'connected') {
      this.btnConnect.classList.add('connected-state');
      this.connectText.textContent = 'Disconnetti';
      this.connectIcon.textContent = '✕';
      const devName = this.ble.device ? this.ble.device.name || 'LED Controller' : 'LED';
      this.deviceSummary.textContent = `${devName}`;
    } else if (state === 'disconnected') {
      this.btnConnect.classList.remove('connected-state');
      this.connectText.textContent = 'Connetti Strisce LED';
      this.connectIcon.textContent = '🔗';
      this.deviceSummary.textContent = 'Nessun controller attivo';
      this.btnPowerOn.classList.remove('active');
      this.btnPowerOff.classList.remove('active');
    }
  }

  // Callback per loggare pacchetti nel terminale visuale
  onBleLog({ time, direction, hex, detail }) {
    const entry = document.createElement('div');
    entry.className = 'term-entry';

    let dirClass = 'term-info';
    let dirSymbol = 'ℹ';
    if (direction === 'TX') {
      dirClass = 'term-tx';
      dirSymbol = 'TX ➔';
    } else if (direction === 'RX') {
      dirClass = 'term-rx';
      dirSymbol = 'RX ⬅';
    } else if (direction === 'ERROR') {
      dirClass = 'term-error';
      dirSymbol = 'ERR ✖';
    }

    entry.innerHTML = `
      <span class="term-time">[${time}]</span>
      <span class="${dirClass}">${dirSymbol}</span>
      ${hex ? `<span class="term-bytes">${hex}</span>` : ''}
      <span class="term-detail">${detail}</span>
    `;

    this.termWindow.appendChild(entry);
    this.termWindow.scrollTop = this.termWindow.scrollHeight;
  }

  // Callback quando vengono scoperti i servizi GATT
  onGattDiscovered(services) {
    this.selectCharUuid.innerHTML = '';
    this.gattTreeContainer.innerHTML = '';

    if (!services || services.length === 0) {
      this.gattTreeContainer.innerHTML = '<em>Nessun servizio rilevato.</em>';
      return;
    }

    services.forEach(s => {
      const sDiv = document.createElement('div');
      sDiv.className = 'gatt-service-item';
      sDiv.innerHTML = `<strong>Servizio:</strong> ${s.uuid}`;

      s.characteristics.forEach(c => {
        const cDiv = document.createElement('div');
        cDiv.className = 'gatt-char-item';
        cDiv.innerHTML = `↳ ${c.uuid} <span class="gatt-props-tag">[${c.properties.join(', ')}]</span>`;
        sDiv.appendChild(cDiv);

        // Aggiungi a dropdown
        const opt = document.createElement('option');
        opt.value = c.uuid;
        opt.textContent = `${c.uuid.substring(0, 8)}... (${c.properties.join(',')})`;
        if (this.ble.activeCharacteristic && this.ble.activeCharacteristic.uuid === c.uuid) {
          opt.selected = true;
        }
        this.selectCharUuid.appendChild(opt);
      });

      this.gattTreeContainer.appendChild(sDiv);
    });
  }
}
