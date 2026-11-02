/**
 * Need4Led — UI Controller
 * Gestione interfaccia, navigazione a schede, auto-associazione dispositivo all'avvio,
 * watchdog riconnessione, profili cromatici per dispositivo, calibrazione pinout automatica
 * e modalità dinamiche ad alta precisione (Polizia Blu & Rosso puro a doppio burst).
 */

import { Protocols, getEncoder, hexToBytes, bytesToHex, remapColorChannels } from './protocols.js';

export class UIController {
  constructor(bleManager) {
    this.ble = bleManager;
    this.currentProtocol = Protocols.LOTUS_STANDARD;
    this.encoder = getEncoder(this.currentProtocol);

    // Canale attivo per il dispositivo connesso (default su BRG per controller ELK)
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

    // Gestione Effetti Dinamici
    this.activeEffect = null;
    this.effectTimer = null;
    this.effectSpeed = 80;

    // Preset Personalizzati
    this.customPresets = this._loadCustomPresets();

    this._bindElements();
    this._attachEvents();
    this._renderCustomPresets();
    this._initChannelOrderUI();

    // Tenta l'auto-associazione immediata all'avvio dell'app
    this._initAutoConnect();
  }

  _bindElements() {
    // Header & Status
    this.btnOpenDiag = document.getElementById('btnOpenDiag');
    this.btnOpenCalib = document.getElementById('btnOpenCalib');
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

    // Massimo Bianco ELK
    this.btnMaxWhiteFull = document.getElementById('btnMaxWhiteFull');
    this.btnWhiteCold = document.getElementById('btnWhiteCold');
    this.btnWhitePure = document.getElementById('btnWhitePure');
    this.btnWhiteWarm = document.getElementById('btnWhiteWarm');

    // Tab Navigation
    this.tabButtons = document.querySelectorAll('.segment-btn');
    this.tabPanels = document.querySelectorAll('.tab-panel');

    // Tab 1: Rapido & Guida
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
    this.btnFixBrg = document.getElementById('btnFixBrg');

    // Tab 3: Colori & Calibrazione
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
    this.badgeCurrentOrder = document.getElementById('badgeCurrentOrder');
    this.selectChannelOrder = document.getElementById('selectChannelOrder');
    this.deviceProfileName = document.getElementById('deviceProfileName');
    this.btnTestRed = document.getElementById('btnTestRed');
    this.btnTestGreen = document.getElementById('btnTestGreen');
    this.btnTestBlue = document.getElementById('btnTestBlue');

    // Bottoni Wizard Visivo (Cosa vedi sul veicolo?)
    this.btnSawRed = document.getElementById('btnSawRed');
    this.btnSawGreen = document.getElementById('btnSawGreen');
    this.btnSawBlue = document.getElementById('btnSawBlue');

    // Tab 4: I Miei Preset
    this.btnOpenSavePresetModal = document.getElementById('btnOpenSavePresetModal');
    this.createPresetBox = document.getElementById('createPresetBox');
    this.btnClosePresetBox = document.getElementById('btnClosePresetBox');
    this.newPresetColorPreview = document.getElementById('newPresetColorPreview');
    this.inputPresetName = document.getElementById('inputPresetName');
    this.newPresetSummary = document.getElementById('newPresetSummary');
    this.btnConfirmSavePreset = document.getElementById('btnConfirmSavePreset');
    this.customPresetsContainer = document.getElementById('customPresetsContainer');

    // Drawer Diagnostica
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
    // Prova ad agganciarsi automaticamente al monopattino senza richiedere tap
    setTimeout(async () => {
      const autoConnected = await this.ble.tryAutoConnect();
      if (autoConnected) {
        this.showToast('⚡ Connesso automaticamente al tuo veicolo!');
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
    this.btnMaxWhiteFull.addEventListener('click', () => this.applyMaxWhite('full'));
    this.btnWhiteCold.addEventListener('click', () => this.applyMaxWhite('cold'));
    this.btnWhitePure.addEventListener('click', () => this.applyMaxWhite('pure'));
    this.btnWhiteWarm.addEventListener('click', () => this.applyMaxWhite('warm'));

    // Navigazione Tab
    this.tabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.getAttribute('data-tab');
        this.switchTab(tabId);
      });
    });

    this.btnOpenCalib.addEventListener('click', () => {
      this.switchTab('tab-color');
      const calibCard = document.querySelector('.calibration-card');
      if (calibCard) calibCard.scrollIntoView({ behavior: 'smooth' });
    });

