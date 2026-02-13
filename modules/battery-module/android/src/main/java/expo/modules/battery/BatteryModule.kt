package expo.modules.battery

import android.Manifest
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattDescriptor
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.bluetooth.le.BluetoothLeScanner
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.ActivityCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

class BatteryModule : Module() {
  companion object {
    private val BATTERY_SERVICE_UUID: UUID =
      UUID.fromString("0000180F-0000-1000-8000-00805f9b34fb")
    private val BATTERY_LEVEL_CHAR_UUID: UUID =
      UUID.fromString("00002A19-0000-1000-8000-00805f9b34fb")
    private val CCCD_UUID: UUID =
      UUID.fromString("00002902-0000-1000-8000-00805f9b34fb")
  }

  private val context: Context
    get() = appContext.reactContext
      ?: throw CodedException("ERR_CONTEXT", "React context is not available", null)

  private val bluetoothAdapter: BluetoothAdapter?
    get() = (context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager)?.adapter

  private var bleScanner: BluetoothLeScanner? = null
  private var bluetoothGatt: BluetoothGatt? = null
  private val discoveredDevices = mutableMapOf<String, BluetoothDevice>()

  private fun hasPermission(permission: String): Boolean =
    ActivityCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

  private fun requireScanPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !hasPermission(Manifest.permission.BLUETOOTH_SCAN)) {
      throw CodedException("ERR_PERMISSIONS", "BLUETOOTH_SCAN permission not granted", null)
    }
  }

  private fun requireConnectPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !hasPermission(Manifest.permission.BLUETOOTH_CONNECT)) {
      throw CodedException("ERR_PERMISSIONS", "BLUETOOTH_CONNECT permission not granted", null)
    }
  }

  // Scan callback
  private val scanCallback = object : ScanCallback() {
    override fun onScanResult(callbackType: Int, result: ScanResult) {
      val device = result.device
      val deviceId = device.address
      discoveredDevices[deviceId] = device

      val deviceName = try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          if (hasPermission(Manifest.permission.BLUETOOTH_CONNECT)) device.name ?: "Unknown"
          else "Unknown"
        } else {
          device.name ?: "Unknown"
        }
      } catch (_: SecurityException) {
        "Unknown"
      }

      sendEvent("onDeviceFound", mapOf(
        "id" to deviceId,
        "name" to deviceName,
        "rssi" to result.rssi
      ))
    }

    override fun onScanFailed(errorCode: Int) {
      // Scan failure is silently handled
    }
  }

  // GATT callback
  private val gattCallback = object : BluetoothGattCallback() {
    override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
      val deviceId = gatt.device.address
      when (newState) {
        BluetoothProfile.STATE_CONNECTED -> {
          bluetoothGatt = gatt
          sendEvent("onConnectionStateChanged", mapOf(
            "deviceId" to deviceId,
            "state" to "connected"
          ))
          try {
            requireConnectPermission()
            gatt.discoverServices()
          } catch (_: Exception) {
            // Permission check failed
          }
        }
        BluetoothProfile.STATE_DISCONNECTED -> {
          bluetoothGatt = null
          sendEvent("onConnectionStateChanged", mapOf(
            "deviceId" to deviceId,
            "state" to "disconnected"
          ))
          try {
            gatt.close()
          } catch (_: Exception) {}
        }
      }
    }

    @Suppress("DEPRECATION")
    override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
      if (status != BluetoothGatt.GATT_SUCCESS) return

      val batteryService = gatt.getService(BATTERY_SERVICE_UUID) ?: return
      val batteryChar = batteryService.getCharacteristic(BATTERY_LEVEL_CHAR_UUID) ?: return

      try {
        requireConnectPermission()
        gatt.readCharacteristic(batteryChar)

        // Enable notifications
        gatt.setCharacteristicNotification(batteryChar, true)
        val descriptor = batteryChar.getDescriptor(CCCD_UUID)
        if (descriptor != null) {
          descriptor.value = BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
          gatt.writeDescriptor(descriptor)
        }
      } catch (_: Exception) {}
    }

    @Suppress("DEPRECATION")
    override fun onCharacteristicRead(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic,
      status: Int
    ) {
      if (characteristic.uuid == BATTERY_LEVEL_CHAR_UUID && status == BluetoothGatt.GATT_SUCCESS) {
        val level = characteristic.value?.firstOrNull()?.toInt()?.and(0xFF) ?: return
        sendEvent("onBatteryLevelReceived", mapOf(
          "deviceId" to gatt.device.address,
          "level" to level
        ))
      }
    }

    @Suppress("DEPRECATION")
    override fun onCharacteristicChanged(
      gatt: BluetoothGatt,
      characteristic: BluetoothGattCharacteristic
    ) {
      if (characteristic.uuid == BATTERY_LEVEL_CHAR_UUID) {
        val level = characteristic.value?.firstOrNull()?.toInt()?.and(0xFF) ?: return
        sendEvent("onBatteryLevelReceived", mapOf(
          "deviceId" to gatt.device.address,
          "level" to level
        ))
      }
    }
  }

  override fun definition() = ModuleDefinition {
    Name("BatteryModule")

    Events("onDeviceFound", "onConnectionStateChanged", "onBatteryLevelReceived")

    AsyncFunction("startScan") {
      val adapter = bluetoothAdapter
        ?: throw CodedException("ERR_BLE", "Bluetooth is not available", null)
      if (!adapter.isEnabled) {
        throw CodedException("ERR_BLE", "Bluetooth is not enabled", null)
      }

      requireScanPermission()

      discoveredDevices.clear()
      bleScanner = adapter.bluetoothLeScanner

      val scanSettings = ScanSettings.Builder()
        .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
        .build()

      bleScanner?.startScan(null, scanSettings, scanCallback)
    }

    AsyncFunction("stopScan") {
      try {
        requireScanPermission()
        bleScanner?.stopScan(scanCallback)
      } catch (_: Exception) {}
    }

    AsyncFunction("connectToDevice") { deviceId: String ->
      val device = discoveredDevices[deviceId]
        ?: throw CodedException("ERR_DEVICE", "Device not found: $deviceId", null)

      requireConnectPermission()
      device.connectGatt(context, false, gattCallback)
    }

    AsyncFunction("disconnectDevice") {
      try {
        requireConnectPermission()
        bluetoothGatt?.disconnect()
        bluetoothGatt?.close()
      } catch (_: Exception) {}
      bluetoothGatt = null
    }

    AsyncFunction("readBatteryLevel") {
      val gatt = bluetoothGatt
        ?: throw CodedException("ERR_NOT_CONNECTED", "No device connected", null)

      val batteryService = gatt.getService(BATTERY_SERVICE_UUID)
        ?: throw CodedException("ERR_SERVICE", "Battery service not found on device", null)
      val batteryChar = batteryService.getCharacteristic(BATTERY_LEVEL_CHAR_UUID)
        ?: throw CodedException("ERR_SERVICE", "Battery level characteristic not found", null)

      requireConnectPermission()
      gatt.readCharacteristic(batteryChar)
    }

    OnDestroy {
      try {
        bleScanner?.stopScan(scanCallback)
      } catch (_: Exception) {}
      try {
        bluetoothGatt?.disconnect()
        bluetoothGatt?.close()
      } catch (_: Exception) {}
    }
  }
}
