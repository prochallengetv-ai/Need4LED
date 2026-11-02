/**
 * Need4Led — App Entry Point (v2.3 Ultimate)
 * Inizializzazione moduli, Screen Wake Lock API, Web Bluetooth check e service worker setup
 */

import { BLEManager } from './ble-manager.js';
import { UIController } from './ui-controller.js';

/**
 * Gestore Screen Wake Lock API
 * Mantiene il display attivo su iOS Bluefy e browser moderni durante la connessione BLE
 * o durante l'esecuzione di modalità dinamiche/strobo per evitare freeze dei timer JS.
 */
export class WakeLockManager {
  constructor(onStatusChange = () => {}) {
    this.wakeLock = null;
    this.isEnabled = true;
    this.onStatusChange = onStatusChange;
    this.shouldBeActive = false;
    this._initVisibilityListener();
  }

  isSupported() {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  }

  async acquire() {
    if (!this.isSupported() || !this.isEnabled) {
      this.onStatusChange(false, 'NON SUPPORTATO');
      return false;
    }
    try {
      if (!this.wakeLock || this.wakeLock.released) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => {
          this.wakeLock = null;
          this.onStatusChange(false, 'OFF');
        });
        this.onStatusChange(true, 'SCHERMO SEMPRE ATTIVO: ON');
        return true;
      }
      this.onStatusChange(true, 'SCHERMO SEMPRE ATTIVO: ON');
      return true;
    } catch (_) {
      this.onStatusChange(false, 'OFF');
      return false;
    }
  }

  async release() {
    if (this.wakeLock) {
      try {
        await this.wakeLock.release();
      } catch (_) {}
      this.wakeLock = null;
    }
    this.onStatusChange(false, 'OFF');
  }

  async updateState({ isConnected = false, isEffectRunning = false }) {
    this.shouldBeActive = Boolean(isConnected || isEffectRunning);
    if (this.shouldBeActive) {
      await this.acquire();
    } else {
      await this.release();
    }
  }

  _initVisibilityListener() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && this.shouldBeActive) {
          await this.acquire();
        }
      });
    }
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
  let uiControllerInstance = null;

  // Inizializza Gestore Screen Wake Lock
  const wakeLockManager = new WakeLockManager((isActive, label) => {
    if (uiControllerInstance) {
      uiControllerInstance.updateWakeLockUI(isActive, label);
    }
  });

  // Inizializza il Gestore BLE con callback verso l'interfaccia
  const bleManager = new BLEManager({
    onStatusChange: (status) => {
      if (uiControllerInstance) {
        uiControllerInstance.onBleStatusChange(status);
        wakeLockManager.updateState({
          isConnected: bleManager.isConnected,
          isEffectRunning: Boolean(uiControllerInstance.activeEffect)
        });
      }
    },
    onLog: (logEntry) => {
      if (uiControllerInstance) {
        uiControllerInstance.onBleLog(logEntry);
      }
    },
    onGattDiscovered: (gattTree) => {
      if (uiControllerInstance) {
        uiControllerInstance.onGattDiscovered(gattTree);
      }
    }
  });

  // Inizializza l'Interfaccia Utente
  uiControllerInstance = new UIController(bleManager, wakeLockManager);

  // Header shortcut per Impostazioni
  const btnHeaderSettings = document.getElementById('btnHeaderSettings');
  if (btnHeaderSettings) {
    btnHeaderSettings.addEventListener('click', () => {
      uiControllerInstance.switchTab('tab-settings');
    });
  }

  // Verifica supporto Web Bluetooth all'avvio
  if (!bleManager.isSupported()) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {
      uiControllerInstance.onBleStatusChange({
        state: 'error',
        message: 'APRI TRAMITE L\'APP BLUEFY SU IPHONE'
      });
      uiControllerInstance.showToast('SU IPHONE UTILIZZA L\'APP BLUEFY (DA APP STORE) PER IL BLUETOOTH', 6000);
    } else {
      uiControllerInstance.onBleStatusChange({
        state: 'error',
        message: 'BROWSER SENZA WEB BLUETOOTH. USA CHROME O EDGE.'
      });
    }
  } else {
    uiControllerInstance.onBleStatusChange({
      state: 'disconnected',
      message: 'PRONTO PER LA CONNESSIONE BLE'
    });
  }

  // Registrazione Service Worker per Progressive Web App (con forzatura aggiornamento cache)
  if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js?v=2.3.0').then((reg) => {
      reg.update();
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated' && navigator.serviceWorker.controller) {
              window.location.reload();
            }
          });
        }
      });
    }).catch(() => {});
  }
});
}
