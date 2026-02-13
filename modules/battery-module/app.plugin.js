const { withInfoPlist, withAndroidManifest } = require('expo/config-plugins');

function withBlePermissions(config) {
  config = withInfoPlist(config, (config) => {
    config.modResults.NSBluetoothAlwaysUsageDescription =
      config.modResults.NSBluetoothAlwaysUsageDescription ||
      'This app uses Bluetooth to scan for nearby BLE devices and read their battery levels.';
    return config;
  });

  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest['uses-permission']) {
      manifest['uses-permission'] = [];
    }
    const permissions = manifest['uses-permission'];

    const addPermission = (name, attrs) => {
      if (!permissions.some((p) => p.$['android:name'] === name)) {
        permissions.push({ $: { 'android:name': name, ...attrs } });
      }
    };

    addPermission('android.permission.BLUETOOTH_SCAN', {
      'android:usesPermissionFlags': 'neverForLocation',
    });
    addPermission('android.permission.BLUETOOTH_CONNECT');
    addPermission('android.permission.ACCESS_FINE_LOCATION');
    addPermission('android.permission.BLUETOOTH');
    addPermission('android.permission.BLUETOOTH_ADMIN');

    if (!manifest['uses-feature']) {
      manifest['uses-feature'] = [];
    }
    const features = manifest['uses-feature'];
    if (!features.some((f) => f.$['android:name'] === 'android.hardware.bluetooth_le')) {
      features.push({
        $: {
          'android:name': 'android.hardware.bluetooth_le',
          'android:required': 'true',
        },
      });
    }

    return config;
  });

  return config;
}

module.exports = withBlePermissions;
