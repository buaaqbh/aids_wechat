Page({
  data: {
    devices: [],
    scanning: false
  },

  onLoad() {
    this.app = getApp()
  },

  startScan() {
    if (this.data.scanning) return
    
    this.setData({ scanning: true, devices: [] })
    
    wx.startBluetoothDevicesDiscovery({
      success: (res) => {
        wx.onBluetoothDeviceFound((result) => {
          const devices = result.devices
          const newDevices = devices.filter(device => {
            return device.name && !this.data.devices.some(existingDevice => 
              existingDevice.deviceId === device.deviceId
            )
          })
          
          if (newDevices.length > 0) {
            this.setData({
              devices: [...this.data.devices, ...newDevices]
            })
          }
        })
      },
      fail: (error) => {
        console.error('搜索蓝牙设备失败:', error)
        wx.showToast({
          title: '搜索设备失败',
          icon: 'none'
        })
      }
    })
  },

  stopScan() {
    wx.stopBluetoothDevicesDiscovery()
    this.setData({ scanning: false })
  },

  connectDevice(e) {
    const deviceId = e.currentTarget.dataset.deviceId
    wx.createBLEConnection({
      deviceId,
      success: (res) => {
        this.app.globalData.connectedDeviceId = deviceId
        wx.showToast({
          title: '连接成功',
          icon: 'success'
        })
        wx.navigateTo({
          url: '/pages/device/device?deviceId=' + deviceId
        })
      },
      fail: (error) => {
        console.error('连接设备失败:', error)
        wx.showToast({
          title: '连接失败',
          icon: 'none'
        })
      }
    })
  },

  onUnload() {
    this.stopScan()
  }
})