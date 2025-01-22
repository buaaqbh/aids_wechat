Page({
  data: {
    deviceId: '',
    connected: false,
    services: [],
    characteristics: [],
    selectedService: null,
    selectedCharacteristic: null
  },

  onLoad(options) {
    this.setData({ deviceId: options.deviceId })
    this.app = getApp()
    this.getBLEDeviceServices()
  },

  getBLEDeviceServices() {
    wx.getBLEDeviceServices({
      deviceId: this.data.deviceId,
      success: (res) => {
        this.setData({ services: res.services })
        if (res.services.length > 0) {
          this.getBLEDeviceCharacteristics(res.services[0].uuid)
        }
      },
      fail: (error) => {
        console.error('获取服务失败:', error)
        wx.showToast({
          title: '获取服务失败',
          icon: 'none'
        })
      }
    })
  },

  getBLEDeviceCharacteristics(e) {
    const serviceId = e.currentTarget ? e.currentTarget.dataset.serviceId : e;
    wx.getBLEDeviceCharacteristics({
      deviceId: this.data.deviceId,
      serviceId: serviceId,
      success: (res) => {
        this.setData({
          characteristics: res.characteristics,
          selectedService: serviceId
        })
      },
      fail: (error) => {
        console.error('获取特征值失败:', error)
        wx.showToast({
          title: '获取特征值失败',
          icon: 'none'
        })
      }
    })
  },

  selectCharacteristic(e) {
    const characteristicId = e.currentTarget.dataset.characteristicId;
    this.setData({
      selectedCharacteristic: characteristicId
    })
  },

  // 发送命令到设备
  sendCommand(command) {
    if (!this.data.selectedService || !this.data.selectedCharacteristic) {
      wx.showToast({
        title: '请先选择服务和特征值',
        icon: 'none'
      })
      return
    }

    // 将命令转换为ArrayBuffer格式
    const buffer = new ArrayBuffer(command.length)
    const dataView = new DataView(buffer)
    for (let i = 0; i < command.length; i++) {
      dataView.setUint8(i, command.charCodeAt(i))
    }

    wx.writeBLECharacteristicValue({
      deviceId: this.data.deviceId,
      serviceId: this.data.selectedService,
      characteristicId: this.data.selectedCharacteristic,
      value: buffer,
      success: () => {
        console.log('命令发送成功')
        wx.showToast({
          title: '命令发送成功',
          icon: 'success'
        })
      },
      fail: (error) => {
        console.error('命令发送失败:', error)
        wx.showToast({
          title: '命令发送失败',
          icon: 'none'
        })
      }
    })
  },

  onUnload() {
    wx.closeBLEConnection({
      deviceId: this.data.deviceId
    })
  }
})