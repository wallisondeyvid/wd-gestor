import { ok, notFound, serverError, badRequest } from '#core/utils/apiResponse.js';
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
export async function capturarBiometria(req,res){
	if (!biometriaEnabled) {
		return res.status(503).json({ error: 'Biometria desabilitada no servidor', code: 'BIOMETRIA_DISABLED' });
	}
	if(!HID) {
		return badRequest(res,'node-hid ausente no servidor');
	}
	let { vendorId, productId, path: devPath, timeoutMs=5000, minBytes=32, maxBytes=2048, poke=false, handshakeStrategy='basic', handshakeReports=[] } = req.body || {}; vendorId=normId(vendorId); productId=normId(productId); timeoutMs=parseInt(timeoutMs,10)||5000; minBytes=parseInt(minBytes,10)||32; maxBytes=parseInt(maxBytes,10)||2048; const lista = listarDispositivos(); let devInfo=null; if(devPath) devInfo=lista.find(d=>d.path===devPath); if(!devInfo && vendorId!=null && productId!=null) devInfo=lista.find(d=>d.vendorId===vendorId && d.productId===productId); if(!devInfo){ if(!isTest) console.warn('[BIOMETRIA] Dispositivo não encontrado', { vendorId, productId, devPath }); return res.status(404).json({ error:'Dispositivo não encontrado no servidor', vendorId, productId }); } let device; try { device = new HID.HID(devInfo.path); } catch(e){ if(!isTest) console.error('[BIOMETRIA] Falha abrir dispositivo (primeira tentativa)', { msg:e.message, path:devInfo.path, vendorId:devInfo.vendorId, productId:devInfo.productId }); const alternates = lista.filter(d=> d.vendorId===devInfo.vendorId && d.productId===devInfo.productId && d.path!==devInfo.path).slice(0,3); const attempted=[devInfo.path]; let opened=null; let lastErr=e; for(const alt of alternates){ try { attempted.push(alt.path); opened=new HID.HID(alt.path); if(!isTest) console.log('[BIOMETRIA] Dispositivo aberto via fallback path', alt.path); device=opened; break; } catch(er){ lastErr=er; if(!isTest) console.warn('[BIOMETRIA] Falha fallback path', alt.path, er.message); } } if(!device){ return res.status(500).json({ error:'Falha ao abrir dispositivo', code:'HID_OPEN_FAILED', detail:lastErr.message, vendorId:devInfo.vendorId, productId:devInfo.productId, attemptedPaths:attempted }); } } const chunks=[]; let resolved=false; const started=Date.now(); function finalizar(ok,payload){ if(resolved) return; resolved=true; try { device.close(); } catch(_){ } payload.durationMs = Date.now()-started; if(ok) return res.json(payload); const statusCode = payload.error==='Timeout sem dados'?504:500; return res.status(statusCode).json(payload); } device.on('data', data=>{ try { const arr=Array.from(data); chunks.push(...arr); if(chunks.length >= maxBytes){ const hexMax = chunks.slice(0,maxBytes).map(b=>b.toString(16).padStart(2,'0')).join(''); if(!isTest) console.log('[BIOMETRIA] Captura truncada (atingiu maxBytes)', { bytes: maxBytes }); return finalizar(true,{ template: hexMax, bytes: maxBytes, truncated:true }); } if(chunks.length >= minBytes){ const hex = chunks.map(b=>b.toString(16).padStart(2,'0')).join(''); if(!isTest) console.log('[BIOMETRIA] Captura concluída', { bytes: chunks.length }); return finalizar(true,{ template: hex, bytes: chunks.length }); } } catch(e){ if(!isTest) console.error('[BIOMETRIA] Erro processando dados', e); finalizar(false,{ error:'Erro processando dados', code:'HID_DATA_PROCESSING', detail:e.message }); } }); device.on('error', err=>{ if(!isTest) console.error('[BIOMETRIA] Evento erro HID', err.message); finalizar(false,{ error:'Erro HID', code:'HID_EVENT_ERROR', detail:err.message }); }); if(poke){ try { if(handshakeStrategy==='basic'){ for(let rid=0; rid<=5; rid++){ try { device.getFeatureReport(rid,64); } catch(_){ } try { const buf = Buffer.alloc(16); buf[0]=rid; device.sendFeatureReport([...buf]); } catch(_){ } } } if(Array.isArray(handshakeReports)){ handshakeReports.forEach(hexStr=>{ try { const clean=(hexStr||'').replace(/[^0-9a-fA-F]/g,''); if(!clean.length) return; const bytes=[]; for(let i=0;i<clean.length;i+=2){ bytes.push(parseInt(clean.slice(i,i+2),16)); } if(bytes.length) device.sendFeatureReport(bytes); } catch(e){ if(!isTest) console.warn('[BIOMETRIA] Falha enviar handshakeReport', e.message); } }); } } catch(e){ if(!isTest) console.warn('[BIOMETRIA] Handshake falhou', e.message); } } setTimeout(()=>{ if(!resolved){ if(chunks.length){ const hex = chunks.map(b=>b.toString(16).padStart(2,'0')).join(''); if(!isTest) console.warn('[BIOMETRIA] Timeout parcial', { bytes: chunks.length }); finalizar(true,{ template: hex, bytes: chunks.length, timeout:true }); } else { if(!isTest) console.warn('[BIOMETRIA] Timeout sem dados'); finalizar(false,{ error:'Timeout sem dados' }); } } }, timeoutMs); }
