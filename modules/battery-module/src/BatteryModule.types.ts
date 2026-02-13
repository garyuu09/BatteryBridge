/**
 * @file BatteryModule.types.ts
 * @description BLE バッテリーモジュールの TypeScript 型定義。
 *              ネイティブモジュール（iOS/Android）が送受信するデータ構造と
 *              JavaScript から呼び出し可能な関数のインターフェースを定義する。
 */

import type { NativeModule } from 'expo';

/**
 * BLE スキャンで発見されたデバイスの情報。
 * ネイティブ側の `onDeviceFound` イベントで送信される。
 */
export type BleDevice = {
    /** デバイスの一意識別子（UUID 文字列） */
    id: string;
    /** デバイスのアドバタイズ名（不明な場合は "Unknown"） */
    name: string;
    /** 受信信号強度（dBm 単位・0に近いほど信号が強い） */
    rssi: number;
};

/**
 * BLE 接続状態変更イベントのペイロード。
 * 接続成功・切断・失敗時に `onConnectionStateChanged` で送信される。
 */
export type ConnectionStateEvent = {
    /** 対象デバイスの UUID */
    deviceId: string;
    /** 現在の接続状態 */
    state: 'connected' | 'disconnected' | 'failed';
    /** 失敗時のエラーメッセージ（state が 'failed' の場合のみ） */
    error?: string;
};

/**
 * バッテリーレベル受信イベントのペイロード。
 * `onBatteryLevelReceived` で送信される。
 * level が -1 の場合はエラー（バッテリーサービス非対応等）を示す。
 */
export type BatteryLevelEvent = {
    /** 対象デバイスの UUID */
    deviceId: string;
    /** バッテリーレベル（0-100）。-1 はエラーを示す。 */
    level: number;
    /** エラー時のメッセージ（level が -1 の場合のみ）*/
    error?: string;
};

/**
 * ネイティブモジュールが発行するイベントの型マップ。
 * Expo の useEventListener で型安全にリスンするために使用する。
 */
export type BatteryModuleEvents = {
    /** BLE スキャンでデバイスが見つかった時に発火 */
    onDeviceFound: (event: BleDevice) => void;
    /** BLE 接続状態が変化した時に発火 */
    onConnectionStateChanged: (event: ConnectionStateEvent) => void;
    /** バッテリーレベルを受信した時に発火 */
    onBatteryLevelReceived: (event: BatteryLevelEvent) => void;
};

/**
 * BatteryModule ネイティブモジュールの TypeScript インターフェース。
 * NativeModule を継承し、BLE 操作のための非同期関数を公開する。
 *
 * @example
 * ```typescript
 * import { BatteryModule } from '@/modules/battery-module';
 *
 * await BatteryModule.startScan();
 * await BatteryModule.connectToDevice('device-uuid');
 * await BatteryModule.readBatteryLevel();
 * ```
 */
export interface BatteryModuleType extends NativeModule<BatteryModuleEvents> {
    /** BLE デバイスのスキャンを開始する。Bluetooth が OFF の場合はエラーをスローする。 */
    startScan(): Promise<void>;
    /** 実行中の BLE スキャンを停止する。 */
    stopScan(): Promise<void>;
    /** 指定したデバイスに BLE 接続する。接続前にスキャンを停止すること推奨。 */
    connectToDevice(deviceId: string): Promise<void>;
    /** 現在接続中のデバイスを切断する。 */
    disconnectDevice(): Promise<void>;
    /** 接続中デバイスの Battery Service (0x180F) からバッテリーレベルを読み取る。 */
    readBatteryLevel(): Promise<void>;
}
