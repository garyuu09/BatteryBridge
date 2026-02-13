Pod::Spec.new do |s|
  s.name           = 'BatteryModule'
  s.version        = '1.0.0'
  s.summary        = 'Expo module for reading BLE battery levels'
  s.description    = 'Native BLE module using CoreBluetooth to scan devices and read battery levels'
  s.author         = ''
  s.homepage       = 'https://github.com/example'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.swift'
end