export async function sniffBiometria(req,res){
	if (!biometriaEnabled) {
		return res.status(503).json({ error: 'Biometria desabilitada no servidor', code: 'BIOMETRIA_DISABLED' });
	}
	if(!HID) {
		return badRequest(res,'node-hid ausente');
	}
	let { vendorId, productId, path: devPath, durationMs=5000, poke=true, handshakeStrategy='basic', handshakeReports=[] } = req.body || {}; vendorId=normId(vendorId); productId=normId(productId); durationMs=parseInt(durationMs,10)||5000; const lista = listarDispositivos(); let devInfo=null; if(devPath) devInfo=lista.find(d=>d.path===devPath); if(!devInfo && vendorId!=null && productId!=null) devInfo=lista.find(d=>d.vendorId===vendorId && d.productId===productId); if(!devInfo) return notFound(res,'Dispositivo não encontrado'); let device; try { device = new HID.HID(devInfo.path); } catch(e){ return res.status(500).json({ error:'Falha abrir dispositivo', detail:e.message }); } const packets=[]; const started=Date.now(); let finished=false; device.on('data', data=>{ try { packets.push(Buffer.from(data)); } catch(_){ } }); device.on('error', err=>{ if(!finished){ finished=true; try{ device.close(); }catch(_){ } return res.status(500).json({ error:'Erro HID', detail:err.message, packets:packets.length }); }}); if(poke){ try { if(handshakeStrategy==='basic'){ for(let rid=0; rid<=5; rid++){ try { device.getFeatureReport(rid,64); } catch(_){ } try { const buf = Buffer.alloc(16); buf[0]=rid; device.sendFeatureReport([...buf]); } catch(_){ } } } if(Array.isArray(handshakeReports)){ handshakeReports.forEach(hexStr=>{ try { const clean=(hexStr||'').replace(/[^0-9a-fA-F]/g,''); if(!clean.length) return; const bytes=[]; for(let i=0;i<clean.length;i+=2){ bytes.push(parseInt(clean.slice(i,i+2),16)); } if(bytes.length) device.sendFeatureReport(bytes); } catch(e){ if(!isTest) console.warn('[BIOMETRIA] Sniff handshakeReport falhou', e.message); } }); } } catch(e){ if(!isTest) console.warn('[BIOMETRIA] Sniff handshake falhou', e.message); } } setTimeout(()=>{ if(finished) return; finished=true; try { device.close(); } catch(_){ } const concat = Buffer.concat(packets); const hex = concat.length? concat.toString('hex'):''; res.json({ bytes: concat.length, packets: packets.length, dataHex: hex, durationMs: Date.now()-started, vendorId: devInfo.vendorId, productId: devInfo.productId }); }, durationMs); }
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
	const devices = listarDispositivos(); const resultados = devices.map(d=>{ const info={ vendorId:d.vendorId, productId:d.productId, path:d.path, product:d.product||'', manufacturer:d.manufacturer||'', usagePage:d.usagePage, usage:d.usage }; const lower=(info.product+' '+info.manufacturer).toLowerCase(); if(/hidi2c|intel|synaptics|goodix|validity|windows hello/.test(lower)) info.possivelIntegrado=true; else info.possivelIntegrado=false; try { const dev=new HID.HID(d.path); dev.close(); info.opened=true; info.error=null; } catch(e){ info.opened=false; info.error=e.message; if(/access|denied|permission/i.test(e.message)) info.sugestao='Executar servidor como administrador ou dispositivo bloqueado pelo Windows Biometric Framework (integrado).'; else if(/cannot open device with path/i.test(e.message)) info.sugestao='Dispositivo monopolizado por outro driver (ex: Windows Hello).'; } return info; }); return ok(res, { sistema:process.platform, qtd:devices.length, resultados }); }
