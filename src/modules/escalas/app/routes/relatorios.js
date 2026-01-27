import router2, { relatorioEscalaHandler, relatorioDiariaHandler } from './relatorios2.js';
export default router2;
export { relatorioEscalaHandler, relatorioDiariaHandler };
/*
  if(!safeBottom) novaPagina();
  for(const esc of escalas){
    const Unidade=await getUnidadeModel();
    let unidadeNome='-'; let unidadeCodigo=null;
    if(esc.unidade_id){ try{ const uni=await Unidade.findById(esc.unidade_id).select('nome codigo').lean(); if(uni){ unidadeNome=uni.nome||'-'; unidadeCodigo=uni.codigo||null; } }catch{} }
    const turnosDia=coletarTurnosDia(esc).filter(t=>!turnoTok||normalizeTurnoToken(t.token)===turnoTok);
    if(!turnosDia.length) continue;
    const enrichMap=await buildRecursoEnrichMap(esc);
    // Para cada turno, montar uma tabela sob o cabeçalho "Escala + Turno"
    for(const turno of turnosDia){
      // Montar linhas para este turno
      const linhas=[]; const idsParaResolver=new Set();
      for(const eq of (esc.equipes||[])){
        const recursos=Array.isArray(eq.recursos)? eq.recursos:[];
        for(const rec of recursos){
          const info=montarEfetivoRecursoDiaTurno(esc, rec, dia, turno);
          if(!info||!info.alocado) continue;
          let membros=info.membros||[];
          const fora=coletarForaEquipeDiaTurno(eq, dia, turno);
          if(fora.length){ membros=membros.concat(fora.map(f=>({id:f.id,nome:f.nome?`${f.nome} (fora)`:'(fora)'}))); }
          membros.forEach(m=>{ if(m&&m.id) idsParaResolver.add(String(m.id)); });
          linhas.push({
            equipe: `${eq.nome||eq.id||'—'}${eq.descricao? `\n${eq.descricao}`:''}`,
            membros,
            recurso: recursoTextoDuasLinhas(rec,enrichMap),
            notasRecurso: info.notasRecurso||'—',
            notasEquipe: null, // será setado por equipe após
            _eq: eq
          });
        }
        // Linha para "fora" sem recurso
        const fora=coletarForaEquipeDiaTurno(eq, dia, turno);
        if(fora.length){
          fora.forEach(f=>{ if(f&&f.id) idsParaResolver.add(String(f.id)); });
          const membros = fora.map(f=>({id:f.id,nome:f.nome||null,atribuicao:null}));
          linhas.push({ equipe: eq.nome||eq.id||'-', membros, recurso:'—', notasRecurso:'—', notasEquipe:null, _eq:eq });
        }
      }
      if(!linhas.length) continue;
      // Resolver nomes/códigos em lote
      if(idsParaResolver.size){
        try{
          const Funcionario=await getFuncionarioModel();
          const arr=await Funcionario.find({_id:{$in:[...idsParaResolver]}}).select('_id nome codigo').lean();
          const mapa=new Map(arr.map(a=>[String(a._id),{nome:a.nome||null,codigo:a.codigo||null}]));
          for(const ln of linhas){ if(!Array.isArray(ln.membros)) continue; for(const m of ln.membros){ if(!m||!m.id) continue; const k=String(m.id); const info=mapa.get(k); if(info){ if(!m.nome&&info.nome) m.nome=info.nome; if(!m.codigo&&info.codigo) m.codigo=info.codigo; } } }
        }catch{}
      }
      // Notas de equipe por equipe (primeira linha carrega, restantes em branco)
      const notasMap=new Map();
      try{
        for(const ln of linhas){ const eq=ln._eq; if(!eq) continue; if(!notasMap.has(eq)){ let n=null; try{ const a=Array.isArray(eq.alocacoes)? eq.alocacoes.find(a=> a&&a.dia===dia && normalizeTurnoToken(a.turnoId||'')===normalizeTurnoToken(turno.token)):null; n=a? (a.notas||a.nota||null):null; }catch{} if(!n) n=eq.notas||eq.nota||null; notasMap.set(eq,n); } }
        let firstSeen=new Map(); for(const ln of linhas){ const eq=ln._eq; const n=notasMap.get(eq)||'—'; if(!firstSeen.get(eq)){ ln.notasEquipe=n||'—'; firstSeen.set(eq,true); } else { ln.notasEquipe=' '; } delete ln._eq; }
      }catch{}
      // Antes de desenhar, abrir seção: Escala + Turno
      const secH=24; const titulo=`Escala: ${esc.descricao||'—'} - Turno: ${turno.ini}-${turno.fim}`;
      if(y + secH + rowH > safeBottom){ novaPagina(); }
      doc.save(); doc.fillColor('#e7f1ff').rect(x,y,W,secH).fill(); doc.restore();
      doc.strokeColor('#cfe2ff').lineWidth(0.5).rect(x,y,W,secH).stroke();
      doc.font('Helvetica-Bold').fontSize(10).fillColor(THEME.text).text(titulo, x+6, y+6, {width: W-12, align:'left', lineBreak:false, ellipsis:true});
      y += secH;
      // Cabeçalho de colunas para esta seção
      y = drawTableHeader(doc, x, y, W, colW, rowH);

      // Desenhar linhas
      for(const ln of linhas){
        const efetivo = (Array.isArray(ln.membros)? ln.membros: []).map(m=>{
          if(!m) return '';
          const codigo=m.codigo||null; const nome=m.nome||null;
          let base=null; if(codigo&&nome) base=`${codigo} - ${nome}`; else if(codigo) base=`${codigo}`; else if(nome) base=`${nome}`; else base=String(m.id||'');
          return base + (m.atribuicao? ` (${m.atribuicao})`:'');
        }).filter(Boolean).join('\n') || '—';
        const txtEquipe = clampText(ln.equipe||'—', { maxLines:3, maxChars:220 });
        const txtEfetivo = clampText(efetivo, { maxLines:10, maxChars:2000 });
        const txtRecurso = clampText(ln.recurso||'—', { maxLines:4, maxChars:400 });
        const txtNotasR = clampText(ln.notasRecurso||'—', { maxLines:8, maxChars:1400 });
        const txtNotasE = clampText(ln.notasEquipe||'—', { maxLines:10, maxChars:2000 });
        const equipeH=Math.min(maxRowH,Math.max(rowH,doc.heightOfString(txtEquipe,{width:colW.equipe-6,align:'left'})+6));
        const efetivoH=Math.min(maxRowH,Math.max(rowH,doc.heightOfString(txtEfetivo,{width:colW.efetivo-6,align:'left'})+6));
        const recursoH=Math.min(maxRowH,Math.max(rowH,doc.heightOfString(txtRecurso,{width:colW.recurso-6,align:'left'})+6));
        const notasRH=Math.min(maxRowH,Math.max(rowH,doc.heightOfString(txtNotasR,{width:colW.notasRecurso-6,align:'left'})+6));
        const notasEH=Math.min(maxRowH,Math.max(rowH,doc.heightOfString(txtNotasE,{width:colW.notasEquipe-6,align:'left'})+6));
        const dynH=Math.min(maxRowH,Math.max(rowH,equipeH,efetivoH,recursoH,notasRH,notasEH));
        if(y + dynH > safeBottom){ novaPagina(); y = drawTableHeader(doc, x, y, W, colW, rowH); }
        doc.save(); doc.fillColor('#f6faff').rect(x,y,W,dynH).fill(); doc.restore();
        doc.strokeColor('#e5e7eb').lineWidth(0.5).rect(x,y,W,dynH).stroke();
        doc.font('Helvetica').fontSize(9).fillColor(THEME.text);
        drawCenteredText(doc, txtEquipe, x, y, colW.equipe, dynH, { align:'center', paddingX:6 });
        drawCenteredText(doc, txtEfetivo, x+colW.equipe, y, colW.efetivo, dynH, { align:'center', paddingX:6 });
        drawCenteredText(doc, txtRecurso, x+colW.equipe+colW.efetivo, y, colW.recurso, dynH, { align:'center', paddingX:6 });
        doc.text(txtNotasR, x+colW.equipe+colW.efetivo+colW.recurso+3, y+3, { width: colW.notasRecurso-6, height: dynH-6, align:'left', ellipsis:true });
        doc.text(txtNotasE, x+colW.equipe+colW.efetivo+colW.recurso+colW.notasRecurso+3, y+3, { width: colW.notasEquipe-6, height: dynH-6, align:'left', ellipsis:true });
        y += dynH;
      }
    }
  }
    doc.text(periodoBr, x, y, { width: W, align:'center' }); y += 18;

    // Matriz de alocação por turno x dia (marcando equipes alocadas na matriz esc.alocacao)
    doc.font('Helvetica-Bold').fontSize(11).fillColor(THEME.text).text('Matriz de Alocação (turnos x dias)', x, y, { width: W, align:'center' }); y += 8; doc.fillColor(THEME.text).font('Helvetica');
    y = drawMatrizAlocacaoTurnos(doc, esc, x, y, W, diasISO);

    // Rodapé com paginação
    const range = doc.bufferedPageRange();
    for(let i=0;i<range.count;i++){
      doc.switchToPage(range.start + i);
      const p = doc.page; const contentW = p.width - p.margins.left - p.margins.right;
      const yFooter = p.height - p.margins.bottom - 14;
      const pagTxt = `página ${i+1}/${range.count}`;
      doc.font('Helvetica').fontSize(8).fillColor('#666').text(pagTxt, p.margins.left, yFooter, { width: contentW, align:'right' });
      doc.fillColor(THEME.text);
    }
    doc.end();
  } catch(e){
    console.error('[escalas][relatorios][escala] erro', e);
    if(!res.headersSent) res.status(500).send('Falha ao gerar PDF');
  }
}

// Desenha uma matriz simplificada de alocação turnos x dias baseada em esc.alocacao
function drawMatrizAlocacaoTurnos(doc, esc, x, y, W, diasISO){
  const turnos=[]; (esc.grupos_turnos||[]).forEach(g=> (g.turnos||[]).forEach(t=> turnos.push({ label:`${t.ini}-${t.fim}`, ini:t.ini, fim:t.fim })));
  turnos.sort((a,b)=> String(a.ini).localeCompare(String(b.ini)));
  const colDiaW = Math.max(40, Math.min(64, Math.floor((W-140)/Math.max(1,diasISO.length))));
  const leftW = Math.max(120, W - colDiaW*diasISO.length);
  const rowH = 18;
  // Header
  doc.save(); doc.fillColor('#e7f1ff').rect(x, y, leftW + colDiaW*diasISO.length, rowH).fill(); doc.restore();
  doc.strokeColor(THEME.grid).lineWidth(0.5).rect(x, y, leftW + colDiaW*diasISO.length, rowH).stroke();
  doc.font('Helvetica-Bold').fontSize(9).fillColor(THEME.text);
  drawCenteredText(doc, 'Turno', x, y, leftW, rowH);
  diasISO.forEach((d,i)=>{ drawCenteredText(doc, d.slice(8,10)+'/'+d.slice(5,7), x+leftW+i*colDiaW, y, colDiaW, rowH); });
  y += rowH;
  // Preprocess matriz
  const matriz = (esc.alocacao && typeof esc.alocacao==='object')? esc.alocacao: {};
  const tokensByDiaTurn = new Map();
  for(const [k,v] of Object.entries(matriz)){
    const parsed = parseChaveAlocacaoEscala(k) || parseChaveAlocacaoLegacy(k, esc); if(!parsed) continue;
    const d = parsed.dia; const h1=String(parsed.ini).padStart(2,'0'); const h2=String(parsed.fim).padStart(2,'0');
    const tok = `${String(Math.floor(parsed.ini/60)).padStart(2,'0')}:${String(parsed.ini%60).padStart(2,'0')}-${String(Math.floor(parsed.fim/60)).padStart(2,'0')}:${String(parsed.fim%60).padStart(2,'0')}`;
    const key = d+'|'+tok;
    let arr = []; if(Array.isArray(v)) arr = v.map(String); else if(typeof v==='string') arr = v.split(',').map(s=> s.trim()).filter(Boolean); else if(v && typeof v==='object') arr = Object.keys(v).filter(id=> v[id]);
    tokensByDiaTurn.set(key, new Set(arr));
  }
  // Rows por turno
  for(const t of turnos){
    const tok = `${t.ini}-${t.fim}`;
    // zebra
    doc.save(); doc.fillColor('#f6faff').rect(x, y, leftW + colDiaW*diasISO.length, rowH).fill(); doc.restore();
    // left cell
    doc.strokeColor(THEME.grid).rect(x, y, leftW, rowH).stroke();
    doc.font('Helvetica-Bold').fontSize(8).fillColor(THEME.text);
    drawCenteredText(doc, tok, x, y, leftW, rowH);
    // day cells
    diasISO.forEach((d,i)=>{
      const cx=x+leftW+i*colDiaW; doc.strokeColor(THEME.grid).rect(cx, y, colDiaW, rowH).stroke();
      const key=d+'|'+tok; const has = tokensByDiaTurn.has(key) && tokensByDiaTurn.get(key).size>0;
      if(has){ doc.font('Helvetica-Bold').fillColor(THEME.primary).fontSize(9); drawCenteredText(doc, '•', cx, y, colDiaW, rowH, { ellipsis:false }); doc.fillColor(THEME.text).font('Helvetica'); }
    });
    y += rowH;
    if(y > doc.page.height - doc.page.margins.bottom - 40){ doc.addPage(); y = doc.page.margins.top; }
  }
  return y + 6;
}

// ===== Rotas do Relatório Diário =====
router.get('/relatorios/diaria', requireEscalasAuth, relatorioDiariaHandler);
router.get('/relatorios/diaria.pdf', requireEscalasAuth, relatorioDiariaHandler);
router.get('/relatorio/diaria', requireEscalasAuth, relatorioDiariaHandler);
router.get('/relatorio/diaria.pdf', requireEscalasAuth, relatorioDiariaHandler);
router.get('/relatorios/diaria/:id', requireEscalasAuth, relatorioDiariaHandler);
router.get('/relatorios/diaria/:id.pdf', requireEscalasAuth, relatorioDiariaHandler);
router.get('/relatorio/diaria/:id', requireEscalasAuth, relatorioDiariaHandler);
router.get('/relatorio/diaria/:id.pdf', requireEscalasAuth, relatorioDiariaHandler);
router.get('/diaria', requireEscalasAuth, relatorioDiariaHandler);
router.get('/diaria.pdf', requireEscalasAuth, relatorioDiariaHandler);

// ===== Rotas do Relatório de Escala (matriz) =====
router.get('/relatorios/escala', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorios/escala.pdf', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorio/escala', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorio/escala.pdf', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorios/escala/:id', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorios/escala/:id.pdf', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorio/escala/:id', requireEscalasAuth, relatorioEscalaHandler);
router.get('/relatorio/escala/:id.pdf', requireEscalasAuth, relatorioEscalaHandler);

// Debug rápido
router.get('/relatorios/__debug', (req,res)=> res.json({ ok:true, hint:'/escalas/relatorios/escala?id=<ObjectId>' }));
*/
