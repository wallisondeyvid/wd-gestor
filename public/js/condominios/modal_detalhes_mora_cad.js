'use strict';
(function(){
  const modalEl = document.getElementById('modalDetalhesMorador');
  if(!modalEl) return;
  const bsModal = () => new bootstrap.Modal(modalEl);
  const basePath = (document.body.getAttribute('data-base-path') || '/condominios').replace(/\/$/, '');

  function safeJSON(id, fb){ try{ const el=document.getElementById(id); return el? JSON.parse(el.textContent||'[]') : fb; }catch{ return fb; } }
  const unidades = safeJSON('unidadesData', []);
  function unidadeRotulo(id){ const u = (unidades||[]).find(x=> String(x._id)===String(id)); return u? (u.codigo? (u.codigo+' - '+u.nome): u.nome) : String(id||''); }
  function parseDateBRorISO(s){ if(!s) return null; s=String(s).trim(); var m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if(m){ var d=new Date(+m[3],+m[2]-1,+m[1]); return isNaN(d)?null:d; } var d2=new Date(s); return isNaN(d2)?null:d2; }
  function calcIdade(d){ if(!d) return null; var t=new Date(); var a=t.getFullYear()-d.getFullYear(); var m=t.getMonth()-d.getMonth(); if(m<0||(m===0&&t.getDate()<d.getDate())) a--; return a; }

  async function fetchMoradores(){
    try{
      const res = await fetch(basePath + '/api/moradores/busca?_ts='+Date.now(), { cache:'no-store' });
      if(!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      return Array.isArray(data)? data : [];
    }catch(_){ return []; }
  }

  window.abreDetalhesMorador = async function(email){
    const loading=document.getElementById('moraDetLoading');
    const content=document.getElementById('moraDetContent');
    loading.textContent='Carregando...'; loading.classList.remove('d-none'); content.classList.add('d-none');
    bsModal().show();
    const list = await fetchMoradores();
    const u = list.find(x=> String(x.email||'').toLowerCase() === String(email||'').toLowerCase());
    if(!u){ loading.textContent='Registro não encontrado.'; return; }
    const sexoMap = { M:'Masculino', F:'Feminino', O:'Outro', N:'Não informado', '':'Não informado' };
    document.getElementById('detMoraEmail').textContent = u.email || '';
    document.getElementById('detMoraNome').textContent = u.nome || '';
    document.getElementById('detMoraRg').textContent = u.rg || '-';
    document.getElementById('detMoraCpf').textContent = formatCPF(u.cpf)||'-';
    const nascStr = u.data_nascimento || u.data_nascimento_br || '';
    document.getElementById('detMoraNasc').textContent = nascStr || '-';
    const idade = calcIdade(parseDateBRorISO(nascStr));
    document.getElementById('detMoraIdade').textContent = (idade!=null? idade : '-');
    document.getElementById('detMoraSexo').textContent = sexoMap[String(u.sexo||'').toUpperCase()] || 'Não informado';
    document.getElementById('detMoraTelefone').textContent = formatPhoneBR(u.telefone||'');
    document.getElementById('detMoraWhatsapp').textContent = u.whatsapp ? 'Sim' : 'Não';
    document.getElementById('detMoraPai').textContent = u.pai || '-';
    document.getElementById('detMoraMae').textContent = u.mae || '-';
    const resp = (u.responsavel_nome||u.responsavel_email) ? `${u.responsavel_nome||''}${u.responsavel_email? ' <'+u.responsavel_email+'>':''}` : '-';
    document.getElementById('detMoraResp').textContent = resp;
    document.getElementById('detMoraHabs').innerHTML = montarListaHabs(u.vinculos||[]);
    loading.classList.add('d-none'); content.classList.remove('d-none');
  };

  function formatCPF(v){ if(!v) return ''; const d=String(v).replace(/\D/g,''); if(d.length!==11) return v; return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`; }
  function formatPhoneBR(d){ const s=String(d||'').replace(/\D/g,''); if(!s) return ''; if(s.length<=2) return s; if(s.length<=6) return `(${s.slice(0,2)}) ${s.slice(2)}`; if(s.length<=10) return `(${s.slice(0,2)}) ${s.slice(2,6)}-${s.slice(6)}`; return `(${s.slice(0,2)}) ${s.slice(2,7)}-${s.slice(7,11)}`; }
  function montarListaHabs(vinculos){
    const html = (vinculos||[]).map(v=>{
      const unidade = unidadeRotulo(v.unidade_id);
      const label = v.hab_label || ('#'+String(v.habitacao_id||''));
      const isMor = v.morador===true || v.morador==='S' || v.morador===1 || v.morador==='1';
      return (unidade? (unidade+' - ') : '') + label + (isMor? ' (morador)':'');
    }).join('<br>');
    return html || '-';
  }
})();