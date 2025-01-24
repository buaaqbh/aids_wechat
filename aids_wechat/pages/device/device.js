import BLEManager from '../../utils/BLEManager';

Page({
    data: {
        deviceId: '',
        connected: false,
        volume: 8,
        algorithmEnabled: false,
        sendData: '',
        receivedData: ''
    },

    bleManager: null,

    onLoad(options) {
        this.setData({
            deviceId: options.deviceId,
            connected: false
        });
        this.app = getApp();
        this.bleManager = new BLEManager();

        wx.showLoading({
            title: '正在连接...'
        });

        this.bleManager.connect(options.deviceId)
            .then(() => {
                this.setData({
                    connected: true
                });
                wx.hideLoading();
                wx.showToast({
                    title: '连接成功',
                    icon: 'success'
                });
            })
            .catch(error => {
                wx.hideLoading();
                console.error('连接失败:', error);
                wx.showToast({
                    title: error.message || '连接失败',
                    icon: 'none'
                });
                this.disconnectAndGoBack();
            });
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

    // 发送命令到设备（带响应处理）
    sendCommand(cmdStr, params = null, failCallback = null, dataCallback = null) {
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

        this.bleManager.sendCommand(cmdStr, params, 2000, failCallback, dataCallback)
            .then((response) => {
                //console.log('命令执行成功，响应数据:', response);
                wx.showToast({
                    title: '操作成功',
                    icon: 'success'
                });
                return response;
            })
            .catch(error => {
                //console.error('命令执行失败:', error);
                const errorMsg = error.message.includes('超时') ? '设备响应超时' : '操作失败';
                wx.showToast({
                    title: errorMsg,
                    icon: 'none'
                });
                throw error;
            })
            .finally(() => {
                wx.hideLoading();
            });
    },

    onAlgorithmChange(e) {
        const enabled = e.detail.value
        this.setData({
            algorithmEnabled: enabled
        })

        const cmdStr = 'ym_algo'; // 算法控制命令
        const rawParams = [enabled ? 0x01 : 0x00]; // 参数：1表示开启，0表示关闭
        const params = this.convertParams(rawParams); // 转换参数格式

        dataCallback = (response) => {
            console.log('响应数据(hex):', this.arrayBufferToHex(response))
        }

        failCallback = (error) => {
            console.error('命令执行失败:', error);
            const errorMsg = error.message.includes('超时') ? '设备响应超时' : '操作失败';
            wx.showToast({
                title: errorMsg,
                icon: 'none'
            });
        }
        // 发送命令
        this.sendCommand(cmdStr, params, failCallback, dataCallback);

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
    sendHexRawData() {
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
        const params = this.convertParams(dataBuffer); // 转换参数格式

        // 发送命令
        const dataCallback = (response) => {
            const hexString = response.map(b => b.toString(16).padStart(2, '0')).join(' ');
            this.setData({
                receivedData: hexString
            });
        };
        this.sendCommand(cmdStr, params, null, dataCallback)
    },

    // 断开连接并返回
    disconnectAndGoBack() {
        this.bleManager.disconnect()
            .then(() => {
                this.setData({
                    connected: false
                });
                // 添加延时，确保错误提示信息能够显示
                setTimeout(() => {
                    wx.navigateBack({
                        delta: 1
                    });
                }, 1500); // 延时1.5秒
            });
    },

    onUnload() {
        this.bleManager.disconnect();
        wx.offBLECharacteristicValueChange(); // 新增：移除全局监听
    }
})