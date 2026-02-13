/**
 * @file BatteryModule.swift
 * @brief CoreBluetooth を使用した BLE バッテリーモジュールの iOS ネイティブ実装。
 *
 * このモジュールは Expo Modules API を使用して JavaScript に以下の機能を公開する:
 * - BLE デバイスのスキャン（startScan / stopScan）
 * - BLE デバイスへの接続・切断（connectToDevice / disconnectDevice）
 * - Battery Service (0x180F) からのバッテリーレベル読み取り（readBatteryLevel）
 *
 * BLE 操作の結果はイベントとして JavaScript 側に通知される:
 * - onDeviceFound: デバイス発見時
 * - onConnectionStateChanged: 接続状態変更時
 * - onBatteryLevelReceived: バッテリーレベル取得時（エラー時は level = -1）
 */

import CoreBluetooth
import ExpoModulesCore

// MARK: - BatteryModule 本体

/// BLE バッテリー読み取りモジュール。
/// Expo Modules API の `Module` を継承し、JavaScript から呼び出し可能な関数とイベントを定義する。
public class BatteryModule: Module {
  /// CoreBluetooth のセントラルマネージャー（BLE スキャン・接続を管理）
  private var centralManager: CBCentralManager?
  /// CBCentralManagerDelegate の実装（スキャン結果・接続結果のハンドリング）
  private var centralDelegate: CentralManagerDelegate?
  /// CBPeripheralDelegate の実装（サービス・キャラクタリスティック探索のハンドリング）
  private var peripheralDelegate: PeripheralDelegate?
  /// 現在接続中のペリフェラル
  private var connectedPeripheral: CBPeripheral?
  /// スキャンで発見されたペリフェラルのキャッシュ（UUID → CBPeripheral）
  private var discoveredPeripherals: [UUID: CBPeripheral] = [:]

  /// BLE Battery Service の UUID（標準規格）
  private let batteryServiceUUID = CBUUID(string: "180F")
  /// BLE Battery Level Characteristic の UUID（標準規格）
  private let batteryLevelCharUUID = CBUUID(string: "2A19")

  /// Expo モジュール定義。JavaScript から呼び出し可能な関数とイベントを登録する。
  public func definition() -> ModuleDefinition {
    Name("BatteryModule")

    // JavaScript 側で購読可能なイベント名を登録
    Events(
      "onDeviceFound",
      "onConnectionStateChanged",
      "onBatteryLevelReceived"
    )

    // モジュール生成時に CBCentralManager を初期化
    OnCreate {
      self.centralDelegate = CentralManagerDelegate(module: self)
      self.centralManager = CBCentralManager(
        delegate: self.centralDelegate,
        queue: nil
      )
    }

    // モジュール破棄時にスキャン停止・接続切断・リソース解放
    OnDestroy {
      self.centralManager?.stopScan()
      if let peripheral = self.connectedPeripheral {
        self.centralManager?.cancelPeripheralConnection(peripheral)
      }
      self.centralManager = nil
      self.centralDelegate = nil
      self.peripheralDelegate = nil
    }

    /// BLE デバイスのスキャンを開始する。
    /// Bluetooth が OFF の場合はエラーをスローする。
    /// 重複デバイスのフィルタリングは CoreBluetooth に任せる。
    AsyncFunction("startScan") {
      guard let cm = self.centralManager else {
        throw BLEError.notInitialized
      }
      guard cm.state == .poweredOn else {
        throw BLEError.bluetoothNotAvailable
      }
      self.discoveredPeripherals.removeAll()
      cm.scanForPeripherals(
        withServices: nil,
        options: [CBCentralManagerScanOptionAllowDuplicatesKey: false]
      )
    }

    /// BLE スキャンを停止する。
    AsyncFunction("stopScan") {
      self.centralManager?.stopScan()
    }

    /// 指定した UUID のデバイスに BLE 接続する。
    /// - Parameter deviceId: 接続先デバイスの UUID 文字列
    /// - Note: 接続結果は `onConnectionStateChanged` イベントで通知される
    AsyncFunction("connectToDevice") { (deviceId: String) in
      guard let uuid = UUID(uuidString: deviceId) else {
        throw BLEError.invalidDeviceId
      }
      guard let peripheral = self.discoveredPeripherals[uuid] else {
        throw BLEError.deviceNotFound
      }
      guard let cm = self.centralManager else {
        throw BLEError.notInitialized
      }
      self.peripheralDelegate = PeripheralDelegate(module: self)
      peripheral.delegate = self.peripheralDelegate
      cm.connect(peripheral, options: nil)
    }

    /// 現在接続中のデバイスを切断する。
    AsyncFunction("disconnectDevice") {
      if let peripheral = self.connectedPeripheral {
        self.centralManager?.cancelPeripheralConnection(peripheral)
      }
    }

    /// 接続中デバイスの Battery Service からバッテリーレベルを読み取る。
    /// 処理フロー: discoverServices → didDiscoverServices → discoverCharacteristics
    ///            → didDiscoverCharacteristics → readValue → didUpdateValue
    /// - Note: 結果は `onBatteryLevelReceived` イベントで通知される
    AsyncFunction("readBatteryLevel") {
      guard let peripheral = self.connectedPeripheral else {
        throw BLEError.notConnected
      }
      peripheral.discoverServices([self.batteryServiceUUID])
    }
  }

