// Migrated from public/js/validators.js
(function(){
	const Validators = {};
	function formatarCNPJInput(valor){ try { const dig=String(valor||'').replace(/\D/g,'').slice(0,14); if(dig.length!==14) return valor||''; return dig.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'); } catch(_){ return valor||''; } }
	function aplicarMascaraCNPJInput(el){ if(!el) return; const dig=String(el.value||'').replace(/\D/g,'').slice(0,14); let out=dig; if(dig.length>12) out=dig.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/, '$1.$2.$3/$4-$5'); else if(dig.length>8) out=dig.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4}).*/,'$1.$2.$3/$4'); else if(dig.length>5) out=dig.replace(/^(\d{2})(\d{3})(\d{0,3}).*/, '$1.$2.$3'); else if(dig.length>2) out=dig.replace(/^(\d{2})(\d{0,3}).*/, '$1.$2'); el.value=out; }
	function validarCNPJValor(valor){ if(!valor) return false; const cnpj=valor.replace(/\D/g,''); if(cnpj.length!==14) return false; if(/^(\d)\1{13}$/.test(cnpj)) return false; const calc=(base)=>{ let soma=0,pos=base.length-7; for(let i=0;i<base.length;i++){ soma+=parseInt(base[i],10)*pos--; if(pos<2) pos=9;} const r=soma%11; return r<2?0:11-r; }; const b12=cnpj.slice(0,12); const d13=calc(b12); if(d13!==parseInt(cnpj[12],10)) return false; const d14=calc(b12+d13); return d14===parseInt(cnpj[13],10); }
	function marcarCNPJInvalido(el,invalido){ if(!el) return; if(invalido) el.classList.add('is-invalid'); else el.classList.remove('is-invalid'); }
	function validarCPFValor(valor){ if(!valor) return false; const cpf=valor.replace(/\D/g,''); if(cpf.length!==11) return false; if(/^(\d)\1{10}$/.test(cpf)) return false; const calc=(base,f)=>{ let soma=0; for(let i=0;i<base.length;i++) soma+=parseInt(base[i],10)*(f-i); const mod=soma%11; return mod<2?0:11-mod; }; const d1=calc(cpf.slice(0,9),10); if(d1!==parseInt(cpf[9],10)) return false; const d2=calc(cpf.slice(0,10),11); return d2===parseInt(cpf[10],10); }
	function aplicarMascaraTelefone(el){ if(!el) return; const dig=String(el.value||'').replace(/\D/g,'').slice(0,11); let out=dig; if(dig.length>10) out=dig.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3'); else if(dig.length>6) out=dig.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3'); else if(dig.length>2) out=dig.replace(/^(\d{2})(\d{0,4}).*/, '($1) $2'); el.value=out; }
	function validarEmailValor(v){ const val=String(v||'').trim(); return !val || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val); }
	function extrairUFDoEndereco(enderecoStr){ try { const s=String(enderecoStr||'').toUpperCase(); const dash=s.match(/-\s*([A-Z]{2})\b/); if(dash&&dash[1]) return dash[1]; const ufMatch=s.match(/\b([A-Z]{2})\b(?![\s\S]*\b[A-Z]{2}\b)/); return ufMatch?ufMatch[1]:''; } catch(_){ return ''; } }
	function validarIEPorUF(ieRaw, ufRaw){ const ieVal=String(ieRaw||'').trim().toUpperCase(); const uf=String(ufRaw||'').trim().toUpperCase(); if(!ieVal) return true; if(ieVal==='ISENTO'||ieVal==='ISENTA') return true; const temPrefixoP=uf==='SP'&&ieVal.startsWith('P'); const somente=ieVal.replace(/\D/g,''); const MAP={AC:[13],AL:[9],AP:[9],AM:[9],BA:[8,9],CE:[9],DF:[13],ES:[9],GO:[9],MA:[9],MT:[11],MS:[9],MG:[13],PA:[9],PB:[9],PR:[10],PE:[14],PI:[9],RJ:[8],RN:[9,10],RS:[10],RO:[9,14],RR:[9],SC:[9],SP:[12],SE:[9],TO:[9,11]}; if(!MAP[uf]) return /^\d+$/.test(somente); if(temPrefixoP) return somente.length===12; return MAP[uf].some(t=>somente.length===t); }

	// IE: Formatação por UF (máscara) — cobre todos os estados e DF com padrões mais comuns
	function formatarIEPorUF(ieRaw, ufRaw){
		try{
			let v = String(ieRaw||'').toUpperCase();
			const uf = String(ufRaw||'').toUpperCase();
			if(!v) return '';
			if(v==='ISENTO'||v==='ISENTA') return v;
			const temPrefixoP = uf==='SP' && v.startsWith('P');
			const digits = v.replace(/\D/g,'');
			if(!digits) return temPrefixoP ? 'P' : '';

			// Helper para aplicar padrão [n, sep, n, sep, ...]
			const applyPattern = (ds, pattern) => {
				let i=0, out='';
				for (const p of pattern){
					if (typeof p === 'number') { out += ds.slice(i, i+p); i += p; }
					else out += p;
				}
				// anexar resto (se sobrar)
				if (i < ds.length) out += ds.slice(i);
				return out;
			};

			// Padrões por UF (mais usuais)
			const P = {
				AC: (d)=>applyPattern(d, [2,'.',3,'.',3,'/',3,'-',2]), // 13
				AL: (d)=>applyPattern(d, [2,'.',3,'.',3,'-',1]), // 9
				AP: (d)=>applyPattern(d, [2,'.',3,'.',3,'-',1]), // 9
				AM: (d)=>applyPattern(d, [2,'.',3,'.',3,'-',1]), // 9
				BA: (d)=> d.length===8 ? applyPattern(d,[6,'-',2]) : applyPattern(d,[7,'-',2]), // 8/9
				CE: (d)=>applyPattern(d, [2,'.',3,'.',3,'-',1]), // 9
				DF: (d)=>applyPattern(d, [2,'.',6,'.',3,'-',4]), // 13
				ES: (d)=>applyPattern(d, [3,'.',5,'-',2]), // 9
				GO: (d)=>applyPattern(d, [2,'.',3,'.',3,'-',1]), // 9
				MA: (d)=>applyPattern(d, [2,'.',3,'.',3,'-',1]), // 9
				MT: (d)=>applyPattern(d, [11,'-',1]), // 12 (11+DV)
				MS: (d)=>applyPattern(d, [2,'.',3,'.',3,'-',1]), // 9
				MG: (d)=>applyPattern(d, [3,'.',3,'.',3,'/',4]), // 13
				PA: (d)=>applyPattern(d, [2,'-',6,'-',1]), // 9
				PB: (d)=>applyPattern(d, [2,'.',3,'.',3,'-',1]), // 9
				PR: (d)=>applyPattern(d, [8,'-',2]), // 10
				PE: (d)=>applyPattern(d, [2,'.',3,'.',3,'.',4,'-',2]), // 14
				PI: (d)=>applyPattern(d, [2,'.',3,'.',3,'-',1]), // 9
				RJ: (d)=>applyPattern(d, [2,'.',3,'.',2,'-',1]), // 8
				RN: (d)=> d.length===10 ? applyPattern(d,[3,'.',3,'.',3,'-',1]) : applyPattern(d,[2,'.',3,'.',3,'-',1]), // 9/10
				RS: (d)=>applyPattern(d, [3,'/',7]), // 10
				RO: (d)=> d.length===14 ? applyPattern(d,[13,'-',1]) : applyPattern(d,[3,'.',5,'-',1]), // 9/14
				RR: (d)=>applyPattern(d, [8,'-',1]), // 9
				SC: (d)=>applyPattern(d, [3,'.',3,'.',3]), // 9
				SP: (d)=>applyPattern(d, [3,'.',3,'.',3,'.',3]), // 12; P- (produtor) tratado abaixo
				SE: (d)=>applyPattern(d, [8,'-',1]), // 9
				TO: (d)=> d.length===11 ? applyPattern(d,[2,'.',2,'.',6,'-',1]) : applyPattern(d,[8,'-',1]) // 9/11
			};

			let formatted;
			if (temPrefixoP) {
				// Mantém prefixo 'P-' e aplica padrão de 12 dígitos simples
				formatted = 'P-' + applyPattern(digits.slice(0,12), [3,'.',3,'.',3,'.',3]);
			} else if (P[uf]) {
				formatted = P[uf](digits);
			} else {
				// fallback genérico por tamanho
				switch(digits.length){
					case 8: formatted = applyPattern(digits,[2,'.',3,'.',2,'-',1]); break;
					case 9: formatted = applyPattern(digits,[2,'.',3,'.',3,'-',1]); break;
					case 10: formatted = applyPattern(digits,[3,'.',3,'.',3,'-',1]); break;
					case 12: formatted = applyPattern(digits,[3,'.',3,'.',3,'.',3]); break;
					case 13: formatted = applyPattern(digits,[2,'.',6,'.',3,'-',2]); break;
					case 14: formatted = applyPattern(digits,[2,'.',3,'.',3,'.',4,'-',2]); break;
					default: formatted = digits; break;
				}
			}
			return formatted;
		} catch(_){ return String(ieRaw||''); }
	}

	function aplicarMascaraIEInput(inputEl, ufRaw){ if(!inputEl) return; const uf=String(ufRaw||'').toUpperCase(); const cur=inputEl.value; const novo = formatarIEPorUF(cur, uf); if (typeof novo === 'string' && novo !== cur) inputEl.value = novo; }
	function marcarCampoIE(inputEl,valido,uf){ if(!inputEl) return; if(valido){ inputEl.classList.remove('is-invalid'); inputEl.style.borderColor=''; inputEl.title=''; } else { inputEl.classList.add('is-invalid'); inputEl.style.borderColor='red'; inputEl.title=uf?`Inscrição Estadual inválida para ${uf}`:'Inscrição Estadual inválida'; } }
	Validators.formatarCNPJInput=formatarCNPJInput; Validators.validarCNPJValor=validarCNPJValor; Validators.marcarCNPJInvalido=marcarCNPJInvalido; Validators.validarCPFValor=validarCPFValor; Validators.aplicarMascaraTelefone=aplicarMascaraTelefone; Validators.validarEmailValor=validarEmailValor; Validators.extrairUFDoEndereco=extrairUFDoEndereco; Validators.validarIEPorUF=validarIEPorUF; Validators.marcarCampoIE=marcarCampoIE; Validators.aplicarMascaraCNPJInput=aplicarMascaraCNPJInput; Validators.formatarIEPorUF=formatarIEPorUF; Validators.aplicarMascaraIEInput=aplicarMascaraIEInput;
	window.Validators = Validators;
	console.debug('[validators] carregado');
})();
