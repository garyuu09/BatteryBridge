/**
 * @file BatteryModule.ts
 * @description BatteryModule ネイティブモジュールのエントリポイント。
 *              Expo の `requireNativeModule` を使用して、Swift/Kotlin で実装された
 *              ネイティブ BLE モジュールを JavaScript 側にバインドする。
 */

import { requireNativeModule } from 'expo';
import type { BatteryModuleType } from './BatteryModule.types';

/**
 * ネイティブ BLE バッテリーモジュールのインスタンス。
 * iOS では CoreBluetooth、Android では Android BLE API を使用する。
 */
export default requireNativeModule<BatteryModuleType>('BatteryModule');
