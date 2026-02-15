import { useContext } from 'react';
import { BatteryBridgeContext, type BatteryBridgeState } from '@/contexts/BatteryBridgeContext';

/**
 * BLE バッテリー操作を行うカスタムフック。
 * BatteryBridgeProvider 内で使用する必要がある。
 * 全画面で同一の BLE 状態を共有する。
 */
export function useBatteryBridge(): BatteryBridgeState {
    const context = useContext(BatteryBridgeContext);
    if (!context) {
        throw new Error('useBatteryBridge must be used within a BatteryBridgeProvider');
    }
    return context;
}
