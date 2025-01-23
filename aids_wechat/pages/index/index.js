Page({
  data: {
    devices: [],
    scanning: false,
    isRefreshing: false
  },

  onLoad() {
    this.app = getApp()
  },

  startScan() {
    console.log('准备开始扫描蓝牙设备')
    if (this.data.scanning) {
      console.log('已在扫描中，忽略此次扫描请求')
      return
    }

    this.setData({ scanning: true, devices: [] })
    console.log('开始扫描蓝牙设备')

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
    console.log('停止扫描蓝牙设备')
    wx.stopBluetoothDevicesDiscovery({
      success: () => {
        console.log('停止扫描成功')
        this.setData({ scanning: false })
      },
      fail: (error) => {
        console.error('停止扫描失败:', error)
      }
    })
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
  },
  onPullRefresh() {
    this.setData({ isRefreshing: true })
    console.log('触发下拉刷新，当前扫描状态:', this.data.scanning)
    if (this.data.scanning) {
      console.log('正在扫描中，停止扫描')
      this.stopScan()
    } else {
      console.log('未在扫描中，开始扫描')
      this.startScan()
    }
    setTimeout(() => {
      this.setData({ isRefreshing: false })
    }, 200)
  },

  onPullRestore() {
    console.log('下拉刷新被复位')
    this.setData({ isRefreshing: false })
  },

  onUnload() {
    this.stopScan()
  }
})