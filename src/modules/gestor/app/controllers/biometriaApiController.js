import { ok, notFound, serverError, badRequest } from '#core/utils/apiResponse.js';
import { createRunCapturaBiometriaCore } from '#modules/gestor/app/services/biometria/runCapturaBiometriaCore.js';
import { createRunDiagnosticoBiometriaCore } from '#modules/gestor/app/services/biometria/runDiagnosticoBiometriaCore.js';
import { createRunSniffBiometriaCore } from '#modules/gestor/app/services/biometria/runSniffBiometriaCore.js';
const isTest =
	process.env.NODE_ENV === 'test' ||
	process.env.CI === 'true' ||
	process.execArgv.includes('--test');
const biometriaEnabled =
	process.env.WDG_BIOMETRIA_ENABLED === '1' && !isTest;

function createHidStub() {
	class HIDDeviceStub {
		on() { return this; }
		close() {}
		getFeatureReport() { return Buffer.alloc(0); }
		sendFeatureReport() { return 0; }
	}
	return {
		devices: () => [],
		HID: HIDDeviceStub,
	};
}

let HID;
(async () => {
	try {
		if (!biometriaEnabled) {
			HID = createHidStub();
			return;
		}
		const hidModule = await import('node-hid');
		HID = hidModule.default || hidModule;
		if (!isTest) console.log('[BIOMETRIA] node-hid carregado (modular).');
		try {
			const _devs = HID.devices();
			if (!isTest) {
				console.log(`[BIOMETRIA] Dispositivos detectados ao iniciar (${_devs.length}):`);
				_devs.forEach(d => console.log('  -', `VID=0x${(d.vendorId||0).toString(16).padStart(4,'0')}`, `PID=0x${(d.productId||0).toString(16).padStart(4,'0')}`, (d.product||'')));
			}
		} catch (e) {
			if (!isTest) console.warn('[BIOMETRIA] Falha listando dispositivos no startup (modular):', e.message);
		}
	} catch (e) {
		if (!isTest) console.warn('[BIOMETRIA] node-hid não disponível (modular):', e.message);
	}
})();
function listarDispositivos(){ if(!biometriaEnabled || !HID || typeof HID.devices !== 'function') return []; try { return HID.devices().map(d=>({ vendorId:d.vendorId, productId:d.productId, path:d.path, product:d.product||'', manufacturer:d.manufacturer||'', usagePage:d.usagePage, usage:d.usage })); } catch(e){ if(!isTest) console.error('[BIOMETRIA] erro listando', e); return []; } }
function readDispositivosCore(){ return listarDispositivos(); }
export function listarDispositivosApi(req,res){ return ok(res, readDispositivosCore()); }
function normId(v){ if(v===undefined||v===null||v==='') return null; if(typeof v==='string'){ v=v.trim(); if(/^0x/i.test(v)) return parseInt(v,16); } return parseInt(v,10); }
const runCapturaBiometriaCore = createRunCapturaBiometriaCore({
	listDevices: listarDispositivos,
	openDevice: (devicePath) => new HID.HID(devicePath),
	isTest,
});
const runDiagnosticoBiometriaCore = createRunDiagnosticoBiometriaCore({
	listDevices: listarDispositivos,
	openDevice: (devicePath) => new HID.HID(devicePath),
	platform: process.platform,
});
const runSniffBiometriaCore = createRunSniffBiometriaCore({
	listDevices: listarDispositivos,
	openDevice: (devicePath) => new HID.HID(devicePath),
	isTest,
});
export async function capturarBiometria(req,res){
	if (!biometriaEnabled) {
		return res.status(503).json({ error: 'Biometria desabilitada no servidor', code: 'BIOMETRIA_DISABLED' });
	}
	if(!HID) {
		return badRequest(res,'node-hid ausente no servidor');
	}
	let { vendorId, productId, path: devPath, timeoutMs=5000, minBytes=32, maxBytes=2048, poke=false, handshakeStrategy='basic', handshakeReports=[] } = req.body || {}; vendorId=normId(vendorId); productId=normId(productId); timeoutMs=parseInt(timeoutMs,10)||5000; minBytes=parseInt(minBytes,10)||32; maxBytes=parseInt(maxBytes,10)||2048; const payload = await runCapturaBiometriaCore({ vendorId, productId, devPath, timeoutMs, minBytes, maxBytes, poke, handshakeStrategy, handshakeReports }); if(!payload || !payload.error) return res.json(payload); const statusCode = payload.error==='Dispositivo não encontrado no servidor'?404:payload.error==='Timeout sem dados'?504:500; return res.status(statusCode).json(payload); }
export async function sniffBiometria(req,res){
	if (!biometriaEnabled) {
		return res.status(503).json({ error: 'Biometria desabilitada no servidor', code: 'BIOMETRIA_DISABLED' });
	}
	if(!HID) {
		return badRequest(res,'node-hid ausente');
	}
	let { vendorId, productId, path: devPath, durationMs=5000, poke=true, handshakeStrategy='basic', handshakeReports=[] } = req.body || {}; vendorId=normId(vendorId); productId=normId(productId); durationMs=parseInt(durationMs,10)||5000; const payload = await runSniffBiometriaCore({ vendorId, productId, devPath, durationMs, poke, handshakeStrategy, handshakeReports }); if(!payload || !payload.error) return res.json(payload); if(payload.error === 'Dispositivo não encontrado') return notFound(res,'Dispositivo não encontrado'); return res.status(500).json(payload); }
export function diagnosticoBiometria(req,res){
	if (!biometriaEnabled) {
		return ok(res, {
			sistema: process.platform,
			qtd: 0,
			resultados: [],
			disabled: true
		});
	}
	if(!HID) {
		return badRequest(res,'node-hid ausente');
	}
	return ok(res, runDiagnosticoBiometriaCore()); }
