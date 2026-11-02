/**
 * Need4Led — App Entry Point (v2.2 Clean UI)
 * Inizializzazione moduli, Web Bluetooth check e service worker setup
 */

import { BLEManager } from './ble-manager.js';
import { UIController } from './ui-controller.js';

document.addEventListener('DOMContentLoaded', () => {
  let uiControllerInstance = null;

  // Inizializza il Gestore BLE con callback verso l'interfaccia
  const bleManager = new BLEManager({
    onStatusChange: (status) => {
      if (uiControllerInstance) {
        uiControllerInstance.onBleStatusChange(status);
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
  uiControllerInstance = new UIController(bleManager);

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
    navigator.serviceWorker.register('sw.js?v=2.2.2').then((reg) => {
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
