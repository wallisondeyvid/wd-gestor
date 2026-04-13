export function createRunSniffBiometriaCore({
  listDevices,
  openDevice,
  isTest = false,
  now = () => Date.now(),
  scheduleTimeout = setTimeout,
} = {}) {
  return function runSniffBiometriaCore({
    vendorId,
    productId,
    devPath,
    durationMs,
    poke,
    handshakeStrategy,
    handshakeReports,
  }) {
    return new Promise((resolve) => {
      const lista = typeof listDevices === 'function' ? listDevices() : [];
      let devInfo = null;

      if (devPath) devInfo = lista.find((device) => device.path === devPath);
      if (!devInfo && vendorId != null && productId != null) {
        devInfo = lista.find((device) => device.vendorId === vendorId && device.productId === productId);
      }

      if (!devInfo) {
        return resolve({ error: 'Dispositivo não encontrado' });
      }

      let device;
      try {
        device = openDevice(devInfo.path);
      } catch (error) {
        return resolve({ error: 'Falha abrir dispositivo', detail: error.message });
      }

      const packets = [];
      const started = now();
      let finished = false;

      device.on('data', (data) => {
        try {
          packets.push(Buffer.from(data));
        } catch {
          // noop
        }
      });

      device.on('error', (error) => {
        if (finished) return;
        finished = true;
        try {
          device.close();
        } catch {
          // noop
        }
        resolve({ error: 'Erro HID', detail: error.message, packets: packets.length });
      });

      if (poke) {
        try {
          if (handshakeStrategy === 'basic') {
            for (let reportId = 0; reportId <= 5; reportId += 1) {
              try {
                device.getFeatureReport(reportId, 64);
              } catch {
                // noop
              }

              try {
                const buffer = Buffer.alloc(16);
                buffer[0] = reportId;
                device.sendFeatureReport([...buffer]);
              } catch {
                // noop
              }
            }
          }

          if (Array.isArray(handshakeReports)) {
            handshakeReports.forEach((hexString) => {
              try {
                const clean = String(hexString || '').replace(/[^0-9a-fA-F]/g, '');
                if (!clean.length) return;

                const bytes = [];
                for (let index = 0; index < clean.length; index += 2) {
                  bytes.push(parseInt(clean.slice(index, index + 2), 16));
                }

                if (bytes.length) device.sendFeatureReport(bytes);
              } catch (error) {
                if (!isTest) console.warn('[BIOMETRIA] Sniff handshakeReport falhou', error.message);
              }
            });
          }
        } catch (error) {
          if (!isTest) console.warn('[BIOMETRIA] Sniff handshake falhou', error.message);
        }
      }

      scheduleTimeout(() => {
        if (finished) return;
        finished = true;
        try {
          device.close();
        } catch {
          // noop
        }

        const concat = Buffer.concat(packets);
        resolve({
          bytes: concat.length,
          packets: packets.length,
          dataHex: concat.length ? concat.toString('hex') : '',
          durationMs: now() - started,
          vendorId: devInfo.vendorId,
          productId: devInfo.productId,
        });
      }, durationMs);
    });
  };
}

export default createRunSniffBiometriaCore;