App({
  globalData: {
    bluetoothDevices: [],
    connectedDeviceId: null
  },

  onLaunch() {
    // 检查蓝牙是否可用
    wx.openBluetoothAdapter({
      success: (res) => {
        console.log('蓝牙初始化成功')
        // 开始监听蓝牙适配器状态
        wx.onBluetoothAdapterStateChange((res) => {
          if (!res.available) {
            console.log('蓝牙适配器不可用')
          }
        })
      },
      fail: (error) => {
        console.error('蓝牙初始化失败:', error)
        wx.showToast({
          title: '请开启蓝牙',
          icon: 'none'
        })
      }
    })
  },

  onHide() {
    // 关闭蓝牙连接
    if (this.globalData.connectedDeviceId) {
      wx.closeBLEConnection({
        deviceId: this.globalData.connectedDeviceId
      })
    }
    // 关闭蓝牙适配器
    wx.closeBluetoothAdapter()
  }
})