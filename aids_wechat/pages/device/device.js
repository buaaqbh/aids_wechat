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
        selectedCharacteristic: null,
        volume: 8,
        algorithmEnabled: false,
        sendData: '',
        receivedData: ''
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
                    const arrayBuffer = res.value;
                    console.log('原始字节数据:', arrayBuffer);
                    const hexData = Array.prototype.map.call(
                        new Uint8Array(res.value),
                        x => ('00' + x.toString(16)).slice(-2)
                    ).join(' ');
                    console.log('收到设备数据(hex):', hexData);
                    this.setData({
                        receivedData: hexData
                    });
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

    // 将字符串转换为字节数组
    stringToBytes(str) {
        const bytes = [];
        for (let i = 0; i < str.length; i++) {
            bytes.push(str.charCodeAt(i));
        }
        return bytes;
    },

    // 将参数转换为指定格式
    convertParams(byteList) {
        const groups = [];
        for (let i = 0; i < byteList.length; i += 4) {
            groups.push(byteList.slice(i, i + 4));
        }

        const result = groups.map(group => {
            // 反转字节顺序（小端模式）
            const reversedGroup = group.slice().reverse();
            const hexStr = reversedGroup.map(b => b.toString(16).padStart(2, '0')).join('');
            return `0x${hexStr}`;
        });

        const strResult = result.join(',');
        return this.stringToBytes(strResult);
    },

    // 将命令字符串转换为特定格式的字节数组
    convertCmdToBytes(cmdStr, params = null) {
        // 将命令字符串转换为字节数组
        const cmdBytes = this.stringToBytes(cmdStr);

        // 计算长度（从0xD0到命令字符串结束）
        // 长度包括：0xD0 + 0x01 + cmdBytes
        let cmdLength = cmdBytes.length + 2; // 2个固定字节（0xD0和0x01）
        if (params && params.length > 0) {
            cmdLength += 1 + params.length; // 加上参数分隔符和参数长度
        }

        // 创建带有头部的字节数组
        const result = [
            0xA0, // 命令代码
            cmdLength, // 长度（不包括前两个字节和校验和）
            0xD0, // 固定字节1
            0x01 // 固定字节2
        ];

        // 添加命令字符串字节
        result.push(...cmdBytes);

        // 如果有参数，添加参数
        if (params && params.length > 0) {
            result.push(0x7c); // 参数分隔符
            result.push(...params);
        }

        // 计算校验和（从第三个字节到结束）
        const checksum = result.slice(2).reduce((sum, byte) => sum + byte, 0) & 0xFF;

        // 添加校验和
        result.push(checksum);

        return new Uint8Array(result).buffer;
    },

    // 将 ArrayBuffer 转换为16进制字符串
    arrayBufferToHex(buffer) {
        return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join(' ');
    },

    // 发送命令到设备
    sendCommand(cmdStr, params = null) {
        if (!this.data.connected) {
            console.log('设备未连接，无法发送命令')
            wx.showToast({
                title: '设备未连接',
                icon: 'none'
            })
            return
        }

        console.log('发送命令:', cmdStr, params ? `参数: ${this.arrayBufferToHex(new Uint8Array(params).buffer)}` : '')

        // 将命令转换为ArrayBuffer格式
        const buffer = this.convertCmdToBytes(cmdStr, params);
        console.log('命令数据(hex):', this.arrayBufferToHex(buffer))

        // 发送到设备
        wx.writeBLECharacteristicValue({
            deviceId: this.data.deviceId,
            serviceId: this.data.selectedService,
            characteristicId: this.data.selectedCharacteristic,
            value: buffer,
            writeType: 'writeNoResponse',
            success: () => {
                console.log('命令发送成功')
            },
            fail: (error) => {
                console.error('命令发送失败:', error)
                wx.showToast({
                    title: '发送失败',
                    icon: 'error'
                })
            }
        })
    },

    onAlgorithmChange(e) {
        const enabled = e.detail.value
        this.setData({
            algorithmEnabled: enabled
        })

        // 构建命令数据
        const cmdStr = 'ym_algo'; // 算法控制命令
        const rawParams = [enabled ? 0x01 : 0x00]; // 参数：1表示开启，0表示关闭
        const params = this.convertParams(rawParams); // 转换参数格式

        // 发送命令
        this.sendCommand(cmdStr, params);

        // 显示结果提示
        wx.showToast({
            title: enabled ? '算法已开启' : '算法已关闭',
            icon: 'success',
            fail: () => {
                // 恢复开关状态
                this.setData({
                    algorithmEnabled: !enabled
                })
            }
        })
    },

    // 处理发送数据的输入
    onSendDataInput(e) {
        this.setData({
            sendData: e.detail.value
        })
    },

    // 发送hex数据
    sendHexData() {
        if (!this.data.connected) {
            wx.showToast({
                title: '设备未连接',
                icon: 'none'
            })
            return
        }

        const hexString = this.data.sendData.replace(/\s+/g, '')
        if (!/^[0-9A-Fa-f]*$/.test(hexString)) {
            wx.showToast({
                title: '请输入有效的hex数据',
                icon: 'none'
            })
            return
        }

        // 构建命令数据
        const cmdStr = 'xfer_hifi_raw'
        const dataBuffer = new Uint8Array(Math.floor(hexString.length / 2))
        for (let i = 0; i < dataBuffer.length; i++) {
            dataBuffer[i] = parseInt(hexString.substr(i * 2, 2), 16)
        }

        // 发送命令
        this.sendCommand(cmdStr, dataBuffer)
    },

    // 断开连接并返回
    disconnectAndGoBack() {
        wx.closeBLEConnection({
            deviceId: this.data.deviceId,
            complete: () => {
                this.setData({
                    connected: false
                })
                // 添加延时，确保错误提示信息能够显示
                setTimeout(() => {
                    wx.navigateBack({
                        delta: 1
                    })
                }, 1500) // 延时1.5秒
            }
        })
    },

    onUnload() {
        wx.closeBLEConnection({
            deviceId: this.data.deviceId
        })
    }
})