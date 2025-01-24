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
                        console.log('收到数据(HEX):', this.arrayBufferToHex(res.value));
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

    // 发送命令（带响应超时）
    sendCommand(cmdStr, params = null, timeout = 2000, failCallback = null, resDataCallback = null) {
        if (!this.connected) {
            throw new Error('设备未连接');
        }

        const buffer = this.convertCmdToBytes(cmdStr, params);

        // 保存原始回调引用
        const originalCallback = this.dataCallback;

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                this.dataCallback = originalCallback; // 恢复原始回调
                const err = new Error(`命令响应超时（${timeout}ms）`);
                if (typeof failCallback === 'function') {
                    failCallback(err);
                }
                reject(err);
            }, timeout);

            // 配置临时数据回调
            const tempDataHandler = (data) => {
                try {
                    // 先解析响应数据
                    const response = this.parseResponse(data);

                    // 只有解析成功后才执行以下操作
                    clearTimeout(timeoutId);

                    // 先执行回调再恢复原始回调
                    if (typeof resDataCallback === 'function') {
                        resDataCallback(response);
                    }

                    // 确保在回调执行完成后恢复原始回调
                    this.dataCallback = originalCallback;
                    resolve(response);
                } catch (error) {
                    clearTimeout(timeoutId);
                    this.dataCallback = originalCallback;

                    // 错误处理回调
                    if (typeof failCallback === 'function') {
                        failCallback(error);
                    }
                    reject(error);
                }
            };

            this.dataCallback = tempDataHandler;

            // 执行BLE写入操作
            wx.writeBLECharacteristicValue({
                deviceId: this.deviceId,
                serviceId: this.selectedService,
                characteristicId: this.selectedCharacteristic,
                value: buffer,
                writeType: 'writeNoResponse',
                success: () => {
                    console.log('命令发送成功，等待响应...');
                },
                fail: (error) => {
                    clearTimeout(timeoutId);
                    this.dataCallback = originalCallback;
                    if (typeof failCallback === 'function') {
                        failCallback(error);
                    }
                    reject(error);
                }
            });
        });
    }

    // 解析设备响应
    parseResponse(data) {
        const arr = new Uint8Array(data);
        if (arr.length < 5) {
            throw new Error('响应数据长度不足, 至少需要5字节');
        }

        // 检查包头（0xB0）
        if (arr[0] !== 0xB0) {
            throw new Error(`无效包头(预期0xB0,实际0x${arr[0].toString(16).padStart(2, '0')})`);
        }

        // 检查固定字节（0xD0 0x01）
        if (arr[2] !== 0xD0 || arr[3] !== 0x01) {
            throw new Error(`无效固定字节(位置2:0x${arr[2].toString(16).padStart(2, '0')}, 位置3:0x${arr[3].toString(16).padStart(2, '0')})`);
        }

        // 验证数据长度
        const dataLength = arr[1];
        if (dataLength + 3 > arr.length) {
            throw new Error(`数据长度异常（声明长度:${dataLength}，实际长度:${arr.length-3})`);
        }

        // 计算校验和（从第2字节到倒数第2字节）
        const checksumCalculated = arr.slice(2, -1).reduce((sum, byte) => sum + byte, 0) & 0xFF;
        const checksumReceived = arr[arr.length - 1];
        if (checksumCalculated !== checksumReceived) {
            throw new Error(`校验和验证失败（计算值:0x${checksumCalculated.toString(16).padStart(2, '0')}，接收值:0x${checksumReceived.toString(16).padStart(2, '0')})`);
        }

        // 提取有效数据（从第4字节开始，取dataLength-2字节）
        const dataStart = 4;
        const dataEnd = dataStart + dataLength - 2;

        // 自动适配实际数据长度（当声明长度超过实际数据时）
        const safeDataEnd = Math.min(dataEnd, arr.length - 1);
        return Array.from(arr.slice(dataStart, safeDataEnd));
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