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
            // 过滤设备：必须有名称，且名称以AIDS开头（不区分大小写），且不在现有设备列表中
            return device.name &&
              device.name.toUpperCase().startsWith('AIDS') &&
              !this.data.devices.some(existingDevice =>
                existingDevice.deviceId === device.deviceId
              )
          })

          if (newDevices.length > 0) {
            console.log('发现新设备:', newDevices)
            this.setData({
              devices: [...this.data.devices, ...newDevices]
            })
          }
        })
      },
      fail: (error) => {
        console.error('搜索蓝牙设备失败:', error)
        console.log('搜索设备失败')
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
    wx.showLoading({
      title: '正在连接...'
    })

    wx.createBLEConnection({
      deviceId,
      success: (res) => {
        console.log('创建BLE连接成功:', deviceId)
        this.app.globalData.connectedDeviceId = deviceId
        wx.hideLoading()
        wx.navigateTo({
          url: '/pages/device/device?deviceId=' + deviceId
        })
      },
      fail: (error) => {
        wx.hideLoading()
        console.error('连接设备失败:', error)
        console.log('连接失败')
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