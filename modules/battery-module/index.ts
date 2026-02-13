/**
 * @file index.ts
 * @description battery-module パッケージの公開エントリポイント。
 *              ネイティブモジュール本体と型定義を re-export する。
 *
 * @example
 * ```typescript
 * import { BatteryModule } from '@/modules/battery-module';
 * import type { BleDevice } from '@/modules/battery-module';
 * ```
 */

export { default as BatteryModule } from './src/BatteryModule';
export type {
    BleDevice,
    ConnectionStateEvent,
    BatteryLevelEvent,
    BatteryModuleEvents,
    BatteryModuleType,
} from './src/BatteryModule.types';
