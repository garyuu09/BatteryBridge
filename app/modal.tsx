/**
 * @file modal.tsx (Device Detail Screen)
 * @description BLE デバイスの詳細画面。モーダルとして表示される。
 *              スキャナー画面でデバイスを選択すると、この画面に遷移する。
 *
 *              この画面の責務:
 *              - 選択されたデバイスへの自動接続
 *              - 接続完了後のバッテリーレベル自動読み取り
 *              - デバイス情報（名前・ID・RSSI・接続状態）の表示
 *              - バッテリーレベルのビジュアルゲージ表示
 *              - 切断・再接続操作
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, View, TouchableOpacity, ActivityIndicator, ScrollView, useColorScheme, Platform } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useBatteryBridge } from '@/hooks/useBatteryBridge';

// ── ユーティリティ関数 ─────────────────────────────────

/**
 * バッテリーレベルに応じた色を返す。
 * - 60% 以上: 緑（Good）
 * - 30% 以上: 黄（Medium）
 * - 30% 未満: 赤（Low）
 */
function getBatteryColor(level: number): string {
  if (level >= 60) return '#2ecc71';
  if (level >= 30) return '#f39c12';
  return '#e74c3c';
}

// ── バッテリーゲージコンポーネント ──────────────────────────

/**
 * バッテリー残量をビジュアルに表示するゲージコンポーネント。
 *
 * 構成:
 * - 大きな数値表示（残量パーセント）
 * - バッテリーアイコン型の水平ゲージ（枠 + 端子 + 充填バー）
 * - 0%〜100% のスケールラベル
 * - 状態テキスト（Good / Medium / Low）
 *
 * @param level - バッテリーレベル（0-100）
 */
function BatteryGauge({ level }: { level: number }) {
  const color = getBatteryColor(level);

  return (
    <View style={gaugeStyles.container}>
      {/* パーセンテージの大きな数値 */}
      <View style={gaugeStyles.numberRow}>
        <ThemedText style={[gaugeStyles.levelNumber, { color }]}>{level}</ThemedText>
        <ThemedText style={[gaugeStyles.percentSign, { color }]}>%</ThemedText>
      </View>

      {/* バッテリーアイコン型ゲージ（本体 + 端子） */}
      <View style={gaugeStyles.batteryOuter}>
        <View style={gaugeStyles.batteryBody}>
          <View style={[gaugeStyles.batteryFill, { width: `${level}%`, backgroundColor: color }]} />
        </View>
        <View style={gaugeStyles.batteryTip} />
      </View>

      {/* スケールラベル */}
      <View style={gaugeStyles.scaleRow}>
        <ThemedText style={gaugeStyles.scaleLabel}>0%</ThemedText>
        <ThemedText style={gaugeStyles.scaleLabel}>25%</ThemedText>
        <ThemedText style={gaugeStyles.scaleLabel}>50%</ThemedText>
        <ThemedText style={gaugeStyles.scaleLabel}>75%</ThemedText>
        <ThemedText style={gaugeStyles.scaleLabel}>100%</ThemedText>
      </View>

      {/* 残量ステータスラベル */}
      <ThemedText style={[gaugeStyles.statusLabel, { color }]}>
        {level >= 60 ? '✅ Good' : level >= 30 ? '⚠️ Medium' : '🔴 Low'}
      </ThemedText>
    </View>
  );
}

/** BatteryGauge コンポーネント用スタイル */
const gaugeStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 20,
    gap: 16,
  },
  numberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    overflow: 'visible',
    paddingTop: 4,
  },
  levelNumber: {
    fontSize: 56,
    lineHeight: 68,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  percentSign: {
    fontSize: 24,
    lineHeight: 32,
    fontWeight: '700',
    marginLeft: 4,
    opacity: 0.7,
  },
  batteryOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 16,
  },
  batteryBody: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(150,150,150,0.3)',
    overflow: 'hidden',
    padding: 3,
  },
  batteryFill: {
    height: '100%',
    borderRadius: 4,
    minWidth: 4,
  },
  batteryTip: {
    width: 6,
    height: 16,
    backgroundColor: 'rgba(150,150,150,0.3)',
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    marginLeft: 2,
  },
  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 16,
    paddingRight: 24,
  },
  scaleLabel: {
    fontSize: 10,
    opacity: 0.35,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
});

// ── 情報行コンポーネント ──────────────────────────────────

/**
 * デバイス情報をラベル・値のペアで表示する行コンポーネント。
 *
 * @param label - 項目名（例: "Name", "RSSI"）
 * @param value - 項目値（例: "Device XYZ", "-65 dBm"）
 */
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <ThemedText style={styles.infoLabel}>{label}</ThemedText>
      <ThemedText style={styles.infoValue}>{value}</ThemedText>
    </View>
  );
}

// ── メイン画面コンポーネント ───────────────────────────────

/**
 * デバイス詳細画面。モーダルとして表示される。
 *
 * スキャナー画面から以下のパラメータを受け取る:
 * - deviceId: デバイスの UUID
 * - deviceName: デバイス名
 * - deviceRssi: RSSI 値（文字列）
 *
 * 画面表示時に自動的にデバイスへ接続し、接続完了後にバッテリーレベルを読み取る。
 */
