//
//  Need4LedApp.swift
//  Need4Led — Implementazione Nativa iOS (SwiftUI + CoreBluetooth)
//  Aderente alle linee guida Apple Liquid Glass (iOS 26/27), safe areas e zero emoji.
//

import SwiftUI
import CoreBluetooth

// MARK: - CoreBluetooth Manager
@Observable
final class LEDBluetoothManager: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    var isConnected = false
    var statusMessage = "DISCONNESSO"
    var discoveredPeripherals: [CBPeripheral] = []
    var activePeripheral: CBPeripheral?
    var writeCharacteristic: CBCharacteristic?
    
    // Ordine canali hardware (default BRG per controller ELK)
    var channelOrder = "BRG"
    
    // Timer per animazioni dinamiche
    private var animationTimer: Timer?
    
    // UUID tipici LotusLantern / ELK-BLEDOM
    private let targetServiceUUID = CBUUID(string: "FFF0")
    private let targetCharUUID = CBUUID(string: "FFF3")
    
    private var centralManager: CBCentralManager!
    
    override init() {
        super.init()
        centralManager = CBCentralManager(delegate: self, queue: .main)
    }
    
    func startScan() {
        guard centralManager.state == .poweredOn else {
            statusMessage = "ATTIVA BLUETOOTH NELLE IMPOSTAZIONI"
            return
        }
        statusMessage = "SCANSIONE DISPOSITIVI..."
        discoveredPeripherals.removeAll()
        centralManager.scanForPeripherals(withServices: [targetServiceUUID], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
    }
    
    func connect(to peripheral: CBPeripheral) {
        centralManager.stopScan()
        statusMessage = "CONNESSIONE A \(peripheral.name?.uppercased() ?? "LED")..."
        activePeripheral = peripheral
        peripheral.delegate = self
        centralManager.connect(peripheral, options: nil)
    }
    
    func disconnect() {
        stopAnimation()
        if let p = activePeripheral {
            centralManager.cancelPeripheralConnection(p)
        }
    }
    
    func sendCommand(_ bytes: [UInt8]) {
        guard let p = activePeripheral, let c = writeCharacteristic else { return }
        let data = Data(bytes)
        let writeType: CBCharacteristicWriteType = c.properties.contains(.writeWithoutResponse) ? .withoutResponse : .withResponse
        p.writeValue(data, for: c, type: writeType)
    }
    
    func remapChannels(r: UInt8, g: UInt8, b: UInt8) -> (UInt8, UInt8, UInt8) {
        switch channelOrder {
        case "BRG":
            return (b, r, g)
        case "GRB":
            return (g, r, b)
        case "BGR":
            return (b, g, r)
        default:
            return (r, g, b)
        }
    }
    
    // MARK: - Comandi LotusLantern / ELK-BLEDOM
    func setPower(_ on: Bool) {
        stopAnimation()
        let bytes: [UInt8] = on
            ? [0x7E, 0x00, 0x04, 0xF0, 0x00, 0x01, 0xFF, 0x00, 0xEF]
            : [0x7E, 0x00, 0x04, 0x00, 0x00, 0x00, 0xFF, 0x00, 0xEF]
        sendCommand(bytes)
    }
    
    func setColor(r: UInt8, g: UInt8, b: UInt8) {
        let (c1, c2, c3) = remapChannels(r: r, g: g, b: b)
        let bytes: [UInt8] = [0x7E, 0x00, 0x05, 0x03, c1, c2, c3, 0x00, 0xEF]
        sendCommand(bytes)
    }
    
    func setBrightness(_ percent: Int) {
        let level = UInt8(clamping: percent)
        let bytes: [UInt8] = [0x7E, 0x00, 0x01, level, 0x00, 0x00, 0x00, 0x00, 0xEF]
        sendCommand(bytes)
    }
    
    func setMaxWhite() {
        stopAnimation()
        setBrightness(100)
        // Invio comando modalità bianco puro ELK
        let bytes: [UInt8] = [0x7E, 0x00, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0xEF]
        sendCommand(bytes)
    }
    
    // MARK: - Polizia 4-Fasi Simmetrica (Rosso -> Nero -> Blu -> Nero)
    func startPoliceStrobe() {
        stopAnimation()
        var step = 0
        animationTimer = Timer.scheduledTimer(withTimeInterval: 0.160, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            let phase = step % 4
            if phase == 0 {
                self.setColor(r: 255, g: 0, b: 0) // Rosso puro
            } else if phase == 1 || phase == 3 {
                self.setColor(r: 0, g: 0, b: 0)   // Nero / spento
            } else {
                self.setColor(r: 0, g: 0, b: 255) // Blu puro
            }
            step += 1
        }
    }
    
    func stopAnimation() {
        animationTimer?.invalidate()
        animationTimer = nil
    }
    
    // MARK: - CBCentralManagerDelegate
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            statusMessage = "BLUETOOTH ATTIVO"
        case .poweredOff:
            statusMessage = "BLUETOOTH DISATTIVATO"
        case .unauthorized:
            statusMessage = "PERMESSI NON CONCESSI"
        default:
            statusMessage = "BLUETOOTH NON DISPONIBILE"
        }
    }
    
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        if !discoveredPeripherals.contains(where: { $0.identifier == peripheral.identifier }) {
            discoveredPeripherals.append(peripheral)
            if activePeripheral == nil {
                connect(to: peripheral)
            }
        }
    }
    
    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        isConnected = true
        statusMessage = "CONNESSO: \(peripheral.name?.uppercased() ?? "LED")"
        peripheral.discoverServices([targetServiceUUID])
    }
    
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        isConnected = false
        activePeripheral = nil
        writeCharacteristic = nil
        statusMessage = "DISCONNESSO"
        stopAnimation()
    }
    
    // MARK: - CBPeripheralDelegate
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let services = peripheral.services else { return }
        for service in services where service.uuid == targetServiceUUID {
            peripheral.discoverCharacteristics([targetCharUUID], for: service)
        }
    }
    
    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard let chars = service.characteristics else { return }
        for char in chars where char.uuid == targetCharUUID {
            writeCharacteristic = char
            statusMessage = "PRONTO AL CONTROLLO"
        }
    }
}

