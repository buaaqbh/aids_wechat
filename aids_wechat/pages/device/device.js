// BLE 服务和特征值 UUID 常量
const BLE_SERVICE_UUID = '0000FC83-0000-1000-8000-00805F9B34FB';
const BLE_WRITE_UUID = '636f6d2e-6a69-7561-6e2e-484152303031';
const BLE_NOTIFY_UUID = '636f6d2e-6a69-7561-6e2e-484154303031';

Page({
  data: {
    deviceId: '',
    connected: false,
    characteristics: [],
    selectedService: null,
    selectedCharacteristic: null
  },

  // 格式化UUID，去除短横线，转换为大写
  formatUUID(uuid) {
    return uuid.replace(/-/g, '').toUpperCase()
  },

  // 检查UUID是否匹配，支持多种格式
  checkUUID(uuid1, uuid2) {
    const formattedUUID1 = this.formatUUID(uuid1)
    const formattedUUID2 = this.formatUUID(uuid2)

    // 完整UUID匹配
    if (formattedUUID1 === formattedUUID2) {
      return true
    }

    return false
  },

  onLoad(options) {
    this.setData({
      deviceId: options.deviceId,
      connected: false
    })
    this.app = getApp()
    this.getBLEDeviceServices()
  },

  getBLEDeviceServices() {
    wx.showLoading({
      title: '正在连接...'
    })

    wx.getBLEDeviceServices({
      deviceId: this.data.deviceId,
      success: (res) => {
        console.log('获取到的服务列表:', res.services.map(s => ({
          uuid: s.uuid,
          isPrimary: s.isPrimary
        })))

        // 检查是否存在目标服务UUID
        const targetService = res.services.find(service => {
          const match = this.checkUUID(service.uuid, BLE_SERVICE_UUID)
          // console.log('对比服务UUID:', {
          //   serviceUUID: service.uuid,
          //   targetUUID: BLE_SERVICE_UUID,
          //   match
          // })
          return match
        })

        if (!targetService) {
          wx.hideLoading()
          console.log('设备不支持所需服务:', {
            targetUUID: BLE_SERVICE_UUID,
            availableServices: res.services.map(s => s.uuid)
          })
          wx.showToast({
            title: '设备不支持所需服务',
            icon: 'none'
          })
          this.disconnectAndGoBack()
          return
        }

        console.log('找到目标服务:', targetService)

        // 使用找到的服务UUID获取特征值（保持原始格式，包含短横线）
        //setTimeout(() => {
        //  this.getBLEDeviceCharacteristics(targetService.uuid)
        //}, 10)
        this.getBLEDeviceCharacteristics(targetService.uuid)
      },
      fail: (error) => {
        wx.hideLoading()
        console.error('获取服务失败:', error)
        wx.showToast({
          title: '获取服务失败',
          icon: 'none'
        })
        this.disconnectAndGoBack()
      }
    })
  },

  getBLEDeviceCharacteristics(serviceId) {
    console.log('准备获取特征值，服务ID:', {
      serviceId,
      deviceId: this.data.deviceId
    })

    wx.getBLEDeviceCharacteristics({
      deviceId: this.data.deviceId,
      serviceId: serviceId,
      success: (res) => {
        const characteristics = res.characteristics
        console.log('获取到的特征值列表:', characteristics.map(c => ({
          uuid: c.uuid,
          properties: c.properties
        })))

        // 查找具有写入权限的特征值
        const writeChar = characteristics.find(char => {
          const match = this.checkUUID(char.uuid, BLE_WRITE_UUID) && (char.properties.write || char.properties.writeNoResponse)
          //console.log('对比写入特征值:', {
          //  charUUID: char.uuid,
          //  targetUUID: BLE_WRITE_UUID,
          //  properties: char.properties,
          //  match
          //})
          return match
        })

        // 查找具有通知权限的特征值
        const notifyChar = characteristics.find(char => {
          const match = this.checkUUID(char.uuid, BLE_NOTIFY_UUID) && (char.properties.notify || char.properties.indicate)
          //console.log('对比通知特征值:', {
          //  charUUID: char.uuid,
          //  targetUUID: BLE_NOTIFY_UUID,
          //  properties: char.properties,
          //  match
          //})
          return match
        })

        if (!writeChar || !notifyChar) {
          wx.hideLoading()
          console.log('设备特征值不符合要求:', {
            characteristics: characteristics.map(c => ({
              uuid: c.uuid,
              properties: c.properties
            })),
            writeUUID: BLE_WRITE_UUID,
            notifyUUID: BLE_NOTIFY_UUID,
            foundWrite: writeChar ? '找到写入特征值' : '未找到写入特征值或无写入权限',
            foundNotify: notifyChar ? '找到通知特征值' : '未找到通知特征值或无通知权限'
          })
          wx.showToast({
            title: '设备特征值不符合要求',
            icon: 'none'
          })
          this.disconnectAndGoBack()
          return
        }

        console.log('特征值验证通过:', {
          write: {
            uuid: writeChar.uuid,
            properties: writeChar.properties
          },
          notify: {
            uuid: notifyChar.uuid,
            properties: notifyChar.properties
          }
        })

        // 验证通过，设置状态（使用原始格式的UUID）
        this.setData({
          characteristics: characteristics,
          selectedService: serviceId,
          selectedCharacteristic: writeChar.uuid,
          connected: true
        })

        // 启用通知特征值（使用原始格式的UUID）
        this.enableNotification(serviceId, notifyChar.uuid)
      },
      fail: (error) => {
        wx.hideLoading()
        console.error('获取特征值失败:', {
          error,
          serviceId,
          deviceId: this.data.deviceId
        })
        wx.showToast({
          title: '获取特征值失败',
          icon: 'none'
        })
        this.disconnectAndGoBack()
      }
    })
  },

  enableNotification(serviceId, characteristicId) {
    wx.notifyBLECharacteristicValueChange({
      deviceId: this.data.deviceId,
      serviceId: serviceId,
      characteristicId: characteristicId,
      state: true,
      success: () => {
        wx.hideLoading()
        console.log('启用通知成功')
        wx.showToast({
          title: '连接成功',
          icon: 'success'
        })
        wx.onBLECharacteristicValueChange((res) => {
          console.log('收到设备数据:', res.value)
        })
      },
      fail: (error) => {
        wx.hideLoading()
        console.error('启用通知失败:', error)
        wx.showToast({
          title: '启用通知失败',
          icon: 'none'
        })
      }
    })
  },

  // 发送命令到设备
  sendCommand(e) {
    const command = e.currentTarget.dataset.command
    if (!this.data.connected) {
      console.log('设备未连接，无法发送命令')
      wx.showToast({
        title: '设备未连接',
        icon: 'none'
      })
      console.log('设备未连接')
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
        console.log('命令发送成功:', command)
        wx.showToast({
          title: '命令发送成功',
          icon: 'success'
        })
        console.log('命令发送成功')
      },
      fail: (error) => {
        console.error('命令发送失败:', error, '命令:', command)
        wx.showToast({
          title: '命令发送失败',
          icon: 'none'
        })
        console.log('命令发送失败')
      }
    })
  },

  // 断开连接并返回
  disconnectAndGoBack() {
    wx.closeBLEConnection({
      deviceId: this.data.deviceId,
      complete: () => {
        this.setData({ connected: false })
        //wx.navigateBack({
        //  delta: 1
        //})
      }
    })
  },

  onUnload() {
    wx.closeBLEConnection({
      deviceId: this.data.deviceId
    })
  }
})