export default function DeviceDetailScreen() {
  const router = useRouter();
  /** スキャナー画面から渡されたデバイスパラメータ */
  const { deviceId, deviceName, deviceRssi } = useLocalSearchParams<{
    deviceId: string;
    deviceName: string;
    deviceRssi: string;
  }>();
  const colorScheme = useColorScheme() ?? 'light';

  const {
    connectedDeviceId,
    connectionState,
    batteryLevel,
    error,
    connectToDevice,
    disconnectDevice,
    readBatteryLevel,
  } = useBatteryBridge();

  /** デバイスが接続済みかどうかの判定 */
  const isConnected = connectedDeviceId === deviceId && connectionState === 'connected';
  /** 接続処理中かどうかの判定 */
  const isConnecting = connectionState === 'connecting';

  /**
   * 画面表示時の自動接続。
   * デバイスが未接続状態の場合のみ接続を開始する。
   */
  useEffect(() => {
    if (deviceId && connectionState === 'disconnected') {
      connectToDevice(deviceId);
    }
  }, [deviceId]);

  /**
   * 接続完了後のバッテリーレベル自動読み取り。
   * ネイティブ側でも接続直後にサービス探索を開始するが、
   * 明示的に readBatteryLevel を呼ぶことでユーザー操作なしに値を取得する。
   */
  useEffect(() => {
    if (isConnected) {
      readBatteryLevel();
    }
  }, [isConnected]);

  /**
   * デバイスを切断し、前の画面（スキャナー画面）に戻る。
   */
  const handleDisconnect = async () => {
    await disconnectDevice();
    router.back();
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* ── デバイス情報カード ── */}
        <View style={[
          styles.card,
          { backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' },
        ]}>
          <ThemedText type="subtitle" style={styles.cardTitle}>Device Info</ThemedText>
          <InfoRow label="Name" value={deviceName ?? 'Unknown'} />
          <InfoRow label="ID" value={deviceId ?? '-'} />
          <InfoRow label="RSSI" value={deviceRssi ? `${deviceRssi} dBm` : '-'} />
          <InfoRow label="Status" value={
            isConnecting ? 'Connecting...' :
              isConnected ? '🟢 Connected' :
                connectionState === 'failed' ? '🔴 Failed' :
                  '⚪ Disconnected'
          } />
        </View>

        {/* ── エラー表示 ── */}
        {error && (
          <View style={styles.errorContainer}>
            <ThemedText style={styles.errorText}>⚠️ {error}</ThemedText>
          </View>
        )}

        {/* ── 接続中インジケーター ── */}
        {isConnecting && (
          <View style={styles.connectingContainer}>
            <ActivityIndicator size="large" color="#0a7ea4" />
            <ThemedText style={styles.connectingText}>Connecting to device...</ThemedText>
          </View>
        )}

        {/* ── バッテリーセクション（接続後に表示） ── */}
        {isConnected && (
          <View style={[
            styles.card,
            { backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.02)' },
          ]}>
            <ThemedText type="subtitle" style={styles.cardTitle}>Battery Level</ThemedText>
            {batteryLevel !== null ? (
              // バッテリーレベル取得済み → ゲージ表示
              <BatteryGauge level={batteryLevel} />
            ) : error ? (
              // エラー発生（例: Battery Service 非対応）→ エラーメッセージ表示
              <View style={styles.loadingBattery}>
                <ThemedText style={styles.errorSmall}>⚠️ {error}</ThemedText>
              </View>
            ) : (
              // 読み取り中 → ローディング表示
              <View style={styles.loadingBattery}>
                <ActivityIndicator size="small" color="#0a7ea4" />
                <ThemedText style={styles.loadingText}>Reading battery...</ThemedText>
              </View>
            )}
            <TouchableOpacity style={styles.refreshButton} onPress={readBatteryLevel}>
              <ThemedText style={styles.refreshButtonText}>🔄 Refresh</ThemedText>
            </TouchableOpacity>
          </View>
        )}

        {/* ── アクションボタン ── */}
        <View style={styles.actions}>
          {/* 未接続時: 再接続ボタン */}
          {!isConnected && !isConnecting && (
            <TouchableOpacity
              style={styles.connectButton}
              onPress={() => deviceId && connectToDevice(deviceId)}
            >
              <ThemedText style={styles.buttonTextWhite}>Reconnect</ThemedText>
            </TouchableOpacity>
          )}
          {/* 接続中: 切断ボタン */}
          {isConnected && (
            <TouchableOpacity style={styles.disconnectButton} onPress={handleDisconnect}>
              <ThemedText style={styles.buttonTextWhite}>Disconnect</ThemedText>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

// ── スタイル定義 ─────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(150,150,150,0.2)',
  },
  cardTitle: {
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150,150,150,0.15)',
  },
  infoLabel: {
    fontSize: 14,
    opacity: 0.6,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    maxWidth: '60%',
    textAlign: 'right',
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  errorContainer: {
    backgroundColor: 'rgba(231, 76, 60, 0.15)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#e74c3c',
  },
  connectingContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  connectingText: {
    opacity: 0.6,
  },
  loadingBattery: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  loadingText: {
    opacity: 0.5,
    fontStyle: 'italic',
  },
  errorSmall: {
    color: '#e74c3c',
    fontSize: 14,
    textAlign: 'center',
  },
  refreshButton: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: 'rgba(10, 126, 164, 0.1)',
    marginTop: 8,
  },
  refreshButtonText: {
    color: '#0a7ea4',
    fontWeight: '600',
    fontSize: 14,
  },
  actions: {
    marginTop: 8,
    gap: 12,
  },
  connectButton: {
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disconnectButton: {
    backgroundColor: '#e74c3c',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonTextWhite: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