// MARK: - SwiftUI Main View (Liquid Glass iOS 26/27)
struct ScooterLedMainView: View {
    @State private var ble = LEDBluetoothManager()
    @State private var brightness: Double = 100
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            ScrollView {
                VStack(spacing: 16) {
                    // Header Bar
                    HStack {
                        Circle()
                            .fill(Color.cyan)
                            .frame(width: 8, height: 8)
                            .shadow(color: .cyan, radius: 4)
                        Text("NEED4LED")
                            .font(.system(size: 18, weight: .black))
                            .tracking(1.2)
                            .foregroundStyle(.white)
                        Text("V2.2")
                            .font(.system(size: 10, weight: .bold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.white.opacity(0.12))
                            .clipShape(Capsule())
                        Spacer()
                        Circle()
                            .fill(ble.isConnected ? Color.green : Color.red)
                            .frame(width: 8, height: 8)
                        Text(ble.statusMessage)
                            .font(.system(size: 10, weight: .bold))
                            .tracking(0.6)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal)
                    .padding(.top, 8)
                    
                    // Connessione Bluetooth
                    Button {
                        if ble.isConnected {
                            ble.disconnect()
                        } else {
                            ble.startScan()
                        }
                    } label: {
                        Text(ble.isConnected ? "DISCONNETTI" : "CONNETTI STRISCE LED")
                            .font(.system(size: 12, weight: .bold))
                            .tracking(1)
                            .frame(maxWidth: .infinity, minHeight: 48)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(ble.isConnected ? Color.red.opacity(0.3) : Color.cyan.opacity(0.3))
                    .overlay(RoundedRectangle(cornerRadius: 12).stroke(ble.isConnected ? Color.red.opacity(0.5) : Color.cyan.opacity(0.5), lineWidth: 1))
                    .padding(.horizontal)
                    
                    // Master Power
                    HStack(spacing: 12) {
                        Button("ACCENDI") {
                            ble.setPower(true)
                        }
                        .font(.system(size: 13, weight: .black))
                        .tracking(1)
                        .frame(maxWidth: .infinity, minHeight: 56)
                        .background(Color.green.opacity(0.2))
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.green.opacity(0.4), lineWidth: 1))
                        
                        Button("SPEGNI") {
                            ble.setPower(false)
                        }
                        .font(.system(size: 13, weight: .black))
                        .tracking(1)
                        .frame(maxWidth: .infinity, minHeight: 56)
                        .background(Color.red.opacity(0.2))
                        .foregroundStyle(.white)
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.red.opacity(0.4), lineWidth: 1))
                    }
                    .padding(.horizontal)
                    
