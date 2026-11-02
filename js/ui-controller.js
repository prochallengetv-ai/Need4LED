/**
 * Need4Led — UI Controller
 * Gestione interfaccia Liquid Glass, navigazione a schede, auto-associazione all'avvio,
 * watchdog riconnessione, profili cromatici hardware per dispositivo, calibrazione pinout automatica,
 * sequenza strobo Polizia a 3 fasi (Rosso -> Nero -> Blu) e generatore preset da modelli pre-calibrati.
 * Zero emoji: tipografia tecnica pulita, indicatori geometrici LED e contrasto elevato.
 */

import {
  Protocols,
  getEncoder,
  hexToBytes,
  bytesToHex,
  remapColorChannels,
  PRESET_MODELS,
  PRESET_MODEL_CONFIGS,
  POLICE_SEQUENCE,
  POLICE_STEP_INTERVAL_MS
} from './protocols.js';

export class UIController {
  constructor(bleManager) {
    this.ble = bleManager;
    this.currentProtocol = Protocols.LOTUS_STANDARD;
    this.encoder = getEncoder(this.currentProtocol);

    // Ordine pinout attivo (predefinito su BRG per controller ELK-BLEDOM)
    this.channelOrder = localStorage.getItem('need4led_channel_order') || 'BRG';

    // Dispositivo attivo
    this.currentDeviceId = localStorage.getItem('need4led_last_device_id') || null;

    // Stato illuminazione corrente
    this.state = {
      isOn: false,
      brightness: 100,
      r: 0,
      g: 240,
      b: 255
    };

    // Gestione Effetti Dinamici & Preset Animati
    this.activeEffect = null;
    this.effectTimer = null;
    this.effectSpeed = 80;

    // Colori selezionati per il generatore preset da modello
    this.creatorState = {
      model: PRESET_MODELS.STROBE_POLICE,
      color1: { r: 255, g: 0, b: 0, hex: '#FF0000' },
      color2: { r: 0, g: 0, b: 255, hex: '#0000FF' }
    };

    // Preset Personalizzati
    this.customPresets = this._loadCustomPresets();

    this._bindElements();
    this._attachEvents();
    this._renderCustomPresets();
    this._initChannelOrderUI();
    this._updateCreatorUI();

    // Auto-associazione all'avvio
    this._initAutoConnect();
  }

