// Migrado de public/js/modals/orgao_expedidor.js (refatorado v4 multi-path)
(() => {
	'use strict';
	console.debug('[orgao_expedidor] versão v4 carregando');

	const norm = (s='') => s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();

	const fetchGestorJson = async (nome) => { const r = await window.wdgFetchGestorJson?.(nome); return r && r.ok ? r.data : null; };

	async function loadData(){
		// múltiplas variantes de nome de arquivo
		const variants=[
			'orgaos_expedidor.json',
			'orgaos_expedidores.json',
			'orgao_expedidor.json',
			'orgaos_emissor_rg.json'
		];
		for(const v of variants){
			const data = await fetchGestorJson(v);
			if(data){
				try {
					if(Array.isArray(data)) return data.map(x=>({ codigo: String(x.codigo ?? x.sigla ?? '').trim(), nome: String(x.nome ?? x.descricao ?? '').trim() })).filter(x=>x.codigo||x.nome);
					if(typeof data==='object') return Object.entries(data).map(([codigo,nome])=>({ codigo:String(codigo).trim(), nome:String(nome).trim() }));
				} catch(e){ console.warn('[orgao_expedidor] normalização falhou', e.message); }
			}
		}
		return [];
	}

	function cleanBackdrops(){ document.querySelectorAll('.modal-backdrop').forEach(b=>b.remove()); document.body.classList.remove('modal-open'); document.body.style.removeProperty('overflow'); document.body.style.removeProperty('paddingRight'); }
	function ensureInBody(el){ if(el && el.parentElement !== document.body) document.body.appendChild(el); }
	function syncScrollbarPadding(wrapEl){ if(!wrapEl) return; const sbw=wrapEl.offsetWidth - wrapEl.clientWidth; wrapEl.style.setProperty('--sbw', sbw+'px'); }

	document.addEventListener('click', e => {
		const btn = e.target.closest('#btnAbrirModalOrgaoExpedidor, [data-bs-target="#modalOrgaoExpedidor"], [data-target="#modalOrgaoExpedidor"]');
		if(!btn) return; e.preventDefault();
		const modal=document.getElementById('modalOrgaoExpedidor'); if(!modal) return; cleanBackdrops(); ensureInBody(modal); bootstrap.Modal.getOrCreateInstance(modal).show();
	});

	document.addEventListener('DOMContentLoaded', async ()=>{
		const modal=document.getElementById('modalOrgaoExpedidor'); if(!modal) return;
		const inputBusca=modal.querySelector('#pesquisaOrgaoExpedidor');
		const wrap=modal.querySelector('#wrapOrgaos');
		const ul=modal.querySelector('#orgaosExpedidorList');
		const outroCheck=modal.querySelector('#orgaoOutroCheck');
		const outroWrap=modal.querySelector('#manualOrgaoWrap');
		const outroCod=modal.querySelector('#orgaoOutroCodigo');
		const outroNome=modal.querySelector('#orgaoOutroNome');
		const btnLimpar=modal.querySelector('#modalOrgaoExpedidorLimpar');
		const btnConf=modal.querySelector('#modalOrgaoExpedidorConfirmar');
		const destino=document.getElementById('extra_orgao_expedidor') || document.getElementById('orgao_expedidor');
		let DATA=[];

		function render(list){ ul.innerHTML=''; const frag=document.createDocumentFragment(); (list||[]).forEach((item,idx)=>{ const id=`orgExp_${idx}`; const li=document.createElement('li'); li.className='list-group-item'; li.innerHTML=`\n<div class="col-sel">\n <input type="checkbox" class="form-check-input" name="orgExpCheck" id="${id}">\n</div>\n<label for="${id}" class="mb-0 col-cod">${item.codigo}</label>\n<label for="${id}" class="mb-0 col-nom">${item.nome}</label>`; const chk=li.querySelector('input[type=checkbox]'); chk.addEventListener('change',()=>{ if(chk.checked){ ul.querySelectorAll('input[name=orgExpCheck]').forEach(o=>{ if(o!==chk) o.checked=false; }); outroCheck.checked=false; outroWrap.classList.add('d-none'); } }); li.addEventListener('click',ev=>{ if(ev.target.tagName!=='INPUT'){ chk.checked=true; chk.dispatchEvent(new Event('change')); } }); frag.appendChild(li); }); ul.appendChild(frag); syncScrollbarPadding(wrap); }

		function preselectFromField(){ const val=(destino?.value||'').trim(); if(!val) return; const m=val.match(/^\s*([A-Z0-9.-]+)\s*-\s*(.+)$/i); const code=m?.[1]?.trim(); const text=val.toLowerCase(); let targetInput=Array.from(ul.querySelectorAll('li')).find(li=>{ const cod=li.querySelector('.col-cod')?.textContent.trim(); const nom=li.querySelector('.col-nom')?.textContent.trim(); return (`${cod} - ${nom}`).toLowerCase()===text; })?.querySelector('input[type=checkbox]'); if(!targetInput && code){ targetInput=Array.from(ul.querySelectorAll('li')).find(li=> li.querySelector('.col-cod')?.textContent.trim().toLowerCase()===code.toLowerCase())?.querySelector('input[type=checkbox]'); } if(targetInput){ targetInput.checked=true; targetInput.closest('li')?.scrollIntoView({block:'nearest'}); outroCheck.checked=false; outroWrap.classList.add('d-none'); } else if(m){ outroCheck.checked=true; outroWrap.classList.remove('d-none'); outroCod.value=m[1]||''; outroNome.value=m[2]||''; } }

		modal.addEventListener('show.bs.modal', async ()=>{
			cleanBackdrops(); ensureInBody(modal);
			if(!DATA.length){ DATA = await loadData(); }
			DATA.sort((a,b)=> (a.nome||'').localeCompare(b.nome||'','pt-BR') || (a.codigo||'').localeCompare(b.codigo||''));
			render(DATA);
			inputBusca && (inputBusca.value=''); outroCheck.checked=false; outroWrap.classList.add('d-none'); outroCod.value=''; outroNome.value='';
		});
		modal.addEventListener('shown.bs.modal', ()=>{ inputBusca?.focus(); preselectFromField(); syncScrollbarPadding(wrap); });
		inputBusca?.addEventListener('input', ()=>{ const t=norm(inputBusca.value||''); const filtered = !t ? DATA : DATA.filter(o=> norm(o.codigo).includes(t) || norm(o.nome).includes(t) || norm(`${o.codigo} - ${o.nome}`).includes(t)); render(filtered); });
		outroCheck?.addEventListener('change', ()=>{ if(outroCheck.checked){ ul.querySelectorAll('input[name=orgExpCheck]').forEach(o=>o.checked=false); outroWrap.classList.remove('d-none'); outroCod.focus(); } else { outroWrap.classList.add('d-none'); outroCod.value=''; outroNome.value=''; } });
		btnLimpar?.addEventListener('click', ()=>{ inputBusca && (inputBusca.value=''); render(DATA); ul.querySelectorAll('input[name=orgExpCheck]').forEach(o=>o.checked=false); outroCheck.checked=false; outroWrap.classList.add('d-none'); outroCod.value=''; outroNome.value=''; if(destino) destino.value=''; });
		btnConf?.addEventListener('click', ()=>{ let value=''; if(outroCheck.checked){ const c=(outroCod.value||'').trim(); const n=(outroNome.value||'').trim(); if(!c||!n){ (c?outroNome:outroCod).focus(); return; } value=`${c} - ${n}`; } else { const sel=ul.querySelector('input[name=orgExpCheck]:checked'); if(sel){ const row=sel.closest('li'); const c=row.querySelector('.col-cod')?.textContent.trim()||''; const n=row.querySelector('.col-nom')?.textContent.trim()||''; value=`${c} - ${n}`; } } if(destino) destino.value=value; bootstrap.Modal.getOrCreateInstance(modal).hide(); });
		window.addEventListener('resize', ()=>syncScrollbarPadding(wrap));
	});
})();
