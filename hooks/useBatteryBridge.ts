/**
 * @file useBatteryBridge.ts
 * @description BLE バッテリー操作のカスタム React Hook。
 *              ネイティブ BatteryModule のイベントを購読し、
 *              スキャン・接続・バッテリー読み取りの状態を React コンポーネントに提供する。
 *
 *              フロー: startScan → onDeviceFound → connectToDevice →
 *                      onConnectionStateChanged → readBatteryLevel → onBatteryLevelReceived
 */

import { useState, useCallback, useRef } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { useEventListener } from 'expo';
import { BatteryModule } from '@/modules/battery-module';
import type { BleDevice, BatteryModuleEvents } from '@/modules/battery-module';

/**
 * ネイティブモジュールをイベントエミッターとしてキャスト。
 * BatteryModule は NativeModule を継承し EventEmitter を持つが、
 * TypeScript の型定義では useEventListener の第一引数に直接渡せないため、
 * 型アサーションで回避する。
 */
const emitter = BatteryModule as unknown as Parameters<typeof useEventListener>[0];

/**
 * BLE バッテリー操作を行うカスタムフック。
 *
 * @returns スキャン・接続・バッテリー読み取りの状態と操作関数
 *
 * @example
 * ```tsx
 * const { devices, isScanning, startScan, connectToDevice } = useBatteryBridge();
 * ```
 */
