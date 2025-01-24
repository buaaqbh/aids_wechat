class BLEManager {
    constructor() {
        // BLE 服务和特征值 UUID 常量
        this.BLE_SERVICE_UUID = '0000FC83-0000-1000-8000-00805F9B34FB';
        this.BLE_WRITE_UUID = '636f6d2e-6a69-7561-6e2e-484152303031';
        this.BLE_NOTIFY_UUID = '636f6d2e-6a69-7561-6e2e-484154303031';

        this.deviceId = '';
        this.connected = false;
        this.selectedService = null;
        this.selectedCharacteristic = null;
        this.dataCallback = null;
    }

    // 格式化UUID，去除短横线，转换为大写
    formatUUID(uuid) {
        return uuid.replace(/-/g, '').toUpperCase();
    }

    // 检查UUID是否匹配，支持多种格式
    checkUUID(uuid1, uuid2) {
        const formattedUUID1 = this.formatUUID(uuid1);
        const formattedUUID2 = this.formatUUID(uuid2);
        return formattedUUID1 === formattedUUID2;
    }

    // 连接设备
    async connect(deviceId) {
        console.log('开始连接设备:', deviceId);
        this.deviceId = deviceId;
        this.connected = false;

        try {
            console.log('获取设备服务...');
            const services = await this.getBLEDeviceServices();
            console.log('获取到的服务列表:', services.map(s => ({
                uuid: s.uuid,
                isPrimary: s.isPrimary
            })));

            const targetService = services.find(service =>
                this.checkUUID(service.uuid, this.BLE_SERVICE_UUID)
            );

            if (!targetService) {
                console.error('未找到目标服务:', {
                    targetUUID: this.BLE_SERVICE_UUID,
                    availableServices: services.map(s => s.uuid)
                });
                throw new Error('设备不支持所需服务');
            }

            console.log('找到目标服务:', targetService.uuid);
            console.log('获取设备特征值...');
            const characteristics = await this.getBLEDeviceCharacteristics(targetService.uuid);
            console.log('获取到的特征值列表:', characteristics.map(c => ({
                uuid: c.uuid,
                properties: c.properties
            })));

            const writeChar = characteristics.find(char =>
                this.checkUUID(char.uuid, this.BLE_WRITE_UUID) &&
                (char.properties.write || char.properties.writeNoResponse)
            );

            const notifyChar = characteristics.find(char =>
                this.checkUUID(char.uuid, this.BLE_NOTIFY_UUID) &&
                (char.properties.notify || char.properties.indicate)
            );

            if (!writeChar || !notifyChar) {
                console.error('特征值不符合要求:', {
                    writeUUID: this.BLE_WRITE_UUID,
                    notifyUUID: this.BLE_NOTIFY_UUID,
                    foundWrite: writeChar ? '找到写入特征值' : '未找到写入特征值或无写入权限',
                    foundNotify: notifyChar ? '找到通知特征值' : '未找到通知特征值或无通知权限'
                });
                throw new Error('设备特征值不符合要求');
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
            });

            this.selectedService = targetService.uuid;
            this.selectedCharacteristic = writeChar.uuid;
            this.connected = true;

            console.log('启用通知...');
            await this.enableNotification(targetService.uuid, notifyChar.uuid);
            console.log('连接成功');
            return true;
        } catch (error) {
            this.disconnect();
            throw error;
        }
    }

    // 获取BLE设备服务
    getBLEDeviceServices() {
        return new Promise((resolve, reject) => {
            wx.getBLEDeviceServices({
                deviceId: this.deviceId,
                success: (res) => resolve(res.services),
                fail: (error) => reject(error)
            });
        });
    }

    // 获取BLE设备特征值
    getBLEDeviceCharacteristics(serviceId) {
        return new Promise((resolve, reject) => {
            wx.getBLEDeviceCharacteristics({
                deviceId: this.deviceId,
                serviceId: serviceId,
                success: (res) => resolve(res.characteristics),
                fail: (error) => reject(error)
            });
        });
    }

    // 启用通知
    enableNotification(serviceId, characteristicId) {
        return new Promise((resolve, reject) => {
            console.log('启用通知:', {
                serviceId,
                characteristicId
            });
            wx.notifyBLECharacteristicValueChange({
                deviceId: this.deviceId,
                serviceId: serviceId,
                characteristicId: characteristicId,
                state: true,
                success: () => {
                    console.log('通知启用成功');
                    wx.offBLECharacteristicValueChange();
                    wx.onBLECharacteristicValueChange((res) => {
                        console.log('收到数据:', res.value);
                        if (this.dataCallback) {
                            this.dataCallback(res.value);
                        }
                    });
                    resolve();
                },
                fail: (error) => {
                    console.error('启用通知失败:', error);
                    reject(error);
                }
            });
        });
    }

    // 设置数据接收回调
    onDataReceived(callback) {
        console.log('设置数据接收回调');
        this.dataCallback = callback;
    }

    // 发送命令
    sendCommand(cmdStr, params = null) {
        if (!this.connected) {
            throw new Error('设备未连接');
        }

        const buffer = this.convertCmdToBytes(cmdStr, params);

        return new Promise((resolve, reject) => {
            wx.writeBLECharacteristicValue({
                deviceId: this.deviceId,
                serviceId: this.selectedService,
                characteristicId: this.selectedCharacteristic,
                value: buffer,
                writeType: 'writeNoResponse',
                success: () => resolve(),
                fail: (error) => reject(error)
            });
        });
    }

    // 断开连接
    disconnect() {
        return new Promise((resolve) => {
            wx.closeBLEConnection({
                deviceId: this.deviceId,
                complete: () => {
                    this.connected = false;
                    resolve();
                }
            });
        });
    }

    // 数据转换相关方法
    stringToBytes(str) {
        const bytes = [];
        for (let i = 0; i < str.length; i++) {
            bytes.push(str.charCodeAt(i));
        }
        return bytes;
    }

    convertParams(byteList) {
        const groups = [];
        for (let i = 0; i < byteList.length; i += 4) {
            groups.push(byteList.slice(i, i + 4));
        }

        const result = groups.map(group => {
            const reversedGroup = group.slice().reverse();
            const hexStr = reversedGroup.map(b => b.toString(16).padStart(2, '0')).join('');
            return `0x${hexStr}`;
        });

        const strResult = result.join(',');
        return this.stringToBytes(strResult);
    }

    convertCmdToBytes(cmdStr, params = null) {
        const cmdBytes = this.stringToBytes(cmdStr);
        let cmdLength = cmdBytes.length + 2;

        if (params && params.length > 0) {
            cmdLength += 1 + params.length;
        }

        const result = [
            0xA0,
            cmdLength,
            0xD0,
            0x01
        ];

        result.push(...cmdBytes);

        if (params && params.length > 0) {
            result.push(0x7c);
            result.push(...params);
        }

        const checksum = result.slice(2).reduce((sum, byte) => sum + byte, 0) & 0xFF;
        result.push(checksum);

        return new Uint8Array(result).buffer;
    }

    arrayBufferToHex(buffer) {
        return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join(' ');
    }
}

export default BLEManager;