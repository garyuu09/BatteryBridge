/**
 * @file index.tsx (Scanner Screen)
 * @description BLE デバイススキャナー画面。
 *              周辺の BLE デバイスを検出し、リスト表示する。
 *              デバイスをタップすると詳細画面（modal.tsx）へ遷移する。
 *
 *              この画面の責務:
 *              - BLE スキャンの開始・停止
 *              - 発見済みデバイスの一覧表示
 *              - デバイス選択時のナビゲーション
 */

import { Platform, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useBatteryBridge } from '@/hooks/useBatteryBridge';
import type { BleDevice } from '@/modules/battery-module';

/**
 * スキャナー画面のメインコンポーネント。
 * BLE デバイスのスキャンと発見済みデバイスの一覧表示を行う。
 * デバイスタップで詳細画面（/modal）へ遷移し、デバイス情報をパラメータとして渡す。
 */
export default function ScannerScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const router = useRouter();

  const {
    devices,
    isScanning,
    connectedDeviceId,
    error,
    startScan,
    stopScan,
  } = useBatteryBridge();

  // Web プラットフォームでは BLE 非対応のためフォールバック UI を表示
  if (Platform.OS === 'web') {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.centered}>
          <ThemedText type="title">BatteryBridge</ThemedText>
          <ThemedText style={styles.warning}>
            ⚠️ BLE is not supported on web platform.
          </ThemedText>
          <ThemedText>Please use a physical iOS or Android device.</ThemedText>
        </SafeAreaView>
      </ThemedView>
    );
  }

  /**
   * デバイスタップ時のハンドラー。
   * スキャン中の場合は停止してから、デバイス情報を持ってモーダル画面へ遷移する。
   */
  const handleDevicePress = (device: BleDevice) => {
    if (isScanning) {
      stopScan();
    }
    router.push({
      pathname: '/modal',
      params: {
        deviceId: device.id,
        deviceName: device.name,
        deviceRssi: String(device.rssi),
      },
    });
  };

  /**
   * FlatList の各デバイス行を描画する。
   * 接続中のデバイスはハイライト表示される。
   */
  const renderDevice = ({ item }: { item: BleDevice }) => {
    const isConnected = item.id === connectedDeviceId;
    return (
      <TouchableOpacity
        style={[
          styles.deviceItem,
          {
            backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.03)',
            borderColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
          },
          isConnected && styles.deviceItemConnected,
        ]}
        onPress={() => handleDevicePress(item)}
        activeOpacity={0.7}
      >
        <View style={styles.deviceInfo}>
          <ThemedText type="defaultSemiBold" numberOfLines={1}>
            {item.name}
          </ThemedText>
          <ThemedText style={styles.deviceMeta}>
            RSSI: {item.rssi} dBm
          </ThemedText>
          <ThemedText style={styles.deviceId} numberOfLines={1}>
            {item.id}
          </ThemedText>
        </View>
        {/* 遷移を示すシェブロン */}
        <ThemedText style={styles.chevron}>›</ThemedText>
      </TouchableOpacity>
    );
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          {/* ── ヘッダー ── */}
          <View style={styles.header}>
            <ThemedText type="title">BatteryBridge</ThemedText>
            <ThemedText style={styles.subtitle}>BLE Battery Level Checker</ThemedText>
          </View>

          {/* ── エラー表示 ── */}
          {error && (
            <View style={styles.errorContainer}>
              <ThemedText style={styles.errorText}>⚠️ {error}</ThemedText>
            </View>
          )}

          {/* ── スキャンボタン ── */}
          <TouchableOpacity
            style={[styles.scanButton, isScanning && styles.scanButtonActive]}
            onPress={isScanning ? stopScan : startScan}
          >
            {isScanning && <ActivityIndicator color="#fff" style={styles.spinner} />}
            <ThemedText style={styles.scanButtonText}>
              {isScanning ? 'Stop Scan' : 'Start Scan'}
            </ThemedText>
          </TouchableOpacity>

          {/* ── デバイスリスト ── */}
          <View style={styles.listHeader}>
            <ThemedText type="subtitle">
              Discovered Devices ({devices.length})
            </ThemedText>
          </View>

          <FlatList
            data={devices}
            keyExtractor={(item) => item.id}
            renderItem={renderDevice}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyList}>
                <ThemedText style={styles.emptyText}>
                  {isScanning
                    ? 'Scanning for devices...'
                    : 'Tap "Start Scan" to find nearby BLE devices'}
                </ThemedText>
              </View>
            }
          />
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

// ── スタイル定義 ─────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 12,
  },
  header: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  subtitle: {
    opacity: 0.6,
    marginTop: 4,
  },
  warning: {
    color: '#e67e22',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 8,
  },
  errorContainer: {
    backgroundColor: 'rgba(231, 76, 60, 0.15)',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: '#e74c3c',
  },
  scanButton: {
    backgroundColor: '#0a7ea4',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 16,
  },
  scanButtonActive: {
    backgroundColor: '#e67e22',
  },
  scanButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  spinner: {
    marginRight: 8,
  },
  listHeader: {
    marginBottom: 8,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 16,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  deviceItemConnected: {
    borderColor: '#2ecc71',
    borderWidth: 1.5,
    backgroundColor: 'rgba(46, 204, 113, 0.08)',
  },
  deviceInfo: {
    flex: 1,
    gap: 2,
  },
  deviceMeta: {
    fontSize: 13,
    opacity: 0.6,
  },
  deviceId: {
    fontSize: 11,
    opacity: 0.4,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
  },
  chevron: {
    fontSize: 22,
    opacity: 0.3,
    marginLeft: 8,
  },
  emptyList: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    opacity: 0.5,
    textAlign: 'center',
  },
});
