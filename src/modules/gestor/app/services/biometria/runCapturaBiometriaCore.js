export function createRunCapturaBiometriaCore({
  listDevices,
  openDevice,
  isTest = false,
  now = () => Date.now(),
  scheduleTimeout = setTimeout,
} = {}) {
  return function runCapturaBiometriaCore({
    vendorId,
    productId,
    devPath,
    timeoutMs,
    minBytes,
    maxBytes,
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
        if (!isTest) console.warn('[BIOMETRIA] Dispositivo não encontrado', { vendorId, productId, devPath });
        return resolve({ error: 'Dispositivo não encontrado no servidor', vendorId, productId });
      }

      let device;
      try {
        device = openDevice(devInfo.path);
      } catch (error) {
        if (!isTest) {
          console.error('[BIOMETRIA] Falha abrir dispositivo (primeira tentativa)', {
            msg: error.message,
            path: devInfo.path,
            vendorId: devInfo.vendorId,
            productId: devInfo.productId,
          });
        }

        const alternates = lista
          .filter((candidate) => candidate.vendorId === devInfo.vendorId && candidate.productId === devInfo.productId && candidate.path !== devInfo.path)
          .slice(0, 3);
        const attemptedPaths = [devInfo.path];
        let lastError = error;

        for (const alternate of alternates) {
          try {
            attemptedPaths.push(alternate.path);
            device = openDevice(alternate.path);
            if (!isTest) console.log('[BIOMETRIA] Dispositivo aberto via fallback path', alternate.path);
            break;
          } catch (fallbackError) {
            lastError = fallbackError;
            if (!isTest) console.warn('[BIOMETRIA] Falha fallback path', alternate.path, fallbackError.message);
          }
        }

        if (!device) {
          return resolve({
            error: 'Falha ao abrir dispositivo',
            code: 'HID_OPEN_FAILED',
            detail: lastError.message,
            vendorId: devInfo.vendorId,
            productId: devInfo.productId,
            attemptedPaths,
          });
        }
      }

      const chunks = [];
      let resolved = false;
      const started = now();

      function finalize(payload) {
        if (resolved) return;
        resolved = true;
        try {
          device.close();
        } catch {
          // noop
        }
        payload.durationMs = now() - started;
        resolve(payload);
      }

      device.on('data', (data) => {
        try {
          const values = Array.from(data);
          chunks.push(...values);

          if (chunks.length >= maxBytes) {
            const hexMax = chunks.slice(0, maxBytes).map((value) => value.toString(16).padStart(2, '0')).join('');
            if (!isTest) console.log('[BIOMETRIA] Captura truncada (atingiu maxBytes)', { bytes: maxBytes });
            return finalize({ template: hexMax, bytes: maxBytes, truncated: true });
          }

          if (chunks.length >= minBytes) {
            const hex = chunks.map((value) => value.toString(16).padStart(2, '0')).join('');
            if (!isTest) console.log('[BIOMETRIA] Captura concluída', { bytes: chunks.length });
            return finalize({ template: hex, bytes: chunks.length });
          }
        } catch (error) {
          if (!isTest) console.error('[BIOMETRIA] Erro processando dados', error);
          finalize({ error: 'Erro processando dados', code: 'HID_DATA_PROCESSING', detail: error.message });
        }
      });

      device.on('error', (error) => {
        if (!isTest) console.error('[BIOMETRIA] Evento erro HID', error.message);
        finalize({ error: 'Erro HID', code: 'HID_EVENT_ERROR', detail: error.message });
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
                if (!isTest) console.warn('[BIOMETRIA] Falha enviar handshakeReport', error.message);
              }
            });
          }
        } catch (error) {
          if (!isTest) console.warn('[BIOMETRIA] Handshake falhou', error.message);
        }
      }

      scheduleTimeout(() => {
        if (resolved) return;

        if (chunks.length) {
          const hex = chunks.map((value) => value.toString(16).padStart(2, '0')).join('');
          if (!isTest) console.warn('[BIOMETRIA] Timeout parcial', { bytes: chunks.length });
          return finalize({ template: hex, bytes: chunks.length, timeout: true });
        }

        if (!isTest) console.warn('[BIOMETRIA] Timeout sem dados');
        finalize({ error: 'Timeout sem dados' });
      }, timeoutMs);
    });
  };
}

export default createRunCapturaBiometriaCore;