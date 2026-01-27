// validators.js - Funções utilitárias de validação e máscaras
(function(){
  const Validators = {};
  // CNPJ
  function formatarCNPJInput(valor){ try { const dig=String(valor||'').replace(/\D/g,'').slice(0,14); if(dig.length!==14) return valor||''; return dig.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,'$1.$2.$3/$4-$5'); } catch(_){ return valor||''; } }
  function aplicarMascaraCNPJInput(el){ if(!el) return; const dig=String(el.value||'').replace(/\D/g,'').slice(0,14); let out=dig; if(dig.length>12) out=dig.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{0,2}).*/, '$1.$2.$3/$4-$5'); else if(dig.length>8) out=dig.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4}).*/,'$1.$2.$3/$4'); else if(dig.length>5) out=dig.replace(/^(\d{2})(\d{3})(\d{0,3}).*/, '$1.$2.$3'); else if(dig.length>2) out=dig.replace(/^(\d{2})(\d{0,3}).*/, '$1.$2'); el.value=out; }
  function validarCNPJValor(valor){ if(!valor) return false; const cnpj=valor.replace(/\D/g,''); if(cnpj.length!==14) return false; if(/^(\d)\1{13}$/.test(cnpj)) return false; const calc=(base)=>{ let soma=0,pos=base.length-7; for(let i=0;i<base.length;i++){ soma+=parseInt(base[i],10)*pos--; if(pos<2) pos=9;} const r=soma%11; return r<2?0:11-r; }; const b12=cnpj.slice(0,12); const d13=calc(b12); if(d13!==parseInt(cnpj[12],10)) return false; const d14=calc(b12+d13); return d14===parseInt(cnpj[13],10); }
  function marcarCNPJInvalido(el,invalido){ if(!el) return; if(invalido) el.classList.add('is-invalid'); else el.classList.remove('is-invalid'); }
  // CPF
  function validarCPFValor(valor){ if(!valor) return false; const cpf=valor.replace(/\D/g,''); if(cpf.length!==11) return false; if(/^(\d)\1{10}$/.test(cpf)) return false; const calc=(base,f)=>{ let soma=0; for(let i=0;i<base.length;i++) soma+=parseInt(base[i],10)*(f-i); const mod=soma%11; return mod<2?0:11-mod; }; const d1=calc(cpf.slice(0,9),10); if(d1!==parseInt(cpf[9],10)) return false; const d2=calc(cpf.slice(0,10),11); return d2===parseInt(cpf[10],10); }
  // Telefone
  function aplicarMascaraTelefone(el){
    if(!el) return;
    const digits = String(el.value||'').replace(/\D/g,'');
    let dig = digits.slice(0,11); // limite geral
    // Formatos especiais 0800 / 0300 / 0500 / 0900 / 4004 etc (serviços / call-center)
    // Regra: se iniciar com 0 e tiver pelo menos 4 dígitos, aplicar padrão XXXX-XXX-XXXX
    if(/^0\d{3}/.test(dig)){
      if(dig.length<=4){ el.value = dig; return; }
      if(dig.length<=7){ el.value = dig.slice(0,4)+'-'+dig.slice(4); return; }
      // 4 + 3 + até 4
      const bloco2 = dig.slice(4,7);
      const bloco3 = dig.slice(7,11);
      el.value = dig.slice(0,4)+'-'+bloco2+(bloco3?('-'+bloco3):'');
      return;
    }
    // Formato comum nacional com DDD (fixo ou móvel)
    let out = dig;
    if(dig.length>10) out=dig.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
    else if(dig.length>6) out=dig.replace(/^(\d{2})(\d{4})(\d{0,4}).*/, '($1) $2-$3');
    else if(dig.length>2) out=dig.replace(/^(\d{2})(\d{0,4}).*/, '($1) $2');
    el.value = out;
  }
  // Telefone (validação)
  function validarTelefoneValor(valor){ const dig=String(valor||'').replace(/\D/g,''); if(!dig) return false; return dig.length===10 || dig.length===11; }
  // Email
  function validarEmailValor(v){ const val=String(v||'').trim(); return !val || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val); }
  // Endereço → UF
  function extrairUFDoEndereco(enderecoStr){ try { const s=String(enderecoStr||'').toUpperCase(); const dash=s.match(/-\s*([A-Z]{2})\b/); if(dash&&dash[1]) return dash[1]; const ufMatch=s.match(/\b([A-Z]{2})\b(?![\s\S]*\b[A-Z]{2}\b)/); return ufMatch?ufMatch[1]:''; } catch(_){ return ''; } }
  // IE por UF (formato básico)
  function validarIEPorUF(ieRaw, ufRaw){ const ieVal=String(ieRaw||'').trim().toUpperCase(); const uf=String(ufRaw||'').trim().toUpperCase(); if(!ieVal) return true; if(ieVal==='ISENTO'||ieVal==='ISENTA') return true; const temPrefixoP=uf==='SP'&&ieVal.startsWith('P'); const somente=ieVal.replace(/\D/g,''); const MAP={AC:[13],AL:[9],AP:[9],AM:[9],BA:[8,9],CE:[9],DF:[13],ES:[9],GO:[9],MA:[9],MT:[11],MS:[9],MG:[13],PA:[9],PB:[9],PR:[10],PE:[14],PI:[9],RJ:[8],RN:[9,10],RS:[10],RO:[9,14],RR:[9],SC:[9],SP:[12],SE:[9],TO:[9,11]}; if(!MAP[uf]) return /^\d+$/.test(somente); if(temPrefixoP) return somente.length===12; return MAP[uf].some(t=>somente.length===t); }
  function marcarCampoIE(inputEl,valido,uf){ if(!inputEl) return; if(valido){ inputEl.classList.remove('is-invalid'); inputEl.style.borderColor=''; inputEl.title=''; } else { inputEl.classList.add('is-invalid'); inputEl.style.borderColor='red'; inputEl.title=uf?`Inscrição Estadual inválida para ${uf}`:'Inscrição Estadual inválida'; } }
  // Expor
  Validators.formatarCNPJInput=formatarCNPJInput; Validators.validarCNPJValor=validarCNPJValor; Validators.marcarCNPJInvalido=marcarCNPJInvalido; Validators.validarCPFValor=validarCPFValor; Validators.aplicarMascaraTelefone=aplicarMascaraTelefone; Validators.validarTelefoneValor=validarTelefoneValor; Validators.validarEmailValor=validarEmailValor; Validators.extrairUFDoEndereco=extrairUFDoEndereco; Validators.validarIEPorUF=validarIEPorUF; Validators.marcarCampoIE=marcarCampoIE; Validators.aplicarMascaraCNPJInput=aplicarMascaraCNPJInput;
  window.Validators = Validators;
  console.debug('[validators] carregado');
})();
