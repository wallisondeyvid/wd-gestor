// Módulo TurnosData: normalização e extração de grupos de turnos
(function(global){
  function toTurnos(arr){
    if(!Array.isArray(arr)) return [];
    return arr.map(t=>{
      const ini = t?.ini || t?.inicio || t?.inicioStr || t?.start || t?.hora_inicio || t?.horaInicio || t?.ini_hora || t?.inicioHora || t?.hi || '';
      const fim = t?.fim || t?.termino || t?.fimStr || t?.end || t?.hora_fim || t?.horaFim || t?.fim_hora || t?.fimHora || t?.hf || '';
      return { ini, fim };
    }).filter(t=> t.ini && t.fim && t.ini !== t.fim);
  }
  function mapGrupo(g){
    if(!g || typeof g!== 'object') return { id: undefined, turnos: [] };
    const id = g.id || g._id || g.id_grupo || g.codigo || g.codigo_grupo || g.groupId || g.gid || g.identificador || ('g'+Math.random().toString(36).slice(2,10));
    const fonteTurnos = g.turnos || g.turnos_simples || g.horarios || g.faixas || g.faixas_horarias || g.lista || g.list || g.items || [];
    return { id, turnos: toTurnos(fonteTurnos) };
  }
  function extractGruposFromPayloadMeta(d, escalaId){
    try {
      let grupos = []; let source='desconhecido';
      const fallbackId = 'g'+Math.random().toString(36).slice(2,10);
      if(d && typeof d==='object'){
        if(Array.isArray(d.grupos_turnos)){ grupos = d.grupos_turnos.map(mapGrupo); source='grupos_turnos'; }
        else if(Array.isArray(d.gruposTurnos)){ grupos = d.gruposTurnos.map(mapGrupo); source='gruposTurnos'; }
        else if(Array.isArray(d.grupos)){ grupos = d.grupos.map(mapGrupo); source='grupos'; }
        else if(Array.isArray(d.turnos_simples)){ grupos = [{ id: fallbackId, turnos: toTurnos(d.turnos_simples) }]; source='turnos_simples'; }
        else if(Array.isArray(d.turnos)){ grupos = [{ id: fallbackId, turnos: toTurnos(d.turnos) }]; source='turnos'; }
      }
      if(!grupos.length && Array.isArray(d)){
        const esc = d.find(x=> (x && (x._id||x.id)) && String(x._id||x.id) === String(escalaId)) || d[0];
        const sub = extractGruposFromPayloadMeta(esc, escalaId);
        grupos = sub.grupos; source = 'array:'+sub.source;
      }
      if(!grupos.length && d && typeof d==='object'){
        for(const k of Object.keys(d)){
          const v = d[k];
          if(Array.isArray(v) && v.length && typeof v[0]==='object'){
            const looksLikeGrupos = v.some(it => Array.isArray(it?.turnos) || Array.isArray(it?.turnos_simples) || Array.isArray(it?.horarios) || Array.isArray(it?.faixas) || Array.isArray(it?.faixas_horarias));
            if(looksLikeGrupos){ grupos = v.map(mapGrupo); source='deep:'+k; break; }
            const looksLikeTurnos = !!(v[0]?.ini || v[0]?.inicio || v[0]?.start || v[0]?.hora_inicio || v[0]?.horaInicio || v[0]?.fim || v[0]?.termino || v[0]?.end || v[0]?.hora_fim || v[0]?.horaFim);
            if(looksLikeTurnos){ grupos=[{ id:fallbackId, turnos: toTurnos(v) }]; source='deep-turnos:'+k; break; }
          } else if(v && typeof v==='object'){
            const sub = extractGruposFromPayloadMeta(v, escalaId);
            if(sub.grupos.length){ grupos=sub.grupos; source='deepObj:'+k+'/'+sub.source; break; }
          }
        }
      }
      if(!Array.isArray(grupos)) grupos=[];
      return { grupos, source };
    } catch(_e){ return { grupos:[], source:'erro' }; }
  }
  function extractGruposFromPayload(d, escalaId){
    const out = extractGruposFromPayloadMeta(d, escalaId);
    return Array.isArray(out?.grupos) ? out.grupos : [];
  }
  const api = { toTurnos, mapGrupo, extractGruposFromPayload };
  try { global.TurnosData = api; } catch(_){}
})(typeof window!=='undefined'? window: global);
