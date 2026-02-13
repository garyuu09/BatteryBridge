# BatteryBridge 🔋

BLE（Bluetooth Low Energy）デバイスのバッテリー残量を確認するモバイルアプリです。

## 機能

- **BLE デバイススキャン** — 周辺の BLE デバイスを検出し、デバイス名・RSSI・ID を一覧表示
- **デバイス詳細画面** — タップでモーダル遷移し、自動接続・バッテリー読み取り
- **バッテリーレベル表示** — バッテリーアイコン型ゲージで残量を視覚的に表示（緑/黄/赤の色分け）
- **エラーハンドリング** — Battery Service 非対応デバイスへの適切なエラー表示
- **ダークモード対応** — システム設定に連動した自動テーマ切り替え

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| フレームワーク | Expo SDK 54 / React Native 0.81 |
| 言語 | TypeScript 5.9 / Swift |
| UI | React 19 |
| ルーティング | Expo Router (ファイルベース) |
| ネイティブモジュール | Expo Modules API |
| BLE 通信 | CoreBluetooth (iOS) |
| パッケージ管理 | npm / CocoaPods |

## アーキテクチャ

本アプリは **3層構造** で構成されています。

```
┌─────────────────────────────────────────────────┐
│  JavaScript Thread (React Native)               │
│                                                 │
│  ┌──────────┐    ┌──────────────────────┐       │
│  │ UI 画面   │───▶│ useBatteryBridge.ts  │       │
│  │ index.tsx │    │   (カスタムフック)      │       │
│  │ modal.tsx │◀───│                      │       │
│  └──────────┘    └──────────┬───────────┘       │
│                             │                   │
│                  ┌──────────▼───────────┐       │
│                  │ BatteryModule.ts     │       │
│                  │ (ネイティブバインド)    │       │
│                  └──────────┬───────────┘       │
└─────────────────────────────┼───────────────────┘
                              │ Expo Modules API
                     ═════════╪═════════ (ブリッジ)
                              │
┌─────────────────────────────┼───────────────────┐
│  Native Thread (iOS)        │                   │
│                  ┌──────────▼───────────┐       │
│                  │ BatteryModule.swift  │       │
│                  │ (CoreBluetooth)      │       │
│                  └─────────────────────┘       │
└─────────────────────────────────────────────────┘
```

### 通信の流れ

| 方向 | 説明 | 例 |
|-----|------|-----|
| **JS → Native** | 関数呼び出し | `BatteryModule.startScan()` → Swift の `AsyncFunction("startScan")` |
| **Native → JS** | イベント送信 | Swift `sendEvent("onDeviceFound")` → `useEventListener` で受信 |

## プロジェクト構成

```
BatteryBridge/
├── app/                        # 画面コンポーネント（Expo Router）
│   ├── (tabs)/
│   │   ├── index.tsx           # スキャナー画面（デバイス一覧）
│   │   └── _layout.tsx         # タブレイアウト
│   ├── modal.tsx               # デバイス詳細画面（バッテリー表示）
│   └── _layout.tsx             # ルートレイアウト（Stack ナビゲーション）
├── components/                 # 共通 UI コンポーネント
│   ├── themed-text.tsx         # テーマ対応テキスト
│   └── themed-view.tsx         # テーマ対応ビュー
├── hooks/
│   ├── useBatteryBridge.ts     # BLE 操作のカスタムフック
│   └── use-color-scheme.ts     # ダークモード対応
├── modules/
│   └── battery-module/         # ネイティブ BLE モジュール
│       ├── ios/
│       │   └── BatteryModule.swift  # iOS 実装 (CoreBluetooth)
│       ├── src/
│       │   ├── BatteryModule.ts       # ネイティブモジュールバインド
│       │   └── BatteryModule.types.ts # TypeScript 型定義
│       └── index.ts            # パッケージエントリポイント
├── constants/                  # テーマカラー定数
└── assets/                     # 画像・フォント
```

## セットアップ

### 必要環境

- Node.js 18+
- Xcode 15+ (iOS ビルド)
- 物理 iOS デバイス（BLE はシミュレーターでは動作しません）

### インストール

```bash
npm install
```

### iOS ビルド & 実行

```bash
# CocoaPods インストール + 実機ビルド
npx expo run:ios --device
```

### 開発サーバー起動

```bash
npx expo start
```

## BLE 対応サービス

現在、以下の標準 BLE サービスに対応しています：

| サービス | UUID | 概要 |
|---------|------|------|
| Battery Service | `0x180F` | バッテリー残量サービス |
| Battery Level Characteristic | `0x2A19` | バッテリーレベル値 (0-100%) |

> ⚠️ Battery Service (0x180F) を公開していないデバイスでは、バッテリー残量を取得できません。その場合はエラーメッセージが表示されます。

## 画面フロー

1. **スキャナー画面** — 「Start Scan」で BLE デバイスを検出
2. **デバイス選択** — リストからデバイスをタップ
3. **詳細画面** — 自動接続 → 自動バッテリー読み取り → ゲージ表示
4. **操作** — 「Refresh」で再読み取り / 「Disconnect」で切断して戻る

## 権限

### iOS (`Info.plist`)
- `NSBluetoothAlwaysUsageDescription` — BLE スキャン・接続に必要

### Android (`AndroidManifest.xml`)
- `BLUETOOTH_SCAN` — デバイススキャン
- `BLUETOOTH_CONNECT` — デバイス接続
- `ACCESS_FINE_LOCATION` — BLE スキャンに必要（Android 要件）

## ライセンス

Private