                    // Polizia & Effetti Dinamici
                    VStack(alignment: .leading, spacing: 8) {
                        Text("DINAMICI")
                            .font(.system(size: 11, weight: .bold))
                            .tracking(0.8)
                            .foregroundStyle(.secondary)
                        
                        Button {
                            ble.startPoliceStrobe()
                        } label: {
                            HStack {
                                HStack(spacing: 4) {
                                    Circle().fill(Color.red).frame(width: 8, height: 8)
                                    Circle().fill(Color.blue).frame(width: 8, height: 8)
                                }
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("POLIZIA (ROSSO -> NERO -> BLU)")
                                        .font(.system(size: 12, weight: .bold))
                                        .foregroundStyle(.white)
                                    Text("Ciclo continuo 3-fasi calibrato")
                                        .font(.system(size: 10))
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                            }
                            .padding()
                            .frame(minHeight: 52)
                            .background(Color.white.opacity(0.06))
                            .clipShape(RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.12), lineWidth: 1))
                        }
                    }
                    .padding(.horizontal)
                    
                    // Preset Rapidi
                    VStack(alignment: .leading, spacing: 10) {
                        Text("PRESET RAPIDI")
                            .font(.system(size: 11, weight: .bold))
                            .tracking(0.8)
                            .foregroundStyle(.secondary)
                        
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                            PresetButton(title: "STRADA", color: .white) {
                                ble.setColor(r: 255, g: 255, b: 255)
                            }
                            PresetButton(title: "STOP", color: .red) {
                                ble.setColor(r: 255, g: 0, b: 0)
                            }
                            PresetButton(title: "CYBER CIANO", color: .cyan) {
                                ble.setColor(r: 0, g: 240, b: 255)
                            }
                            PresetButton(title: "NEON VIOLA", color: .purple) {
                                ble.setColor(r: 191, g: 90, b: 242)
                            }
                        }
                    }
                    .padding(.horizontal)
                    
                    // Luminosità
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text("LUMINOSITÀ")
                                .font(.system(size: 11, weight: .bold))
                                .tracking(0.8)
                                .foregroundStyle(.secondary)
                            Spacer()
                            Text("\(Int(brightness))%")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(.cyan)
                        }
                        Slider(value: $brightness, in: 0...100, step: 1) { _ in
                            ble.setBrightness(Int(brightness))
                        }
                        .tint(.cyan)
                    }
                    .padding(.horizontal)
                    .padding(.bottom, 20)
                }
            }
        }
    }
}

struct PresetButton: View {
    let title: String
    let color: Color
    let action: () -> Void
    
    var body: some View {
        Button(action: action) {
            HStack {
                Circle().fill(color).frame(width: 14, height: 14)
                Text(title)
                    .font(.system(size: 11, weight: .bold))
                    .tracking(0.6)
                    .foregroundStyle(.white)
                Spacer()
            }
            .padding(12)
            .frame(minHeight: 48)
            .background(Color.white.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: 12))
            .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.white.opacity(0.12), lineWidth: 1))
        }
    }
}