  // MARK: - Internal helpers

  /// スキャンで発見したペリフェラルをキャッシュに保存する。
  /// 接続時に UUID からペリフェラルを取得するために使用。
  func storePeripheral(_ peripheral: CBPeripheral) {
    discoveredPeripherals[peripheral.identifier] = peripheral
  }

  /// 接続中ペリフェラルの参照を設定/クリアする。
  func setConnectedPeripheral(_ peripheral: CBPeripheral?) {
    connectedPeripheral = peripheral
  }

  /// Battery Service UUID のアクセサ（delegate クラスから参照用）
  var batteryService: CBUUID { batteryServiceUUID }
  /// Battery Level Characteristic UUID のアクセサ（delegate クラスから参照用）
  var batteryLevelChar: CBUUID { batteryLevelCharUUID }

  // MARK: - Errors

  /// BLE 操作で発生するエラーの列挙型
  enum BLEError: Error, LocalizedError {
    case notInitialized
    case bluetoothNotAvailable
    case invalidDeviceId
    case deviceNotFound
    case notConnected

    var errorDescription: String? {
      switch self {
      case .notInitialized: return "BLE manager not initialized"
      case .bluetoothNotAvailable: return "Bluetooth is not powered on"
      case .invalidDeviceId: return "Invalid device ID format"
      case .deviceNotFound: return "Device not found in discovered list"
      case .notConnected: return "No device is connected"
      }
    }
  }
}

// MARK: - CBCentralManagerDelegate

/// CBCentralManager のデリゲート実装。
/// BLE スキャン結果・接続/切断イベントを処理し、JavaScript 側にイベントを送信する。
private class CentralManagerDelegate: NSObject, CBCentralManagerDelegate {
  weak var module: BatteryModule?

  init(module: BatteryModule) {
    self.module = module
  }

  /// Bluetooth の状態変更通知（必須デリゲートメソッド）。
  /// 実際の状態チェックは各操作実行前に行う。
  func centralManagerDidUpdateState(_ central: CBCentralManager) {
    // Required delegate method; state is checked before operations
  }

  /// BLE デバイス発見時のコールバック。
  /// 発見したデバイスをキャッシュに保存し、`onDeviceFound` イベントを送信する。
  func centralManager(
    _ central: CBCentralManager,
    didDiscover peripheral: CBPeripheral,
    advertisementData: [String: Any],
    rssi RSSI: NSNumber
  ) {
    module?.storePeripheral(peripheral)
    module?.sendEvent(
      "onDeviceFound",
      [
        "id": peripheral.identifier.uuidString,
        "name": peripheral.name ?? "Unknown",
        "rssi": RSSI.intValue,
      ])
  }

  /// デバイス接続成功時のコールバック。
  /// 接続中ペリフェラルを保存し、`onConnectionStateChanged` イベントを送信後、
  /// Battery Service の自動探索を開始する。
  func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
    module?.setConnectedPeripheral(peripheral)
    module?.sendEvent(
      "onConnectionStateChanged",
      [
        "deviceId": peripheral.identifier.uuidString,
        "state": "connected",
      ])
    // 接続完了後、バッテリーサービスの探索を自動開始
    if let batteryUUID = module?.batteryService {
      peripheral.discoverServices([batteryUUID])
    }
  }

  /// デバイス接続失敗時のコールバック。
  /// `onConnectionStateChanged` イベントで state: "failed" を送信する。
  func centralManager(
    _ central: CBCentralManager,
    didFailToConnect peripheral: CBPeripheral,
    error: Error?
  ) {
    module?.sendEvent(
      "onConnectionStateChanged",
      [
        "deviceId": peripheral.identifier.uuidString,
        "state": "failed",
        "error": error?.localizedDescription ?? "Connection failed",
      ])
  }

  /// デバイス切断時のコールバック。
  /// 接続中ペリフェラルの参照をクリアし、`onConnectionStateChanged` イベントを送信する。
  func centralManager(
    _ central: CBCentralManager,
    didDisconnectPeripheral peripheral: CBPeripheral,
    error: Error?
  ) {
    module?.setConnectedPeripheral(nil)
    module?.sendEvent(
      "onConnectionStateChanged",
      [
        "deviceId": peripheral.identifier.uuidString,
        "state": "disconnected",
      ])
  }
}