  _bindElements() {
    // Header & Badge di Stato
    this.statusBadge = document.getElementById('statusBadge');
    this.statusDot = document.getElementById('statusDot');
    this.statusLabel = document.getElementById('statusLabel');
    this.autoConnectPill = document.getElementById('autoConnectPill');
    this.deviceSummary = document.getElementById('deviceSummary');
    this.btnConnect = document.getElementById('btnConnect');
    this.connectText = document.getElementById('connectText');
    this.connectIcon = document.getElementById('connectIcon');
    this.toastNotice = document.getElementById('toastNotice');
    this.ambientTop = document.getElementById('ambientTop');

    // Power switches
    this.btnPowerOn = document.getElementById('btnPowerOn');
    this.btnPowerOff = document.getElementById('btnPowerOff');

    // Massimo Bianco ELK
    this.btnMaxWhiteFull = document.getElementById('btnMaxWhiteFull');
    this.btnWhiteCold = document.getElementById('btnWhiteCold');
    this.btnWhitePure = document.getElementById('btnWhitePure');
    this.btnWhiteWarm = document.getElementById('btnWhiteWarm');

    // Navigazione Tab
    this.tabButtons = document.querySelectorAll('.segment-btn');
    this.tabPanels = document.querySelectorAll('.tab-panel');

    // Tab 1: Dashboard
    this.brightnessSlider = document.getElementById('brightnessSlider');
    this.brightnessValBadge = document.getElementById('brightnessValBadge');
    this.presetButtons = document.querySelectorAll('.preset-btn');

    // Tab 2: Dinamici & Strobo
    this.effectCards = document.querySelectorAll('.effect-card');
    this.activeEffectIndicator = document.getElementById('activeEffectIndicator');
    this.effectControlBar = document.getElementById('effectControlBar');
    this.effectActiveNameText = document.getElementById('effectActiveNameText');
    this.btnStopEffect = document.getElementById('btnStopEffect');
    this.speedSlider = document.getElementById('speedSlider');
    this.speedValBadge = document.getElementById('speedValBadge');

    // Tab 3: Colori
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
    this.colorSwatches = document.querySelectorAll('.palette-swatch');

    // Tab 4: Generatore Preset da Modello
    this.selectPresetModel = document.getElementById('selectPresetModel');
    this.modelDescText = document.getElementById('modelDescText');
    this.color1Preview = document.getElementById('color1Preview');
    this.color1Native = document.getElementById('color1Native');
    this.color2Group = document.getElementById('color2Group');
    this.color2Preview = document.getElementById('color2Preview');
    this.color2Native = document.getElementById('color2Native');
    this.inputPresetModelName = document.getElementById('inputPresetModelName');
    this.btnSaveTemplatePreset = document.getElementById('btnSaveTemplatePreset');
    this.customPresetsContainer = document.getElementById('customPresetsContainer');

    // Tab 5: Impostazioni & Hardware
    this.toggleAutoConnectBtn = document.getElementById('toggleAutoConnectBtn');
    this.autoConnectStatusText = document.getElementById('autoConnectStatusText');
    this.deviceProfileName = document.getElementById('deviceProfileName');
    this.badgeCurrentOrder = document.getElementById('badgeCurrentOrder');
    this.selectChannelOrder = document.getElementById('selectChannelOrder');
    this.btnTestRed = document.getElementById('btnTestRed');
    this.btnTestGreen = document.getElementById('btnTestGreen');
    this.btnTestBlue = document.getElementById('btnTestBlue');
    this.btnConfirmRedOk = document.getElementById('btnConfirmRedOk');
    this.btnFixGrb = document.getElementById('btnFixGrb');
    this.btnFixBrg = document.getElementById('btnFixBrg');
    this.btnOpenDiagDrawer = document.getElementById('btnOpenDiagDrawer');

    // Drawer Diagnostica BLE
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

  async _initAutoConnect() {
    const isAutoEnabled = localStorage.getItem('need4led_autoconnect_enabled') !== 'false';
    if (!isAutoEnabled) {
      if (this.autoConnectPill) this.autoConnectPill.textContent = 'AUTO: OFF';
      if (this.autoConnectStatusText) this.autoConnectStatusText.textContent = 'DISATTIVATA';
      return;
    }

    if (this.autoConnectPill) this.autoConnectPill.textContent = 'AUTO: ON';
    if (this.autoConnectStatusText) this.autoConnectStatusText.textContent = 'ATTIVA (GETDEVICES)';

    setTimeout(async () => {
      const autoConnected = await this.ble.tryAutoConnect();
      if (autoConnected) {
        this.showToast('CONNESSIONE AUTOMATICA AL VEICOLO COMPLETATA');
      }
    }, 400);
  }

  _attachEvents() {
    // Connessione Bluetooth
    this.btnConnect.addEventListener('click', () => this.handleConnectToggle());

    // Power
    this.btnPowerOn.addEventListener('click', () => this.setPower(true));
    this.btnPowerOff.addEventListener('click', () => this.setPower(false));

    // Massimo Bianco ELK
    if (this.btnMaxWhiteFull) this.btnMaxWhiteFull.addEventListener('click', () => this.applyMaxWhite('full'));
    if (this.btnWhiteCold) this.btnWhiteCold.addEventListener('click', () => this.applyMaxWhite('cold'));
    if (this.btnWhitePure) this.btnWhitePure.addEventListener('click', () => this.applyMaxWhite('pure'));
    if (this.btnWhiteWarm) this.btnWhiteWarm.addEventListener('click', () => this.applyMaxWhite('warm'));

    // Navigazione Tab
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        this.switchTab(tabId);
      });
    });

    // Slider Luminosità
    if (this.brightnessSlider) {
      this.brightnessSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.brightnessValBadge.textContent = `${val}%`;
        this.state.brightness = val;
        this.sendBrightnessCommand(val);
      });
    }

    // Presets Rapidi Guida
    this.presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const presetKey = btn.getAttribute('data-preset');
        this.applyPreset(presetKey);
      });
    });

    // Effetti Dinamici
    this.effectCards.forEach(card => {
      card.addEventListener('click', () => {
        const effectName = card.getAttribute('data-effect');
        this.startDynamicEffect(effectName);
      });
    });

    if (this.btnStopEffect) {
      this.btnStopEffect.addEventListener('click', () => {
        this.stopDynamicEffect();
        this.showToast('EFFETTO INTERROTTO');
      });
    }

    // Slider Velocità Dinamici
    if (this.speedSlider) {
      this.speedSlider.addEventListener('input', (e) => {
        this.effectSpeed = parseInt(e.target.value, 10);
        let speedLabel = 'NORMALE';
        if (this.effectSpeed >= 80) speedLabel = 'VELOCE / STROBO';
        else if (this.effectSpeed <= 30) speedLabel = 'LENTO';
        this.speedValBadge.textContent = `${speedLabel} (${this.effectSpeed}%)`;

        if (this.ble.isConnected && typeof this.encoder.speed === 'function') {
          try {
            this.ble.sendPacket(this.encoder.speed(this.effectSpeed));
          } catch (_) {}
        }
      });
    }

    // Native Color Input (Tab Colori)
    if (this.nativeColorInput) {
      this.nativeColorInput.addEventListener('input', (e) => {
        const hex = e.target.value;
        const r = parseInt(hex.substr(1, 2), 16);
        const g = parseInt(hex.substr(3, 2), 16);
        const b = parseInt(hex.substr(5, 2), 16);
        this.stopDynamicEffect(false);
        this.updateColorValues(r, g, b, true);
      });
    }

    // Sliders Canali RGB Individuali
    const handleRgbChange = () => {
      const r = parseInt(this.sliderR.value, 10);
      const g = parseInt(this.sliderG.value, 10);
      const b = parseInt(this.sliderB.value, 10);
      this.stopDynamicEffect(false);
      this.updateColorValues(r, g, b, true);
    };

    if (this.sliderR) this.sliderR.addEventListener('input', handleRgbChange);
    if (this.sliderG) this.sliderG.addEventListener('input', handleRgbChange);
    if (this.sliderB) this.sliderB.addEventListener('input', handleRgbChange);

    // Swatches Palette Colori Verificati
    this.colorSwatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        const r = parseInt(swatch.getAttribute('data-r'), 10);
        const g = parseInt(swatch.getAttribute('data-g'), 10);
        const b = parseInt(swatch.getAttribute('data-b'), 10);
        this.stopDynamicEffect(false);
        this.updateColorValues(r, g, b, true);
      });
    });

    // ===================================================================
    // Generatore Preset da Modello (Template Creator)
    // ===================================================================
    if (this.selectPresetModel) {
      this.selectPresetModel.addEventListener('change', (e) => {
        this.creatorState.model = e.target.value;
        this._updateCreatorUI();
      });
    }

    if (this.color1Native) {
      this.color1Native.addEventListener('input', (e) => {
        const hex = e.target.value;
        this.creatorState.color1 = {
          r: parseInt(hex.substr(1, 2), 16),
          g: parseInt(hex.substr(3, 2), 16),
          b: parseInt(hex.substr(5, 2), 16),
          hex
        };
        this.color1Preview.style.backgroundColor = hex;
      });
    }

    if (this.color2Native) {
      this.color2Native.addEventListener('input', (e) => {
        const hex = e.target.value;
        this.creatorState.color2 = {
          r: parseInt(hex.substr(1, 2), 16),
          g: parseInt(hex.substr(3, 2), 16),
          b: parseInt(hex.substr(5, 2), 16),
          hex
        };
        this.color2Preview.style.backgroundColor = hex;
      });
    }

    // Swatches rapidi per il generatore preset
    document.querySelectorAll('.creator-swatch-1').forEach(sw => {
      sw.addEventListener('click', () => {
        const hex = sw.getAttribute('data-hex');
        this.creatorState.color1 = {
          r: parseInt(sw.getAttribute('data-r'), 10),
          g: parseInt(sw.getAttribute('data-g'), 10),
          b: parseInt(sw.getAttribute('data-b'), 10),
          hex
        };
        this.color1Preview.style.backgroundColor = hex;
        this.color1Native.value = hex;
      });
    });

    document.querySelectorAll('.creator-swatch-2').forEach(sw => {
      sw.addEventListener('click', () => {
        const hex = sw.getAttribute('data-hex');
        this.creatorState.color2 = {
          r: parseInt(sw.getAttribute('data-r'), 10),
          g: parseInt(sw.getAttribute('data-g'), 10),
          b: parseInt(sw.getAttribute('data-b'), 10),
          hex
        };
        this.color2Preview.style.backgroundColor = hex;
        this.color2Native.value = hex;
      });
    });

    if (this.btnSaveTemplatePreset) {
      this.btnSaveTemplatePreset.addEventListener('click', () => {
        this.saveNewTemplatePreset();
      });
    }

    // ===================================================================
    // Impostazioni & Hardware
    // ===================================================================
    if (this.toggleAutoConnectBtn) {
      this.toggleAutoConnectBtn.addEventListener('click', () => {
        const currentlyEnabled = localStorage.getItem('need4led_autoconnect_enabled') !== 'false';
        const newState = !currentlyEnabled;
        localStorage.setItem('need4led_autoconnect_enabled', newState ? 'true' : 'false');
        this.ble.autoReconnectEnabled = newState;

        if (this.autoConnectPill) this.autoConnectPill.textContent = newState ? 'AUTO: ON' : 'AUTO: OFF';
        if (this.autoConnectStatusText) this.autoConnectStatusText.textContent = newState ? 'ATTIVA (GETDEVICES)' : 'DISATTIVATA';
        this.showToast(newState ? 'AUTO-CONNESSIONE ATTIVATA' : 'AUTO-CONNESSIONE DISATTIVATA');
      });
    }

    if (this.selectChannelOrder) {
      this.selectChannelOrder.addEventListener('change', (e) => {
        this.setChannelOrder(e.target.value);
      });
    }

    // Test rapido 3 canali
    if (this.btnTestRed) {
      this.btnTestRed.addEventListener('click', () => {
        this.vibrate(20);
        this.showToast('TEST ROSSO PURO (255, 0, 0)');
        this.sendColorCommand(255, 0, 0);
      });
    }

    if (this.btnTestGreen) {
      this.btnTestGreen.addEventListener('click', () => {
        this.vibrate(20);
        this.showToast('TEST VERDE PURO (0, 255, 0)');
        this.sendColorCommand(0, 255, 0);
      });
    }

    if (this.btnTestBlue) {
      this.btnTestBlue.addEventListener('click', () => {
        this.vibrate(20);
        this.showToast('TEST BLU PURO (0, 0, 255)');
        this.sendColorCommand(0, 0, 255);
      });
    }

    // Wizard di Risoluzione Hardware
    if (this.btnConfirmRedOk) {
      this.btnConfirmRedOk.addEventListener('click', () => {
        this.showToast('CALIBRAZIONE CONFERMATA: ROSSO CORRETTO');
      });
    }

    if (this.btnFixGrb) {
      this.btnFixGrb.addEventListener('click', () => {
        this.setChannelOrder('GRB');
        this.showToast('PINOUT IMPOSTATO SU GRB');
        this.sendColorCommand(255, 0, 0);
      });
    }

    if (this.btnFixBrg) {
      this.btnFixBrg.addEventListener('click', () => {
        this.setChannelOrder('BRG');
        this.showToast('PINOUT IMPOSTATO SU BRG (OTTIMALE ELK)');
        this.sendColorCommand(255, 0, 0);
      });
    }

    // Diagnostica BLE Drawer
    if (this.btnOpenDiagDrawer) {
      this.btnOpenDiagDrawer.addEventListener('click', () => {
        this.diagDrawer.classList.add('visible');
      });
    }

    if (this.btnCloseDiag) {
      this.btnCloseDiag.addEventListener('click', () => {
        this.diagDrawer.classList.remove('visible');
      });
    }

    if (this.selectProtocol) {
      this.selectProtocol.addEventListener('change', (e) => {
        this.currentProtocol = e.target.value;
        this.encoder = getEncoder(this.currentProtocol);
        this.showToast(`PROTOCOLLO: ${this.currentProtocol.toUpperCase()}`);
        this._saveCurrentDeviceProfile();
      });
    }

    if (this.selectWriteMode) {
      this.selectWriteMode.addEventListener('change', (e) => {
        this.ble.writeMode = e.target.value;
      });
    }

    if (this.selectCharUuid) {
      this.selectCharUuid.addEventListener('change', (e) => {
        this.ble.setActiveCharacteristicByUuid(e.target.value);
      });
    }

    if (this.btnSendRawHex) {
      this.btnSendRawHex.addEventListener('click', () => this.handleSendRawHex());
    }

    if (this.btnClearLog) {
      this.btnClearLog.addEventListener('click', () => {
        this.termWindow.innerHTML = '';
        this.showToast('LOG CANCELLATO');
      });
    }
  }

  _updateCreatorUI() {
    const config = PRESET_MODEL_CONFIGS[this.creatorState.model];
    if (this.modelDescText && config) {
      this.modelDescText.textContent = config.desc;
    }

    if (this.color2Group) {
      this.color2Group.style.display = config && config.requiresColor2 ? 'block' : 'none';
    }
  }

  _initChannelOrderUI() {
    if (this.badgeCurrentOrder) {
      this.badgeCurrentOrder.textContent = `PINOUT: ${this.channelOrder}`;
    }
    if (this.selectChannelOrder) {
      this.selectChannelOrder.value = this.channelOrder;
    }
  }

  setChannelOrder(newOrder) {
    this.channelOrder = newOrder;
    localStorage.setItem('need4led_channel_order', newOrder);
    this._initChannelOrderUI();
    this._saveCurrentDeviceProfile();
  }

  _saveCurrentDeviceProfile() {
    if (!this.currentDeviceId) return;
    const profile = {
      channelOrder: this.channelOrder,
      protocol: this.currentProtocol,
      updatedAt: Date.now()
    };
    localStorage.setItem(`need4led_dev_${this.currentDeviceId}`, JSON.stringify(profile));
  }

  _loadDeviceProfile(device) {
    this.currentDeviceId = device.id;
    if (this.deviceProfileName) {
      this.deviceProfileName.textContent = device.name ? `${device.name} (${device.id.substring(0, 8)})` : `LED (${device.id.substring(0, 8)})`;
    }

    try {
      const savedProfileStr = localStorage.getItem(`need4led_dev_${device.id}`);
      if (savedProfileStr) {
        const profile = JSON.parse(savedProfileStr);
        if (profile.channelOrder) {
          this.channelOrder = profile.channelOrder;
        }
        if (profile.protocol) {
          this.currentProtocol = profile.protocol;
          this.encoder = getEncoder(this.currentProtocol);
          if (this.selectProtocol) this.selectProtocol.value = this.currentProtocol;
        }
        this.ble.log('INFO', '', `Profilo caricato per ${device.name}: Pinout ${this.channelOrder}`);
      } else {
        // Predefinito BRG per chip ELK-BLEDOM / LotusLantern
        const devName = (device.name || '').toUpperCase();
        if (devName.includes('ELK') || devName.includes('LOTUS') || devName.includes('LED') || devName.includes('BLEDOM')) {
          this.channelOrder = 'BRG';
          this.ble.log('INFO', '', `Dispositivo ${device.name}: preimpostato profilo BRG.`);
        }
        this._saveCurrentDeviceProfile();
      }
    } catch (_) {}

    this._initChannelOrderUI();
  }

  switchTab(tabId) {
    this.vibrate(12);
    this.tabButtons.forEach(btn => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    this.tabPanels.forEach(panel => {
      if (panel.id === tabId) {
        panel.classList.add('active');
      } else {
        panel.classList.remove('active');
      }
    });
  }

  vibrate(ms = 15) {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(ms); } catch (_) {}
    }
  }

  showToast(message, durationMs = 2400) {
    if (!this.toastNotice) return;
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
      this.stopDynamicEffect();
      await this.ble.disconnect();
      this.showToast('DISCONNESSO');
    } else {
      try {
        await this.ble.requestDevice(true);
        this.showToast('CONNESSO CON SUCCESSO');
      } catch (err) {}
    }
  }

  async setPower(on) {
    this.vibrate(25);
    this.stopDynamicEffect();
    this.state.isOn = on;

    if (on) {
      this.btnPowerOn.classList.add('active');
      this.btnPowerOff.classList.remove('active');
      this.showToast('ACCENSIONE EFFETTUATA');
    } else {
      this.btnPowerOff.classList.add('active');
      this.btnPowerOn.classList.remove('active');
      this.showToast('SPEGNIMENTO EFFETTUATO');
    }

    try {
      const packet = this.encoder.power(on);
      await this.ble.sendPacket(packet, true);
    } catch (err) {
      if (!this.ble.isConnected) {
        this.showToast('BLUETOOTH NON CONNESSO', 2800);
      }
    }
  }

  async applyMaxWhite(shade = 'full') {
    this.vibrate(30);
    this.stopDynamicEffect();

    this.state.brightness = 100;
    if (this.brightnessSlider) this.brightnessSlider.value = 100;
    if (this.brightnessValBadge) this.brightnessValBadge.textContent = '100%';

    try {
      await this.ble.sendPacket(this.encoder.brightness(100), true);

      if (shade === 'full') {
        this.updateColorValues(255, 255, 255, true);
        if (typeof this.encoder.whiteGrayscale === 'function') {
          setTimeout(() => {
            this.ble.sendPacket(this.encoder.whiteGrayscale(), true).catch(() => {});
          }, 60);
        }
        this.showToast('MASSIMO BIANCO 100% (FULL LUMEN)');
      } else if (shade === 'cold') {
        this.updateColorValues(220, 240, 255, true);
        if (typeof this.encoder.whiteCold === 'function') {
          setTimeout(() => {
            this.ble.sendPacket(this.encoder.whiteCold(), true).catch(() => {});
          }, 60);
        }
        this.showToast('BIANCO FREDDO 6500K');
      } else if (shade === 'pure') {
        this.updateColorValues(255, 255, 255, true);
        this.showToast('BIANCO PURO 100% RGB');
      } else if (shade === 'warm') {
        this.updateColorValues(255, 215, 150, true);
        if (typeof this.encoder.whiteWarm === 'function') {
          setTimeout(() => {
            this.ble.sendPacket(this.encoder.whiteWarm(), true).catch(() => {});
          }, 60);
        }
        this.showToast('BIANCO CALDO 3200K');
      }
    } catch (e) {
      if (!this.ble.isConnected) {
        this.showToast('BLUETOOTH NON CONNESSO', 2800);
      }
    }
  }

  // ===================================================================
  // MODALITÀ DINAMICHE: Polizia 3-Fasi (Rosso -> Nero -> Blu) & Effetti
  // ===================================================================
  startDynamicEffect(effectName) {
    this.vibrate(20);
    this.stopDynamicEffect(false);

    this.activeEffect = effectName;
    if (this.activeEffectIndicator) {
      this.activeEffectIndicator.textContent = 'ATTIVO';
      this.activeEffectIndicator.style.background = 'rgba(0, 240, 255, 0.25)';
      this.activeEffectIndicator.style.color = 'var(--neon-cyan)';
    }
    if (this.effectControlBar) {
      this.effectControlBar.style.display = 'flex';
    }

    this.effectCards.forEach(c => {
      if (c.getAttribute('data-effect') === effectName) {
        c.classList.add('active-running');
      } else {
        c.classList.remove('active-running');
      }
    });

    if (this.ble.isConnected && typeof this.encoder.speed === 'function') {
      try {
        this.ble.sendPacket(this.encoder.speed(this.effectSpeed));
      } catch (_) {}
    }

    const getInterval = () => Math.round(520 - (this.effectSpeed * 4.1));

    switch (effectName) {
      case 'police': {
        // Sequenza rigorosa continua: Rosso -> Nero -> Blu -> Rosso -> Nero -> Blu...
        if (this.effectActiveNameText) {
          this.effectActiveNameText.textContent = 'POLIZIA (ROSSO -> NERO -> BLU)';
        }
        this.showToast('MODALITÀ POLIZIA ATTIVATA');

        let stepIndex = 0;
        const policeLoop = () => {
          if (this.activeEffect !== 'police') return;

          const currentStep = POLICE_SEQUENCE[stepIndex % 3];
          this.sendColorCommand(currentStep.r, currentStep.g, currentStep.b);

          if (this.ambientTop) {
            if (currentStep.r > 0) {
              this.ambientTop.style.background = 'radial-gradient(circle, rgba(255, 59, 48, 0.45) 0%, rgba(0, 0, 0, 0) 70%)';
            } else if (currentStep.b > 0) {
              this.ambientTop.style.background = 'radial-gradient(circle, rgba(10, 132, 255, 0.45) 0%, rgba(0, 0, 0, 0) 70%)';
            } else {
              this.ambientTop.style.background = 'none';
            }
          }

          stepIndex++;
          const interval = Math.max(85, Math.round(POLICE_STEP_INTERVAL_MS * (1.4 - (this.effectSpeed / 160))));
          this.effectTimer = setTimeout(policeLoop, interval);
        };

        policeLoop();
        break;
      }

      case 'white_strobe': {
        if (this.effectActiveNameText) this.effectActiveNameText.textContent = 'STROBO BIANCO SICUREZZA';
        this.showToast('STROBO BIANCO ATTIVATO');
        let on = false;
        const strobeLoop = () => {
          if (this.activeEffect !== 'white_strobe') return;
          on = !on;
          if (on) {
            this.sendColorCommand(255, 255, 255);
            if (this.ambientTop) this.ambientTop.style.background = 'radial-gradient(circle, rgba(255, 255, 255, 0.45) 0%, rgba(0, 0, 0, 0) 70%)';
          } else {
            this.sendColorCommand(0, 0, 0);
            if (this.ambientTop) this.ambientTop.style.background = 'none';
          }
          this.effectTimer = setTimeout(strobeLoop, Math.max(85, Math.round(getInterval() * 0.75)));
        };
        strobeLoop();
        break;
      }

      case 'rainbow': {
        if (this.effectActiveNameText) this.effectActiveNameText.textContent = 'FLUSSO ARCOBALENO';
        this.showToast('FLUSSO ARCOBALENO ATTIVATO');
        let hue = 0;
        const rainbowLoop = () => {
          if (this.activeEffect !== 'rainbow') return;
          hue = (hue + 18) % 360;
          const [r, g, b] = this._hslToRgb(hue / 360, 1, 0.5);
          this.sendColorCommand(r, g, b);
          if (this.ambientTop) this.ambientTop.style.background = `radial-gradient(circle, rgba(${r}, ${g}, ${b}, 0.3) 0%, rgba(0, 0, 0, 0) 70%)`;
          this.effectTimer = setTimeout(rainbowLoop, Math.max(85, Math.round(getInterval() * 0.9)));
        };
        rainbowLoop();
        break;
      }

      case 'cyber_breath': {
        if (this.effectActiveNameText) this.effectActiveNameText.textContent = 'RESPIRO CYBER (CIANO / VIOLA)';
        this.showToast('RESPIRO CYBER ATTIVATO');
        let t = 0;
        const breathLoop = () => {
          if (this.activeEffect !== 'cyber_breath') return;
          const factor = (Math.sin(t) + 1) / 2;
          const r = Math.round(factor * 191);
          const g = Math.round((1 - factor) * 240 + factor * 90);
          const b = Math.round((1 - factor) * 255 + factor * 242);

          this.sendColorCommand(r, g, b);
          t += 0.22;
          this.effectTimer = setTimeout(breathLoop, Math.max(75, Math.round(getInterval() * 0.5)));
        };
        breathLoop();
        break;
      }

      case 'amber_hazard': {
        if (this.effectActiveNameText) this.effectActiveNameText.textContent = 'HAZARD EMERGENZA';
        this.showToast('HAZARD EMERGENZA ATTIVATO');
        let on = false;
        const hazardLoop = () => {
          if (this.activeEffect !== 'amber_hazard') return;
          on = !on;
          if (on) {
            this.sendColorCommand(255, 140, 0);
            if (this.ambientTop) this.ambientTop.style.background = 'radial-gradient(circle, rgba(255, 140, 0, 0.45) 0%, rgba(0, 0, 0, 0) 70%)';
          } else {
            this.sendColorCommand(0, 0, 0);
            if (this.ambientTop) this.ambientTop.style.background = 'none';
          }
          this.effectTimer = setTimeout(hazardLoop, Math.max(90, Math.round(getInterval() * 0.95)));
        };
        hazardLoop();
        break;
      }

      case 'party_flash': {
        if (this.effectActiveNameText) this.effectActiveNameText.textContent = 'STROBO PARTY MULTICOLOR';
        this.showToast('STROBO PARTY ATTIVATO');
        const partyColors = [
          [255, 0, 0], [0, 255, 0], [0, 0, 255],
          [255, 255, 0], [0, 240, 255], [255, 0, 255]
        ];
        let pIndex = 0;
        const partyLoop = () => {
          if (this.activeEffect !== 'party_flash') return;
          const [r, g, b] = partyColors[pIndex % partyColors.length];
          this.sendColorCommand(r, g, b);
          pIndex++;
          this.effectTimer = setTimeout(partyLoop, Math.max(80, Math.round(getInterval() * 0.6)));
        };
        partyLoop();
        break;
      }
    }
  }

  stopDynamicEffect(resetIndicator = true) {
    if (this.effectTimer) {
      clearTimeout(this.effectTimer);
      this.effectTimer = null;
    }
    this.activeEffect = null;

    if (resetIndicator) {
      if (this.activeEffectIndicator) {
        this.activeEffectIndicator.textContent = 'STATICO';
        this.activeEffectIndicator.style.background = 'rgba(255, 255, 255, 0.08)';
        this.activeEffectIndicator.style.color = 'var(--text-secondary)';
      }
      if (this.effectControlBar) {
        this.effectControlBar.style.display = 'none';
      }
      this.effectCards.forEach(c => c.classList.remove('active-running'));
      if (this.ambientTop) {
        const hex = this.colorHexText ? this.colorHexText.textContent : '#00F0FF';
        this.ambientTop.style.background = `radial-gradient(circle, ${hex}28 0%, rgba(0, 0, 0, 0) 70%)`;
      }
    }
  }

  // ===================================================================
  // PRESET RAPIDI DI GUIDA
  // ===================================================================
  applyPreset(presetKey) {
    this.vibrate(20);
    this.stopDynamicEffect();

    switch (presetKey) {
      case 'white':
        this.state.brightness = 100;
        this.updateColorValues(255, 255, 255, true);
        this.showToast('PRESET: STRADA (BIANCO VISIBILITÀ)');
        break;
      case 'red':
        this.state.brightness = 100;
        this.updateColorValues(255, 0, 0, true);
        this.showToast('PRESET: STOP (ROSSO)');
        break;
      case 'cyan':
        this.state.brightness = 95;
        this.updateColorValues(0, 240, 255, true);
        this.showToast('PRESET: CYBER CIANO');
        break;
      case 'purple':
        this.state.brightness = 95;
        this.updateColorValues(191, 90, 242, true);
        this.showToast('PRESET: NEON VIOLA');
        break;
      case 'amber':
        this.state.brightness = 100;
        this.updateColorValues(255, 149, 0, true);
        this.showToast('PRESET: AMBRA SICUREZZA');
        break;
      case 'green':
        this.state.brightness = 90;
        this.updateColorValues(0, 255, 0, true);
        this.showToast('PRESET: ECO VERDE');
        break;
    }

    if (this.brightnessSlider) this.brightnessSlider.value = this.state.brightness;
    if (this.brightnessValBadge) this.brightnessValBadge.textContent = `${this.state.brightness}%`;
    this.sendBrightnessCommand(this.state.brightness);
  }

  updateColorValues(r, g, b, transmit = false) {
    this.state.r = r;
    this.state.g = g;
    this.state.b = b;

    const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
    if (this.colorHexText) this.colorHexText.textContent = hex;
    if (this.colorIndicatorCircle) {
      this.colorIndicatorCircle.style.backgroundColor = hex;
      this.colorIndicatorCircle.style.boxShadow = `0 0 20px ${hex}88`;
    }
    if (this.rgbSummaryText) this.rgbSummaryText.textContent = `R: ${r} | G: ${g} | B: ${b}`;
    if (this.nativeColorInput) this.nativeColorInput.value = hex;

    if (this.sliderR) this.sliderR.value = r;
    if (this.sliderG) this.sliderG.value = g;
    if (this.sliderB) this.sliderB.value = b;
    if (this.valR) this.valR.textContent = r;
    if (this.valG) this.valG.textContent = g;
    if (this.valB) this.valB.textContent = b;

    if (this.ambientTop) {
      this.ambientTop.style.background = `radial-gradient(circle, ${hex}28 0%, rgba(0, 0, 0, 0) 70%)`;
    }

    if (transmit) {
      this.sendColorCommand(r, g, b);
    }
  }

  sendColorCommand(r, g, b) {
    if (!this.ble.isConnected) return;
    try {
      const packet = this.encoder.color(r, g, b, this.channelOrder);
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

  // ===================================================================
  // PRESET PERSONALIZZATI DA MODELLO
  // ===================================================================
  _loadCustomPresets() {
    try {
      const saved = localStorage.getItem('need4led_custom_presets');
      if (saved) return JSON.parse(saved);
    } catch (_) {}

    return [
      {
        id: 'p_police_classic',
        name: 'POLIZIA STROBO CLASSICO',
        model: PRESET_MODELS.STROBE_POLICE,
        color1: { r: 255, g: 0, b: 0, hex: '#FF0000' },
        color2: { r: 0, g: 0, b: 255, hex: '#0000FF' }
      },
      {
        id: 'p_cyber_breath',
        name: 'CYBER BREATH CIANO-VIOLA',
        model: PRESET_MODELS.BREATHING,
        color1: { r: 0, g: 240, b: 255, hex: '#00F0FF' },
        color2: { r: 191, g: 90, b: 242, hex: '#BF5AF2' }
      },
      {
        id: 'p_strobe_red',
        name: 'STROBO STOP EMERGENZA',
        model: PRESET_MODELS.STROBE_SINGLE,
        color1: { r: 255, g: 0, b: 0, hex: '#FF0000' }
      },
      {
        id: 'p_neon_amber',
        name: 'CRUISING AMBRA STATICO',
        model: PRESET_MODELS.STATIC_PURE,
        color1: { r: 255, g: 159, b: 10, hex: '#FF9F0A' }
      }
    ];
  }

  saveNewTemplatePreset() {
    const rawName = this.inputPresetModelName ? this.inputPresetModelName.value.trim() : '';
    const config = PRESET_MODEL_CONFIGS[this.creatorState.model];
    const name = rawName.toUpperCase() || `${config.name} PERSONALIZZATO`;

    const newPreset = {
      id: 'p_' + Date.now(),
      name,
      model: this.creatorState.model,
      color1: { ...this.creatorState.color1 },
      color2: config.requiresColor2 ? { ...this.creatorState.color2 } : null
    };

    this.customPresets.unshift(newPreset);
    this._persistCustomPresets();
    this._renderCustomPresets();
    if (this.inputPresetModelName) this.inputPresetModelName.value = '';

    this.showToast(`PRESET "${name}" SALVATO`);
    // Applica immediatamente il preset salvato a 1 tocco
    this.applyCustomPreset(newPreset);
  }

  applyCustomPreset(preset) {
    this.vibrate(20);
    this.stopDynamicEffect();

    const config = PRESET_MODEL_CONFIGS[preset.model] || PRESET_MODEL_CONFIGS[PRESET_MODELS.STATIC_PURE];

    if (preset.model === PRESET_MODELS.STATIC_PURE) {
      this.updateColorValues(preset.color1.r, preset.color1.g, preset.color1.b, true);
      this.showToast(`PRESET ATTIVATO: ${preset.name}`);
      return;
    }

    // Modalità basata su animazione interna pre-calibrata
    this.activeEffect = `custom_${preset.id}`;
    if (this.activeEffectIndicator) {
      this.activeEffectIndicator.textContent = 'ATTIVO';
      this.activeEffectIndicator.style.background = 'rgba(0, 240, 255, 0.25)';
      this.activeEffectIndicator.style.color = 'var(--neon-cyan)';
    }
    if (this.effectControlBar) {
      this.effectControlBar.style.display = 'flex';
      if (this.effectActiveNameText) this.effectActiveNameText.textContent = preset.name;
    }

    this.showToast(`PRESET ATTIVATO: ${preset.name}`);

    if (preset.model === PRESET_MODELS.STROBE_SINGLE) {
      // Colore 1 -> Nero -> Colore 1 -> Nero
      let on = false;
      const loop = () => {
        if (this.activeEffect !== `custom_${preset.id}`) return;
        on = !on;
        if (on) {
          this.sendColorCommand(preset.color1.r, preset.color1.g, preset.color1.b);
        } else {
          this.sendColorCommand(0, 0, 0);
        }
        this.effectTimer = setTimeout(loop, config.intervalMs || 120);
      };
      loop();
    } else if (preset.model === PRESET_MODELS.STROBE_POLICE) {
      // Colore 1 -> Nero -> Colore 2 -> Colore 1 -> Nero -> Colore 2
      let step = 0;
      const loop = () => {
        if (this.activeEffect !== `custom_${preset.id}`) return;
        const phase = step % 6;
        if (phase === 0 || phase === 3) {
          this.sendColorCommand(preset.color1.r, preset.color1.g, preset.color1.b);
        } else if (phase === 1 || phase === 4) {
          this.sendColorCommand(0, 0, 0);
        } else {
          const c2 = preset.color2 || { r: 0, g: 0, b: 255 };
          this.sendColorCommand(c2.r, c2.g, c2.b);
        }
        step++;
        this.effectTimer = setTimeout(loop, config.intervalMs || 120);
      };
      loop();
    } else if (preset.model === PRESET_MODELS.ALTERNATE_DIRECT) {
      // Colore 1 -> Colore 2 diretto
      let toggle = false;
      const loop = () => {
        if (this.activeEffect !== `custom_${preset.id}`) return;
        toggle = !toggle;
        const c2 = preset.color2 || { r: 0, g: 0, b: 255 };
        const activeC = toggle ? preset.color1 : c2;
        this.sendColorCommand(activeC.r, activeC.g, activeC.b);
        this.effectTimer = setTimeout(loop, config.intervalMs || 220);
      };
      loop();
    } else if (preset.model === PRESET_MODELS.BREATHING) {
      // Transizione fluida continua tra Colore 1 e Colore 2
      let t = 0;
      const c2 = preset.color2 || { r: 0, g: 0, b: 255 };
      const loop = () => {
        if (this.activeEffect !== `custom_${preset.id}`) return;
        const factor = (Math.sin(t) + 1) / 2;
        const r = Math.round(preset.color1.r * (1 - factor) + c2.r * factor);
        const g = Math.round(preset.color1.g * (1 - factor) + c2.g * factor);
        const b = Math.round(preset.color1.b * (1 - factor) + c2.b * factor);
        this.sendColorCommand(r, g, b);
        t += 0.25;
        this.effectTimer = setTimeout(loop, config.stepIntervalMs || 80);
      };
      loop();
    }
  }

  deleteCustomPreset(id) {
    this.customPresets = this.customPresets.filter(p => p.id !== id);
    this._persistCustomPresets();
    this._renderCustomPresets();
    this.showToast('PRESET ELIMINATO');
  }

  _persistCustomPresets() {
    try {
      localStorage.setItem('need4led_custom_presets', JSON.stringify(this.customPresets));
    } catch (_) {}
  }

  _renderCustomPresets() {
    if (!this.customPresetsContainer) return;

    if (this.customPresets.length === 0) {
      this.customPresetsContainer.innerHTML = `
        <div class="empty-presets-placeholder">
          <span>NESSUN PRESET SALVATO. CREA UN PRESET DA MODELLO E SALVALO CON 1 TOCCO.</span>
        </div>
      `;
      return;
    }

    this.customPresetsContainer.innerHTML = '';
    this.customPresets.forEach(preset => {
      const config = PRESET_MODEL_CONFIGS[preset.model] || { name: 'STATICO' };
      const c1Hex = preset.color1.hex || '#00F0FF';
      const c2Hex = preset.color2 ? preset.color2.hex : null;

      const card = document.createElement('div');
      card.className = 'custom-preset-card';

      const dualSwatch = c2Hex
        ? `<div class="preset-dual-swatches">
             <span class="swatch-half" style="background-color: ${c1Hex};"></span>
             <span class="swatch-half" style="background-color: ${c2Hex};"></span>
           </div>`
        : `<div class="preset-single-swatch" style="background-color: ${c1Hex}; box-shadow: 0 0 10px ${c1Hex}88;"></div>`;

      card.innerHTML = `
        <div class="custom-preset-left">
          ${dualSwatch}
          <div class="custom-preset-text-wrap">
            <div class="custom-preset-name">${preset.name}</div>
            <div class="custom-preset-model-tag">${config.name}</div>
          </div>
        </div>
        <button class="btn-delete-preset" title="Elimina Preset" aria-label="Elimina">ELIMINA</button>
      `;

      card.querySelector('.custom-preset-left').addEventListener('click', () => {
        this.applyCustomPreset(preset);
      });

      card.querySelector('.btn-delete-preset').addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteCustomPreset(preset.id);
      });

      this.customPresetsContainer.appendChild(card);
    });
  }

  _hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  async handleSendRawHex() {
    const rawStr = this.inputRawHex.value.trim();
    if (!rawStr) return;

    try {
      const bytes = hexToBytes(rawStr);
      await this.ble.sendPacket(bytes, true);
      this.showToast(`INVIATI ${bytes.length} BYTES`);
      this.vibrate(15);
    } catch (err) {
      this.showToast(`ERRORE HEX: ${err.message}`, 3000);
      this.ble.log('ERROR', rawStr, err.message);
    }
  }

  onDevicePaired(device) {
    this._loadDeviceProfile(device);
  }

  onBleStatusChange({ state, message }) {
    if (this.statusBadge) this.statusBadge.className = `status-badge ${state}`;
    if (this.statusLabel) this.statusLabel.textContent = message.toUpperCase();

    if (state === 'connected') {
      this.btnConnect.classList.add('connected-state');
      this.connectText.textContent = 'DISCONNETTI';
      if (this.connectIcon) this.connectIcon.textContent = 'STOP';
      const devName = this.ble.device ? this.ble.device.name || 'LED Controller' : 'LED';
      this.deviceSummary.textContent = `${devName.toUpperCase()} [${this.channelOrder}]`;
    } else if (state === 'disconnected') {
      this.btnConnect.classList.remove('connected-state');
      this.connectText.textContent = 'CONNETTI STRISCE LED';
      if (this.connectIcon) this.connectIcon.textContent = 'LINK';
      this.deviceSummary.textContent = 'NESSUN CONTROLLER ATTIVO';
      this.btnPowerOn.classList.remove('active');
      this.btnPowerOff.classList.remove('active');
      this.stopDynamicEffect();
    }
  }

  onBleLog({ time, direction, hex, detail }) {
    if (!this.termWindow) return;
    const entry = document.createElement('div');
    entry.className = 'term-entry';

    let dirClass = 'term-info';
    let dirSymbol = '[INFO]';
    if (direction === 'TX') {
      dirClass = 'term-tx';
      dirSymbol = '[TX]';
    } else if (direction === 'RX') {
      dirClass = 'term-rx';
      dirSymbol = '[RX]';
    } else if (direction === 'ERROR') {
      dirClass = 'term-error';
      dirSymbol = '[ERR]';
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

  onGattDiscovered(services) {
    if (!this.selectCharUuid || !this.gattTreeContainer) return;
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
