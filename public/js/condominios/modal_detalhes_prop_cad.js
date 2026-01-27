'use strict';
(function(){
  const modalEl = document.getElementById('modalDetalhesProprietario');
  if(!modalEl) return;
  const bsModal = () => new bootstrap.Modal(modalEl);
  const basePath = (document.body.getAttribute('data-base-path') || '/condominios').replace(/\/$/, '');

  function safeJSON(id, fb){ try{ const el=document.getElementById(id); return el? JSON.parse(el.textContent||'[]') : fb; }catch{ return fb; } }
  const unidades = safeJSON('unidadesData', []);
  function unidadeRotulo(id){ const u = (unidades||[]).find(x=> String(x._id)===String(id)); return u? (u.codigo? (u.codigo+' - '+u.nome): u.nome) : String(id||''); }

  async function fetchProprietarios(){
    try{
      const res = await fetch(basePath + '/api/proprietarios/busca?_ts='+Date.now(), { cache:'no-store' });
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      return Array.isArray(data)? data : [];
    }catch(_){ return []; }
  }

  window.abreDetalhesProprietario = async function(email){
    const loading=document.getElementById('propDetLoading');
    const content=document.getElementById('propDetContent');
    loading.textContent='Carregando...'; loading.classList.remove('d-none'); content.classList.add('d-none');
    bsModal().show();
    const list = await fetchProprietarios();
    const u = list.find(x=> String(x.email||'').toLowerCase() === String(email||'').toLowerCase());
    if(!u){ loading.textContent='Registro não encontrado.'; return; }
    // Preencher campos
    const sexoMap = { M:'Masculino', F:'Feminino', O:'Outro', N:'Não informado', '':'Não informado' };
    document.getElementById('detPropEmail').textContent = u.email || '';
    document.getElementById('detPropNome').textContent = u.nome || '';
    document.getElementById('detPropRg').textContent = u.rg || '-';
    document.getElementById('detPropCpf').textContent = formatCPF(u.cpf)||'-';
    const nasc = u.data_nascimento || '';
    document.getElementById('detPropNasc').textContent = formatDateBR(nasc)||'-';
    document.getElementById('detPropIdade').textContent = calcIdade(parseDateBRorISO(nasc)) ?? '-';
    document.getElementById('detPropSexo').textContent = sexoMap[String(u.sexo||'').toUpperCase()] || 'Não informado';
    document.getElementById('detPropTelefone').textContent = formatPhoneBR(u.telefone || u.contato_telefone || '');
    document.getElementById('detPropWhatsapp').textContent = u.whatsapp ? 'Sim' : 'Não';
    document.getElementById('detPropPai').textContent = u.pai || '-';
    document.getElementById('detPropMae').textContent = u.mae || '-';
    document.getElementById('detPropHabs').innerHTML = montarListaHabs(u.vinculos||[]);
    loading.classList.add('d-none'); content.classList.remove('d-none');
  };

  function formatCPF(v){ if(!v) return ''; const d=String(v).replace(/\D/g,''); if(d.length!==11) return v; return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`; }
  function parseDateBRorISO(s){ if(!s) return null; s=String(s).trim(); var m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(m){ var d=new Date(+m[3],+m[2]-1,+m[1]); return isNaN(d)?null:d; } var d2=new Date(s); return isNaN(d2)?null:d2; }
  function calcIdade(d){ if(!d) return null; var t=new Date(); var a=t.getFullYear()-d.getFullYear(); var m=t.getMonth()-d.getMonth(); if(m<0||(m===0&&t.getDate()<d.getDate())) a--; return a; }
  function formatDateBR(d){ if(!d) return ''; try{ const dt = (d instanceof Date)? d : new Date(d); if(isNaN(dt)) return String(d); const dd = String(dt.getDate()).padStart(2,'0'); const mm = String(dt.getMonth()+1).padStart(2,'0'); const yy = String(dt.getFullYear()); return `${dd}/${mm}/${yy}`; }catch(_){ return String(d||''); } }
  function formatPhoneBR(d){ const s=String(d||'').replace(/\D/g,''); if(!s) return ''; if(s.length<=2) return s; if(s.length<=6) return `(${s.slice(0,2)}) ${s.slice(2)}`; if(s.length<=10) return `(${s.slice(0,2)}) ${s.slice(2,6)}-${s.slice(6)}`; return `(${s.slice(0,2)}) ${s.slice(2,7)}-${s.slice(7,11)}`; }
  function montarListaHabs(vinculos){
    const html = (vinculos||[]).map(v=>{
      const unidade = unidadeRotulo(v.unidade_id);
      const label = v.hab_label || ('#'+String(v.habitacao_id||''));
      const isProp = (v.proprietario===true) || (v.proprietario==null && (v.morador===false || v.morador==='N'));
      const isMor = v.morador===true || v.morador==='S' || v.morador===1 || v.morador==='1';
      let tag=''; if(isProp && isMor) tag=' (proprietário / morador)'; else if(isProp) tag=' (proprietário)'; else if(isMor) tag=' (morador)';
      return (unidade? (unidade+' - ') : '') + label + tag;
    }).join('<br>');
    return html || '-';
  }
})();