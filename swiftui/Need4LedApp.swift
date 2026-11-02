//
//  Need4LedApp.swift
//  Need4Led — Implementazione Nativa iOS (SwiftUI + CoreBluetooth)
//  Aderente alle linee guida Apple Liquid Glass (iOS 26/27) e safe areas.
//

import SwiftUI
import CoreBluetooth

// MARK: - CoreBluetooth Manager
@Observable
final class LEDBluetoothManager: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    var isConnected = false
    var statusMessage = "Disconnesso"
    var discoveredPeripherals: [CBPeripheral] = []
    var activePeripheral: CBPeripheral?
    var writeCharacteristic: CBCharacteristic?
    
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
            statusMessage = "Attiva il Bluetooth nelle impostazioni"
            return
        }
        statusMessage = "Scansione dispositivi..."
        discoveredPeripherals.removeAll()
        centralManager.scanForPeripherals(withServices: [targetServiceUUID], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
    }
    
    func connect(to peripheral: CBPeripheral) {
        centralManager.stopScan()
        statusMessage = "Connessione a \(peripheral.name ?? "LED")..."
        activePeripheral = peripheral
        peripheral.delegate = self
        centralManager.connect(peripheral, options: nil)
    }
    
    func disconnect() {
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
    
    // MARK: - Comandi LotusLantern
    func setPower(_ on: Bool) {
        let bytes: [UInt8] = on
            ? [0x7E, 0x00, 0x04, 0xF0, 0x00, 0x01, 0xFF, 0x00, 0xEF]
            : [0x7E, 0x00, 0x04, 0x00, 0x00, 0x00, 0xFF, 0x00, 0xEF]
        sendCommand(bytes)
    }
    
    func setColor(r: UInt8, g: UInt8, b: UInt8) {
        let bytes: [UInt8] = [0x7E, 0x00, 0x05, 0x03, r, g, b, 0x00, 0xEF]
        sendCommand(bytes)
    }
    
    func setBrightness(_ percent: Int) {
        let level = UInt8(clamping: percent)
        let bytes: [UInt8] = [0x7E, 0x00, 0x01, level, 0x00, 0x00, 0x00, 0x00, 0xEF]
        sendCommand(bytes)
    }
    
    // MARK: - CBCentralManagerDelegate
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            statusMessage = "Bluetooth pronto"
        case .poweredOff:
            statusMessage = "Bluetooth disattivato"
        case .unauthorized:
            statusMessage = "Permessi Bluetooth non concessi"
        default:
            statusMessage = "Bluetooth non disponibile"
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
        statusMessage = "Connesso a \(peripheral.name ?? "LED")"
        peripheral.discoverServices([targetServiceUUID])
    }
    
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        isConnected = false
        activePeripheral = nil
        writeCharacteristic = nil
        statusMessage = "Disconnesso"
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
            statusMessage = "Pronto al controllo"
        }
    }
}

// MARK: - SwiftUI View
struct ScooterLedMainView: View {
    @State private var ble = LEDBluetoothManager()
    @State private var brightness: Double = 100
    @State private var selectedColor: Color = .cyan
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            VStack(spacing: 20) {
                // Header Bar
                HStack {
                    Text("Need4Led")
                        .font(.title2.bold())
                        .foregroundStyle(.white)
                    Spacer()
                    Circle()
                        .fill(ble.isConnected ? Color.green : Color.red)
                        .frame(width: 10, height: 10)
                    Text(ble.statusMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding()
                
                // Connessione
                Button {
                    if ble.isConnected {
                        ble.disconnect()
                    } else {
                        ble.startScan()
                    }
                } label: {
                    Label(ble.isConnected ? "Disconnetti" : "Cerca & Connetti", systemImage: "antenna.radiowaves.left.and.right")
                        .frame(maxWidth: .infinity, minHeight: 48)
                }
                .buttonStyle(.borderedProminent)
                .tint(ble.isConnected ? .red.opacity(0.8) : .cyan)
                .padding(.horizontal)
                
                // Power Grid
                HStack(spacing: 16) {
                    Button("ACCENDI") {
                        ble.setPower(true)
                    }
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .background(Color.green.opacity(0.25))
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.green.opacity(0.4), lineWidth: 1))
                    
                    Button("SPEGNI") {
                        ble.setPower(false)
                    }
                    .frame(maxWidth: .infinity, minHeight: 56)
                    .background(Color.red.opacity(0.25))
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.red.opacity(0.4), lineWidth: 1))
                }
                .padding(.horizontal)
                
                // Presets
                VStack(alignment: .leading, spacing: 10) {
                    Text("PRESET RAPIDI")
                        .font(.caption.bold())
                        .foregroundStyle(.secondary)
                    
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        PresetButton(title: "Strada", color: .white) {
                            ble.setColor(r: 255, g: 255, b: 255)
                        }
                        PresetButton(title: "Stop", color: .red) {
                            ble.setColor(r: 255, g: 0, b: 0)
                        }
                        PresetButton(title: "Cyber Ciano", color: .cyan) {
                            ble.setColor(r: 0, g: 240, b: 255)
                        }
                        PresetButton(title: "Neon Viola", color: .purple) {
                            ble.setColor(r: 157, g: 0, b: 255)
                        }
                    }
                }
                .padding(.horizontal)
                
                // Luminosità
                VStack(alignment: .leading) {
                    HStack {
                        Text("LUMINOSITÀ")
                            .font(.caption.bold())
                            .foregroundStyle(.secondary)
                        Spacer()
                        Text("\(Int(brightness))%")
                            .font(.subheadline.bold())
                            .foregroundStyle(.cyan)
                    }
                    Slider(value: $brightness, in: 0...100, step: 1) { _ in
                        ble.setBrightness(Int(brightness))
                    }
                    .tint(.cyan)
                }
                .padding(.horizontal)
                
                Spacer()
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
                Circle().fill(color).frame(width: 18, height: 18)
                Text(title)
                    .font(.subheadline.bold())
                    .foregroundStyle(.white)
                Spacer()
            }
            .padding()
            .frame(minHeight: 48)
            .background(Color.white.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color.white.opacity(0.12), lineWidth: 1))
        }
    }
}
