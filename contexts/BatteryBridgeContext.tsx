import { createContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { useEventListener } from 'expo';
import { BatteryModule } from '@/modules/battery-module';
import type { BleDevice } from '@/modules/battery-module';

export type BatteryBridgeState = {
    devices: BleDevice[];
    isScanning: boolean;
    connectedDeviceId: string | null;
    connectionState: string;
    batteryLevel: number | null;
    error: string | null;
    startScan: () => Promise<void>;
    stopScan: () => Promise<void>;
    connectToDevice: (deviceId: string) => Promise<void>;
    disconnectDevice: () => Promise<void>;
    readBatteryLevel: () => Promise<void>;
};

export const BatteryBridgeContext = createContext<BatteryBridgeState | null>(null);

const emitter = BatteryModule as unknown as Parameters<typeof useEventListener>[0];

export function BatteryBridgeProvider({ children }: { children: ReactNode }) {
    const [devices, setDevices] = useState<Map<string, BleDevice>>(new Map());
    const [isScanning, setIsScanning] = useState(false);
    const [connectedDeviceId, setConnectedDeviceId] = useState<string | null>(null);
    const [connectionState, setConnectionState] = useState<string>('disconnected');
    const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const devicesRef = useRef<Map<string, BleDevice>>(new Map());

    useEventListener(emitter, 'onDeviceFound', (event: any) => {
        const device: BleDevice = { id: event.id, name: event.name, rssi: event.rssi };
        devicesRef.current = new Map(devicesRef.current).set(device.id, device);
        setDevices(devicesRef.current);
    });

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

    useEventListener(emitter, 'onBatteryLevelReceived', (event: any) => {
        if (event.level === -1) {
            setError(event.error ?? 'Battery service not available');
            setBatteryLevel(null);
        } else {
            setBatteryLevel(event.level);
            setError(null);
        }
    });

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

    const startScan = useCallback(async () => {
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
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to start scan');
            setIsScanning(false);
        }
    }, [requestAndroidPermissions]);

    const stopScan = useCallback(async () => {
        try {
            await BatteryModule.stopScan();
            setIsScanning(false);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to stop scan');
        }
    }, []);

    const connectToDevice = useCallback(async (deviceId: string) => {
        try {
            setError(null);
            await BatteryModule.stopScan();
            setIsScanning(false);
            setConnectionState('connecting');
            await BatteryModule.connectToDevice(deviceId);
        } catch (e) {
            setConnectionState('disconnected');
            setError(e instanceof Error ? e.message : 'Failed to connect');
        }
    }, []);

    const disconnectDevice = useCallback(async () => {
        try {
            await BatteryModule.disconnectDevice();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to disconnect');
        }
    }, []);

    const readBatteryLevel = useCallback(async () => {
        try {
            setError(null);
            await BatteryModule.readBatteryLevel();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to read battery level');
        }
    }, []);

    const value: BatteryBridgeState = {
        devices: Array.from(devices.values()),
        isScanning,
        connectedDeviceId,
        connectionState,
        batteryLevel,
        error,
        startScan,
        stopScan,
        connectToDevice,
        disconnectDevice,
        readBatteryLevel,
    };

    return (
        <BatteryBridgeContext.Provider value={value}>
            {children}
        </BatteryBridgeContext.Provider>
    );
}