    // Slider Luminosità Rapida
    this.brightnessSlider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      this.brightnessValBadge.textContent = `${val}%`;
      this.state.brightness = val;
      this.sendBrightnessCommand(val);
    });

    // Presets Rapidi Guida
    this.presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const presetKey = btn.getAttribute('data-preset');
        this.applyPreset(presetKey);
      });
    });

    // Effetti Dinamici Cards
    this.effectCards.forEach(card => {
      card.addEventListener('click', () => {
        const effectName = card.getAttribute('data-effect');
        this.startDynamicEffect(effectName);
      });
    });

    this.btnStopEffect.addEventListener('click', () => {
      this.stopDynamicEffect();
      this.showToast('Effetto fermato');
    });

    // Slider Velocità Effetto
    this.speedSlider.addEventListener('input', (e) => {
      this.effectSpeed = parseInt(e.target.value, 10);
      let speedLabel = 'Normale';
      if (this.effectSpeed >= 80) speedLabel = 'Veloce / Strobo';
      else if (this.effectSpeed <= 30) speedLabel = 'Lento / Relax';
      this.speedValBadge.textContent = `${speedLabel} (${this.effectSpeed}%)`;

      if (this.ble.isConnected && typeof this.encoder.speed === 'function') {
        try {
          this.ble.sendPacket(this.encoder.speed(this.effectSpeed));
        } catch (_) {}
      }
    });

    // Correzione a 1 tocco: Fix per Polizia Blu & Giallo ➔ Rosso & Blu
    if (this.btnFixBrg) {
      this.btnFixBrg.addEventListener('click', () => {
        this.setChannelOrder('BRG');
        this.showToast('✅ Calibrazione BRG applicata! Modalità Polizia impostata su Rosso & Blu puro.', 4000);
        // Riavvia effetto polizia se era attivo
        if (this.activeEffect === 'police') {
          this.startDynamicEffect('police');
        } else {
          this.sendColorCommand(255, 0, 0);
        }
      });
    }

    // Native Color Input
    this.nativeColorInput.addEventListener('input', (e) => {
      const hex = e.target.value;
      const r = parseInt(hex.substr(1, 2), 16);
      const g = parseInt(hex.substr(3, 2), 16);
      const b = parseInt(hex.substr(5, 2), 16);
      this.stopDynamicEffect(false);
      this.updateColorValues(r, g, b, true);
    });

    // Sliders Canali RGB
    const handleRgbChange = () => {
      const r = parseInt(this.sliderR.value, 10);
      const g = parseInt(this.sliderG.value, 10);
      const b = parseInt(this.sliderB.value, 10);
      this.stopDynamicEffect(false);
      this.updateColorValues(r, g, b, true);
    };

    this.sliderR.addEventListener('input', handleRgbChange);
    this.sliderG.addEventListener('input', handleRgbChange);
    this.sliderB.addEventListener('input', handleRgbChange);

    // Selettore Ordine Canali Manuale
    this.selectChannelOrder.addEventListener('change', (e) => {
      this.setChannelOrder(e.target.value);
    });

    // Test Canali Singoli
    this.btnTestRed.addEventListener('click', () => {
      this.vibrate(20);
      this.showToast('Invio comando ROSSO puro...');
      this.sendColorCommand(255, 0, 0);
    });

    this.btnTestGreen.addEventListener('click', () => {
      this.vibrate(20);
      this.showToast('Invio comando VERDE puro...');
      this.sendColorCommand(0, 255, 0);
    });

    this.btnTestBlue.addEventListener('click', () => {
      this.vibrate(20);
      this.showToast('Invio comando BLU puro...');
      this.sendColorCommand(0, 0, 255);
    });

    // Wizard di Risoluzione Automatica: "Ho premuto Test Rosso, e sul veicolo..."
    if (this.btnSawRed) {
      this.btnSawRed.addEventListener('click', () => {
        // Se vede già rosso, l'attuale ordine o RGB è corretto
        this.setChannelOrder(this.channelOrder);
        this.showToast('✅ Perfetto! Canale Rosso confermato corretto.');
      });
    }

    if (this.btnSawGreen) {
      this.btnSawGreen.addEventListener('click', () => {
        // Se premendo Rosso si accende Verde, i pin 1 e 2 sono invertiti -> GRB!
        this.setChannelOrder('GRB');
        this.showToast('🎯 Auto-calibrato su GRB! Ora il Rosso corrisponde al Rosso reale.');
        this.sendColorCommand(255, 0, 0);
      });
    }

    if (this.btnSawBlue) {
      this.btnSawBlue.addEventListener('click', () => {
        // Se premendo Rosso si accende Blu, il primo pin è il Blu -> BRG!
        this.setChannelOrder('BRG');
        this.showToast('🎯 Auto-calibrato su BRG! Risolto errore Blu/Giallo: ora Rosso e Blu sono perfetti.');
        this.sendColorCommand(255, 0, 0);
      });
    }

    // Preset Personalizzati
    this.btnOpenSavePresetModal.addEventListener('click', () => {
      const hex = '#' + [this.state.r, this.state.g, this.state.b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
      this.newPresetColorPreview.style.backgroundColor = hex;
      this.newPresetSummary.textContent = `${this.state.brightness}% Lum | ${hex}`;
      this.inputPresetName.value = '';
      this.createPresetBox.style.display = 'flex';
      this.inputPresetName.focus();
    });

    this.btnClosePresetBox.addEventListener('click', () => {
      this.createPresetBox.style.display = 'none';
    });

    this.btnConfirmSavePreset.addEventListener('click', () => {
      const name = this.inputPresetName.value.trim() || `Preset ${this.customPresets.length + 1}`;
      this.saveCurrentAsCustomPreset(name);
      this.createPresetBox.style.display = 'none';
    });

    // Drawer Diagnostica
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

    this.selectProtocol.addEventListener('change', (e) => {
      this.currentProtocol = e.target.value;
      this.encoder = getEncoder(this.currentProtocol);
      this.ble.log('INFO', '', `Protocollo attivo: ${this.currentProtocol}`);
      this.showToast(`Protocollo: ${e.target.selectedOptions[0].text}`);
      this._saveCurrentDeviceProfile();
    });

    this.selectWriteMode.addEventListener('change', (e) => {
      this.ble.writeMode = e.target.value;
      this.showToast(`Scrittura: ${this.ble.writeMode}`);
    });

    this.selectCharUuid.addEventListener('change', (e) => {
      if (e.target.value) {
        this.ble.setActiveCharacteristicByUuid(e.target.value);
        this.showToast(`Caratteristica: ${e.target.value.substring(0, 8)}...`);
      }
    });

    this.btnSendRawHex.addEventListener('click', () => this.handleSendRawHex());
    this.inputRawHex.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleSendRawHex();
    });

    this.btnClearLog.addEventListener('click', () => {
      this.termWindow.innerHTML = '';
      this.showToast('Log terminale svuotato');
    });
  }

  setChannelOrder(newOrder) {
    this.channelOrder = newOrder;
    localStorage.setItem('need4led_channel_order', newOrder);
    this._initChannelOrderUI();
    this._saveCurrentDeviceProfile();
    this.ble.log('INFO', '', `Calibrazione pinout impostata su: ${newOrder}`);
    this.sendColorCommand(this.state.r, this.state.g, this.state.b);
  }

  _initChannelOrderUI() {
    if (this.selectChannelOrder) {
      this.selectChannelOrder.value = this.channelOrder;
    }
    if (this.badgeCurrentOrder) {
      this.badgeCurrentOrder.textContent = `ORDINE: ${this.channelOrder}`;
    }
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
      this.deviceProfileName.textContent = device.name || 'LED Controller';
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
        this.ble.log('INFO', '', `Profilo hardware caricato per ${device.name}: Ordine ${this.channelOrder}`);
      } else {
        // Nessun profilo precedente per questo dispositivo:
        // Se il dispositivo è ELK-BLEDOM, impostiamo automaticamente BRG
        const devName = (device.name || '').toUpperCase();
        if (devName.includes('ELK') || devName.includes('LOTUS') || devName.includes('LED')) {
          this.channelOrder = 'BRG';
          this.ble.log('INFO', '', `Rilevato chip ${device.name}: applicata auto-calibrazione BRG.`);
        }
        this._saveCurrentDeviceProfile();
      }
    } catch (_) {}

    this._initChannelOrderUI();
  }

  switchTab(tabId) {
    this.vibrate(15);
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

  showToast(message, durationMs = 2600) {
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
      this.showToast('Strisce LED disconnesse');
    } else {
      try {
        await this.ble.requestDevice(true);
        this.showToast('Connessione completata!');
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

  async applyMaxWhite(shade = 'full') {
    this.vibrate(30);
    this.stopDynamicEffect();

    this.state.brightness = 100;
    this.brightnessSlider.value = 100;
    this.brightnessValBadge.textContent = '100%';

    try {
      await this.ble.sendPacket(this.encoder.brightness(100), true);

      if (shade === 'full') {
        this.updateColorValues(255, 255, 255, true);
        if (typeof this.encoder.whiteGrayscale === 'function') {
          setTimeout(() => {
            this.ble.sendPacket(this.encoder.whiteGrayscale(), true).catch(() => {});
          }, 60);
        }
        this.showToast('⚡ Massimo Bianco 100% (Lumen Pieni)');
      } else if (shade === 'cold') {
        this.updateColorValues(220, 240, 255, true);
        if (typeof this.encoder.whiteCold === 'function') {
          setTimeout(() => {
            this.ble.sendPacket(this.encoder.whiteCold(), true).catch(() => {});
          }, 60);
        }
        this.showToast('❄️ Bianco Freddo 6500K');
      } else if (shade === 'pure') {
        this.updateColorValues(255, 255, 255, true);
        this.showToast('☀️ Bianco Puro 100% RGB');
      } else if (shade === 'warm') {
        this.updateColorValues(255, 215, 150, true);
        if (typeof this.encoder.whiteWarm === 'function') {
          setTimeout(() => {
            this.ble.sendPacket(this.encoder.whiteWarm(), true).catch(() => {});
          }, 60);
        }
        this.showToast('🕯️ Bianco Caldo 3200K');
      }
    } catch (e) {
      if (!this.ble.isConnected) {
        this.showToast('Connetti prima il Bluetooth!', 3000);
      }
    }
  }

  // ===================================================================
  // MODALITÀ DINAMICHE: Polizia Blu & Rosso (Doppio Burst Pulito)
  // ===================================================================
  startDynamicEffect(effectName) {
    this.vibrate(25);
    this.stopDynamicEffect(false);

    this.activeEffect = effectName;
    this.activeEffectIndicator.textContent = 'ATTIVO';
    this.activeEffectIndicator.style.background = 'rgba(0, 240, 255, 0.25)';
    this.activeEffectIndicator.style.color = 'var(--neon-cyan)';
    this.effectControlBar.style.display = 'flex';

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
        // 🚨 POLIZIA: ROSSO E BLU PURO AD ALTA CADENZA (Doppio Burst Stroboscopico)
        this.effectActiveNameText.textContent = '🚨 Polizia: Rosso & Blu Strobo';
        this.showToast('Modalità Polizia Attivata (Rosso & Blu Puro)');

        // Sequenza a 8 fasi: 2 flash Rosso -> Pausa -> 2 flash Blu -> Pausa
        let burstStep = 0;
        const policeCadence = () => {
          if (this.activeEffect !== 'police') return;

          const phase = burstStep % 8;
          let delay = Math.max(70, Math.round(getInterval() * 0.45));

          if (phase === 0 || phase === 2) {
            // Flash ROSSO PURO (Zero verde, zero residui)
            this.sendColorCommand(255, 0, 0);
            this.ambientTop.style.background = 'radial-gradient(circle, rgba(255, 59, 48, 0.45) 0%, rgba(0, 0, 0, 0) 70%)';
          } else if (phase === 1 || phase === 3) {
            // Pausa buio tra i flash rossi
            this.sendColorCommand(0, 0, 0);
            this.ambientTop.style.background = 'none';
          } else if (phase === 4 || phase === 6) {
            // Flash BLU PURO (Zero verde, zero rosso)
            this.sendColorCommand(0, 0, 255);
            this.ambientTop.style.background = 'radial-gradient(circle, rgba(10, 132, 255, 0.45) 0%, rgba(0, 0, 0, 0) 70%)';
          } else if (phase === 5 || phase === 7) {
            // Pausa buio tra i flash blu
            this.sendColorCommand(0, 0, 0);
            this.ambientTop.style.background = 'none';
            if (phase === 7) {
              delay = Math.round(delay * 1.8); // Pausa più lunga prima di ripetere il ciclo
            }
          }

          burstStep++;
          this.effectTimer = setTimeout(policeCadence, delay);
        };

        policeCadence();
        break;
      }

      case 'white_strobe': {
        this.effectActiveNameText.textContent = '⚡ Strobo Notte Bianco';
        this.showToast('Strobo Notturno Attivato');
        let on = false;
        const strobeLoop = () => {
          if (this.activeEffect !== 'white_strobe') return;
          on = !on;
          if (on) {
            this.sendColorCommand(255, 255, 255);
            this.ambientTop.style.background = 'radial-gradient(circle, rgba(255, 255, 255, 0.45) 0%, rgba(0, 0, 0, 0) 70%)';
          } else {
            this.sendColorCommand(0, 0, 0);
            this.ambientTop.style.background = 'none';
          }
          this.effectTimer = setTimeout(strobeLoop, Math.max(80, Math.round(getInterval() * 0.75)));
        };
        strobeLoop();
        break;
      }

      case 'rainbow': {
        this.effectActiveNameText.textContent = '🌈 Flusso Arcobaleno Dinamico';
        this.showToast('Arcobaleno Dinamico');
        let hue = 0;
        const rainbowLoop = () => {
          if (this.activeEffect !== 'rainbow') return;
          hue = (hue + 18) % 360;
          const [r, g, b] = this._hslToRgb(hue / 360, 1, 0.5);
          this.sendColorCommand(r, g, b);
          this.ambientTop.style.background = `radial-gradient(circle, rgba(${r}, ${g}, ${b}, 0.3) 0%, rgba(0, 0, 0, 0) 70%)`;
          this.effectTimer = setTimeout(rainbowLoop, Math.max(80, Math.round(getInterval() * 0.9)));
        };
        rainbowLoop();
        break;
      }

      case 'cyber_breath': {
        this.effectActiveNameText.textContent = '💜 Respiro Cyberpunk (Ciano / Viola)';
        this.showToast('Respiro Cyberpunk');
        let t = 0;
        const cyberLoop = () => {
          if (this.activeEffect !== 'cyber_breath') return;
          t += 0.2;
          const blend = (Math.sin(t) + 1) / 2;
          const r = Math.round(0 * (1 - blend) + 191 * blend);
          const g = Math.round(240 * (1 - blend) + 90 * blend);
          const b = Math.round(255 * (1 - blend) + 242 * blend);
          this.sendColorCommand(r, g, b);
          this.ambientTop.style.background = `radial-gradient(circle, rgba(${r}, ${g}, ${b}, 0.3) 0%, rgba(0, 0, 0, 0) 70%)`;
          this.effectTimer = setTimeout(cyberLoop, Math.max(90, Math.round(getInterval() * 1.1)));
        };
        cyberLoop();
        break;
      }

      case 'amber_hazard': {
        this.effectActiveNameText.textContent = '⚠️ Hazard Fendinebbia';
        this.showToast('Hazard Fendinebbia Attivato');
        let amberOn = false;
        const hazardLoop = () => {
          if (this.activeEffect !== 'amber_hazard') return;
          amberOn = !amberOn;
          if (amberOn) {
            this.sendColorCommand(255, 149, 0);
            this.ambientTop.style.background = 'radial-gradient(circle, rgba(255, 149, 0, 0.35) 0%, rgba(0, 0, 0, 0) 70%)';
          } else {
            this.sendColorCommand(0, 0, 0);
            this.ambientTop.style.background = 'none';
          }
          this.effectTimer = setTimeout(hazardLoop, Math.max(160, getInterval() * 1.4));
        };
        hazardLoop();
        break;
      }

      case 'party_flash': {
        this.effectActiveNameText.textContent = '🎉 Party Strobe';
        this.showToast('Party Strobe Attivato');
        const colors = [
          [255, 0, 0], [0, 255, 0], [0, 0, 255],
          [255, 255, 0], [0, 255, 255], [255, 0, 255]
        ];
        let idx = 0;
        const partyLoop = () => {
          if (this.activeEffect !== 'party_flash') return;
          idx = (idx + 1) % colors.length;
          const [pr, pg, pb] = colors[idx];
          this.sendColorCommand(pr, pg, pb);
          this.ambientTop.style.background = `radial-gradient(circle, rgba(${pr}, ${pg}, ${pb}, 0.35) 0%, rgba(0, 0, 0, 0) 70%)`;
          this.effectTimer = setTimeout(partyLoop, Math.max(90, Math.round(getInterval() * 0.95)));
        };
        partyLoop();
        break;
      }
    }
  }

  stopDynamicEffect(updateUi = true) {
    if (this.effectTimer) {
      clearTimeout(this.effectTimer);
      this.effectTimer = null;
    }
    this.activeEffect = null;

    if (updateUi) {
      this.activeEffectIndicator.textContent = 'STATICO';
      this.activeEffectIndicator.style.background = 'rgba(255, 255, 255, 0.1)';
      this.activeEffectIndicator.style.color = 'var(--text-tertiary)';
      this.effectControlBar.style.display = 'none';
      this.effectCards.forEach(c => c.classList.remove('active-running'));
    }
  }

  applyPreset(presetKey) {
    this.vibrate(20);
    this.stopDynamicEffect();

    switch (presetKey) {
      case 'white':
        this.state.brightness = 100;
        this.updateColorValues(255, 255, 255, true);
        this.showToast('Preset: Strada (Bianco)');
        break;
      case 'red':
        this.state.brightness = 100;
        this.updateColorValues(255, 0, 0, true);
        this.showToast('Preset: Stop (Rosso)');
        break;
      case 'cyan':
        this.state.brightness = 90;
        this.updateColorValues(0, 240, 255, true);
        this.showToast('Preset: Cyber Ciano');
        break;
      case 'purple':
        this.state.brightness = 90;
        this.updateColorValues(191, 90, 242, true);
        this.showToast('Preset: Neon Viola');
        break;
      case 'amber':
        this.state.brightness = 100;
        this.updateColorValues(255, 149, 0, true);
        this.showToast('Preset: Ambra Fendinebbia');
        break;
      case 'green':
        this.state.brightness = 85;
        this.updateColorValues(0, 255, 0, true);
        this.showToast('Preset: Eco Verde');
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

    this.ambientTop.style.background = `radial-gradient(circle, ${hex}28 0%, rgba(0, 0, 0, 0) 70%)`;

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
  // PRESET PERSONALIZZATI
  // ===================================================================
  _loadCustomPresets() {
    try {
      const saved = localStorage.getItem('need4led_custom_presets');
      if (saved) return JSON.parse(saved);
    } catch (_) {}

    return [
      { id: 'p_neon', name: 'Sottoscocca Cyber', r: 0, g: 240, b: 255, brightness: 100 },
      { id: 'p_sunset', name: 'Tramonto Notturno', r: 255, g: 60, b: 120, brightness: 90 },
      { id: 'p_stealth', name: 'Luce Morbida', r: 255, g: 200, b: 130, brightness: 35 }
    ];
  }

  saveCurrentAsCustomPreset(name) {
    const newPreset = {
      id: 'p_' + Date.now(),
      name,
      r: this.state.r,
      g: this.state.g,
      b: this.state.b,
      brightness: this.state.brightness
    };
    this.customPresets.unshift(newPreset);
    this._persistCustomPresets();
    this._renderCustomPresets();
    this.showToast(`Preset "${name}" salvato!`);
  }

  deleteCustomPreset(id) {
    this.customPresets = this.customPresets.filter(p => p.id !== id);
    this._persistCustomPresets();
    this._renderCustomPresets();
    this.showToast('Preset rimosso');
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
          <em>Nessun preset salvato. Seleziona un colore e premi "+ Salva Corrente".</em>
        </div>
      `;
      return;
    }

    this.customPresetsContainer.innerHTML = '';
    this.customPresets.forEach(preset => {
      const hex = '#' + [preset.r, preset.g, preset.b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
      
      const card = document.createElement('div');
      card.className = 'custom-preset-card';

      card.innerHTML = `
        <div class="custom-preset-left">
          <div class="custom-preset-swatch" style="background-color: ${hex}; box-shadow: 0 0 10px ${hex}88;"></div>
          <div style="overflow: hidden;">
            <div class="custom-preset-name">${preset.name}</div>
            <div class="custom-preset-lum">${preset.brightness}% Lum | ${hex}</div>
          </div>
        </div>
        <button class="btn-delete-preset" title="Elimina Preset" aria-label="Elimina">✕</button>
      `;

      card.querySelector('.custom-preset-left').addEventListener('click', () => {
        this.vibrate(20);
        this.stopDynamicEffect();
        this.state.brightness = preset.brightness;
        this.brightnessSlider.value = preset.brightness;
        this.brightnessValBadge.textContent = `${preset.brightness}%`;
        this.sendBrightnessCommand(preset.brightness);
        this.updateColorValues(preset.r, preset.g, preset.b, true);
        this.showToast(`Attivato: ${preset.name}`);
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
      this.showToast(`Inviati ${bytes.length} bytes`);
      this.vibrate(15);
    } catch (err) {
      this.showToast(`Errore hex: ${err.message}`, 3000);
      this.ble.log('ERROR', rawStr, err.message);
    }
  }

  onDevicePaired(device) {
    this._loadDeviceProfile(device);
  }

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
      this.stopDynamicEffect();
    }
  }

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
