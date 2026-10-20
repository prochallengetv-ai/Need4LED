/**
 * Need4Led — App Entry Point
 * Inizializzazione moduli e setup globale
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

  // Verifica supporto Web Bluetooth all'avvio
  if (!bleManager.isSupported()) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isIOS) {
      uiControllerInstance.onBleStatusChange({
        state: 'error',
        message: 'Apri questa pagina con l\'app Bluefy su iPhone'
      });
      uiControllerInstance.showToast('Per usare il Bluetooth su iPhone usa l\'app Bluefy (da App Store)', 6000);
    } else {
      uiControllerInstance.onBleStatusChange({
        state: 'error',
        message: 'Browser senza Web Bluetooth. Usa Chrome o Edge.'
      });
    }
  } else {
    uiControllerInstance.onBleStatusChange({
      state: 'disconnected',
      message: 'Pronto per la ricerca BLE'
    });
  }

  // Registrazione Service Worker per Progressive Web App (se supportato)
  if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // SW non critico per il funzionamento
    });
  }
});
