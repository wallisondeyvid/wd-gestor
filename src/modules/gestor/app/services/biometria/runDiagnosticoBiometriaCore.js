export function createRunDiagnosticoBiometriaCore({
  listDevices,
  openDevice,
  platform = process.platform,
} = {}) {
  return function runDiagnosticoBiometriaCore() {
    const devices = typeof listDevices === 'function' ? listDevices() : [];
    const resultados = devices.map((device) => {
      const info = {
        vendorId: device.vendorId,
        productId: device.productId,
        path: device.path,
        product: device.product || '',
        manufacturer: device.manufacturer || '',
        usagePage: device.usagePage,
        usage: device.usage,
      };

      const lower = `${info.product} ${info.manufacturer}`.toLowerCase();
      info.possivelIntegrado = /hidi2c|intel|synaptics|goodix|validity|windows hello/.test(lower);

      try {
        const openedDevice = openDevice(device.path);
        openedDevice.close();
        info.opened = true;
        info.error = null;
      } catch (error) {
        info.opened = false;
        info.error = error.message;
        if (/access|denied|permission/i.test(error.message)) {
          info.sugestao = 'Executar servidor como administrador ou dispositivo bloqueado pelo Windows Biometric Framework (integrado).';
        } else if (/cannot open device with path/i.test(error.message)) {
          info.sugestao = 'Dispositivo monopolizado por outro driver (ex: Windows Hello).';
        }
      }

      return info;
    });

    return {
      sistema: platform,
      qtd: devices.length,
      resultados,
    };
  };
}

export default createRunDiagnosticoBiometriaCore;