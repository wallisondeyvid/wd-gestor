(function(){
	const cache = {};
	function normName(name){ return String(name||'').replace(/\.json$/,'').trim(); }
	async function loadEnum(name){
		const key = normName(name);
		if(!key) throw new Error('Nome inválido para enum');
		if(cache[key]) return cache[key];
		let data = null;
		// Tenta util central se disponível
		if(window.wdgFetchGestorJson){
			try {
				const r = await window.wdgFetchGestorJson(key + '.json');
				if(r && r.ok) data = r.data;
			} catch(e){ /* ignora, cai no fallback */ }
		}
		// Fallback direto (último recurso) caso util não esteja inicializado ainda
		if(!data){
			try {
				const base = document.body.getAttribute('data-base-path') || '/gestor';
				const attempts = [ `${base}/data/${key}.json` ];
				if(base !== '/gestor') attempts.push(`/gestor/data/${key}.json`);
				attempts.push(`/data/${key}.json`);
				for(const url of attempts){
					try {
						const res = await fetch(url, { cache: 'no-store', headers:{Accept:'application/json'} });
						if(!res.ok) continue;
						const j = await res.json();
						data = j; break;
					}catch{/* continua */}
				}
			} catch {/* noop */}
		}
		if(!data) throw new Error('Falha ao carregar enum ' + key);
		cache[key] = data;
		return data;
	}
	window.Enums = { load: loadEnum, _cache: cache };
})();
