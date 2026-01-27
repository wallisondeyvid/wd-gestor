(function(){
  function $(id){ return document.getElementById(id); }
  function pad(n){ return String(n).padStart(2,'0'); }
  function parseHora(h){
    h=(h||'').trim();
    if(!h.includes(':')) return null;
    const p=h.split(':');
    if(p.length!==2) return null;
    let HH=p[0].replace(/\D/g,'');
    let MM=p[1].replace(/\D/g,'');
    if(HH===''||MM===''||HH.length>2||MM.length>2) return null;
    HH=parseInt(HH,10); MM=parseInt(MM,10);
    if(isNaN(HH)||isNaN(MM)||HH>23||MM>59) return null;
    return pad(HH)+':'+pad(MM);
  }
  const initTag=document.getElementById('initData');
  let initData={};
  try { if(initTag) initData=JSON.parse(initTag.textContent||'{}'); } catch(_){ initData={}; }
  const turnos=Array.isArray(initData.turnos)? initData.turnos.map(t=>({ ini:t.ini, fim:t.fim, overnight: !!t.overnight })) : [];
  const tbody=document.querySelector('#tabelaTurnos tbody');

  function render(){
    if(!turnos.length){
      tbody.innerHTML='<tr><td colspan="2" class="text-muted" style="font-size:11px;">Nenhum turno ainda</td></tr>';
      return;
    }
    tbody.innerHTML=turnos.map((t,i)=>{
      const flag=t.overnight?' <span style="color:#c53030;font-size:10px;">(+1d)</span>':'';
      return `<tr><td><strong>${t.ini}</strong> - <strong>${t.fim}</strong>${flag}</td><td><button data-del="${i}" class="btn btn-danger btn-small">Remover</button></td></tr>`;
    }).join('');
    tbody.querySelectorAll('[data-del]').forEach(btn=> btn.addEventListener('click', ()=>{
      const idx=parseInt(btn.getAttribute('data-del'),10);
      turnos.splice(idx,1);
      render();
    }));
  }

  function addTurno(){
    const ini=parseHora($('horaIni').value);
    const fim=parseHora($('horaFim').value);
    if(!ini||!fim) return alert('Use formato HH:MM 24h.');
    if(turnos.some(t=> t.ini===ini && t.fim===fim)) return alert('Turno repetido.');
    const overnight=fim<=ini;
    turnos.push({ ini,fim,overnight });
    turnos.sort((a,b)=> a.ini.localeCompare(b.ini));
    $('horaIni').value=''; $('horaFim').value='';
    render();
  }

  $('btnAdd')?.addEventListener('click', addTurno);
  $('btnSalvar')?.addEventListener('click', ()=>{
    if(!turnos.length) return alert('Adicione ao menos um turno.');
    if(window.opener){
      window.opener.postMessage({ type:'TURNOS_GRUPO_SALVO', payload:{ id:initData.id||null, turnos } }, '*');
    }
    window.close();
  });
  $('btnCancelar')?.addEventListener('click', ()=> window.close());
  render();
})();