export function useBatteryBridge() {
    // ── 状態管理 ──────────────────────────────────────
    /** 発見済みデバイスの Map（キー: デバイスID） */
    const [devices, setDevices] = useState<Map<string, BleDevice>>(new Map());
    /** スキャン実行中フラグ */
    const [isScanning, setIsScanning] = useState(false);
    /** 接続中デバイスの ID（未接続時は null） */
    const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null);
    /** BLE 接続状態（'disconnected' | 'connected' | 'connecting' | 'failed'） */
    const [connectionState, setConnectionState] = useState<string>('disconnected');
    /** 最後に読み取ったバッテリーレベル（0-100、未取得時は null） */
    const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
    /** 直近のエラーメッセージ（エラーなしの場合は null） */
    const [error, setError] = useState<string | null>(null);

    /**
     * devices の Mutable Ref。
     * useEventListener のコールバックはクロージャでキャプチャされるため、
     * useState だけだと古い値を参照してしまう問題を回避する。
     */
    const devicesRef = useRef<Map<string, BleDevice>>(new Map());
    /** スキャンタイムアウト用タイマー ID */
    const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── ネイティブイベントリスナー ─────────────────────────

    /**
     * デバイス発見イベント：BLE スキャン中にデバイスが見つかるたびに発火。
     * 同じデバイスが複数回見つかった場合は Map で自動的に上書きされる。
     */
    useEventListener(emitter, 'onDeviceFound', (event: any) => {
        const device: BleDevice = { id: event.id, name: event.name, rssi: event.rssi };
        devicesRef.current = new Map(devicesRef.current).set(device.id, device);
        setDevices(devicesRef.current);
    });

    /**
     * 接続状態変更イベント：接続・切断・失敗時に発火。
     * - connected: connectedDeviceId を設定、エラーをクリア
     * - disconnected: connectedDeviceId と batteryLevel をクリア
     * - failed: エラーメッセージを設定
     */
    useEventListener(emitter, 'onConnectionStateChanged', (event: any) => {
        setConnectionState(event.state);
        if (event.state === 'connected') {
            setConnectedDeviceId(event.deviceId);
            setError(null);
        } else if (event.state === 'disconnected') {
            setConnectedDeviceId(null);
            setBatteryLevel(null);
        } else if (event.state === 'failed') {
            setConnectedDeviceId(null);
            setError(event.error ?? 'Connection failed');
        }
    });

    /**
     * バッテリーレベル受信イベント：バッテリー値の読み取り完了時に発火。
     * level が -1 の場合はネイティブ側でエラーが発生したことを示す
     * （例: Battery Service 0x180F が存在しない）。
     */
    useEventListener(emitter, 'onBatteryLevelReceived', (event: any) => {
        if (event.level === -1) {
            setError(event.error ?? 'Battery service not available');
            setBatteryLevel(null);
        } else {
            setBatteryLevel(event.level);
            setError(null);
        }
    });

    // ── 操作関数 ──────────────────────────────────────

    /**
     * Android の BLE 関連パーミッションをリクエストする。
     * BLUETOOTH_SCAN, BLUETOOTH_CONNECT, ACCESS_FINE_LOCATION が必要。
     * iOS では常に true を返す（Info.plist の設定で制御）。
     */
    const requestAndroidPermissions = useCallback(async (): Promise<boolean> => {
        if (Platform.OS !== 'android') return true;

        try {
            const granted = await PermissionsAndroid.requestMultiple([
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            ]);

            return Object.values(granted).every(
                (status) => status === PermissionsAndroid.RESULTS.GRANTED
            );
        } catch {
            return false;
        }
    }, []);

    /** デフォルトのスキャンタイムアウト（ミリ秒） */
    const DEFAULT_SCAN_TIMEOUT = 10000;

    /**
     * BLE デバイスのスキャンを開始する。
     * - Android: パーミッション確認 → スキャン開始
     * - 発見済みデバイスリストをクリアしてからスキャンを開始
     * - スキャン結果は onDeviceFound イベントで受け取る
     * - 指定時間（デフォルト 10秒）経過後にスキャンを自動停止する
     *
     * @param timeout - スキャンタイムアウト（ミリ秒）。デフォルト 10000ms
     */
    const startScan = useCallback(async (timeout: number = DEFAULT_SCAN_TIMEOUT) => {
        try {
            setError(null);

            if (Platform.OS === 'android') {
                const hasPermissions = await requestAndroidPermissions();
                if (!hasPermissions) {
                    setError('Bluetooth permissions not granted');
                    return;
                }
            }

            devicesRef.current = new Map();
            setDevices(new Map());
            await BatteryModule.startScan();
            setIsScanning(true);

            // 既存のタイマーをクリアしてから新しいタイムアウトを設定
            if (scanTimeoutRef.current) {
                clearTimeout(scanTimeoutRef.current);
            }
            scanTimeoutRef.current = setTimeout(async () => {
                scanTimeoutRef.current = null;
                try {
                    await BatteryModule.stopScan();
                    setIsScanning(false);
                } catch (_) {}
            }, timeout);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to start scan');
            setIsScanning(false);
        }
    }, [requestAndroidPermissions]);

    /** BLE スキャンを停止する。タイムアウトタイマーもクリアする。 */
    const stopScan = useCallback(async () => {
        try {
            if (scanTimeoutRef.current) {
                clearTimeout(scanTimeoutRef.current);
                scanTimeoutRef.current = null;
            }
            await BatteryModule.stopScan();
            setIsScanning(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to stop scan');
        }
    }, []);

    /**
     * 指定したデバイスに BLE 接続する。
     * 接続前にスキャンを自動停止する（同時実行を避けるため）。
     * 接続結果は onConnectionStateChanged イベントで通知される。
     */
    const connectToDevice = useCallback(async (deviceId: string) => {
        try {
            setError(null);
            // スキャン中の場合は停止してから接続
            await BatteryModule.stopScan();
            setIsScanning(false);
            await BatteryModule.connectToDevice(deviceId);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to connect');
        }
    }, []);

    /** 現在接続中のデバイスを切断する。 */
    const disconnectDevice = useCallback(async () => {
        try {
            await BatteryModule.disconnectDevice();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to disconnect');
        }
    }, []);

    /**
     * 接続中デバイスのバッテリーレベルを読み取る。
     * ネイティブ側で Battery Service (0x180F) → Battery Level Characteristic (0x2A19) を探索し、
     * 結果を onBatteryLevelReceived イベントで送信する。
     */
    const readBatteryLevel = useCallback(async () => {
        try {
            setError(null);
            await BatteryModule.readBatteryLevel();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to read battery level');
        }
    }, []);

    return {
        /** 発見済み BLE デバイスの配列 */
        devices: Array.from(devices.values()),
        /** スキャン実行中かどうか */
        isScanning,
        /** 接続中デバイスの ID */
        connectedDeviceId,
        /** BLE 接続状態 */
        connectionState,
        /** バッテリーレベル（0-100、未取得は null） */
        batteryLevel,
        /** エラーメッセージ */
        error,
        /** スキャン開始 */
        startScan,
        /** スキャン停止 */
        stopScan,
        /** デバイスに接続 */
        connectToDevice,
        /** デバイスを切断 */
        disconnectDevice,
        /** バッテリーレベル読み取り */
        readBatteryLevel,
    };
}