// MARK: - CBPeripheralDelegate

/// CBPeripheral のデリゲート実装。
/// BLE サービス・キャラクタリスティックの探索とバッテリーレベル値の読み取りを処理する。
///
/// 処理フロー:
/// 1. `didDiscoverServices` → Battery Service (0x180F) を検索
/// 2. `didDiscoverCharacteristics` → Battery Level Characteristic (0x2A19) を検索
/// 3. `didUpdateValue` → バッテリーレベル値（0-100）を JavaScript に送信
///
/// 各ステップでサービス/キャラクタリスティックが見つからない場合は
/// level: -1 のエラーイベントを送信して UI がローディング状態で停止するのを防ぐ。
private class PeripheralDelegate: NSObject, CBPeripheralDelegate {
  weak var module: BatteryModule?

  init(module: BatteryModule) {
    self.module = module
  }

  /// サービス探索完了時のコールバック。
  /// Battery Service (0x180F) が見つかった場合はキャラクタリスティック探索に進み、
  /// 見つからない場合はエラーイベント（level: -1）を送信する。
  func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
    if let error = error {
      module?.sendEvent(
        "onBatteryLevelReceived",
        [
          "deviceId": peripheral.identifier.uuidString,
          "level": -1,
          "error": error.localizedDescription,
        ])
      return
    }

    guard let services = peripheral.services else {
      module?.sendEvent(
        "onBatteryLevelReceived",
        [
          "deviceId": peripheral.identifier.uuidString,
          "level": -1,
          "error": "No services found on this device",
        ])
      return
    }

    // Battery Service (0x180F) を検索
    var foundBatteryService = false
    for service in services where service.uuid == module?.batteryService {
      foundBatteryService = true
      if let charUUID = module?.batteryLevelChar {
        peripheral.discoverCharacteristics([charUUID], for: service)
      }
    }

    // バッテリーサービスが無い場合はエラーを通知
    if !foundBatteryService {
      module?.sendEvent(
        "onBatteryLevelReceived",
        [
          "deviceId": peripheral.identifier.uuidString,
          "level": -1,
          "error": "Battery Service (0x180F) not supported by this device",
        ])
    }
  }

  /// キャラクタリスティック探索完了時のコールバック。
  /// Battery Level Characteristic (0x2A19) を見つけて値の読み取りを実行する。
  /// Notify プロパティがある場合は通知も有効化して、値の自動更新を受け取れるようにする。
  func peripheral(
    _ peripheral: CBPeripheral,
    didDiscoverCharacteristicsFor service: CBService,
    error: Error?
  ) {
    if let error = error {
      module?.sendEvent(
        "onBatteryLevelReceived",
        [
          "deviceId": peripheral.identifier.uuidString,
          "level": -1,
          "error": error.localizedDescription,
        ])
      return
    }

    guard let characteristics = service.characteristics else {
      module?.sendEvent(
        "onBatteryLevelReceived",
        [
          "deviceId": peripheral.identifier.uuidString,
          "level": -1,
          "error": "Battery Level characteristic not found",
        ])
      return
    }

    // Battery Level Characteristic (0x2A19) を検索
    var foundChar = false
    for characteristic in characteristics where characteristic.uuid == module?.batteryLevelChar {
      foundChar = true
      // 現在の値を読み取り
      peripheral.readValue(for: characteristic)
      // Notify 対応の場合は購読して自動更新を受け取る
      if characteristic.properties.contains(.notify) {
        peripheral.setNotifyValue(true, for: characteristic)
      }
    }

    if !foundChar {
      module?.sendEvent(
        "onBatteryLevelReceived",
        [
          "deviceId": peripheral.identifier.uuidString,
          "level": -1,
          "error": "Battery Level characteristic (0x2A19) not found",
        ])
    }
  }

  /// キャラクタリスティック値更新時のコールバック。
  /// Battery Level の値（1バイト、0-100 の整数）を読み取り、
  /// `onBatteryLevelReceived` イベントとして JavaScript に送信する。
  func peripheral(
    _ peripheral: CBPeripheral,
    didUpdateValueFor characteristic: CBCharacteristic,
    error: Error?
  ) {
    if let error = error {
      module?.sendEvent(
        "onBatteryLevelReceived",
        [
          "deviceId": peripheral.identifier.uuidString,
          "level": -1,
          "error": error.localizedDescription,
        ])
      return
    }

    // バッテリーレベルは 1 バイトの UInt8 値（0-100）
    guard characteristic.uuid == module?.batteryLevelChar,
      let data = characteristic.value,
      let level = data.first
    else { return }
    module?.sendEvent(
      "onBatteryLevelReceived",
      [
        "deviceId": peripheral.identifier.uuidString,
        "level": Int(level),
      ])
  }
}
