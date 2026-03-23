import express from 'express';
import Ausencia from '#models/ausencia.js';
import Funcionario from '#models/Funcionario.js';
import mongoose from 'mongoose';
import Unidade from '#models/unidade.js';
import path from 'path';
import fs from 'fs';
let _PdfKitCached = null;
async function getPdfKit(){
  if(_PdfKitCached) return _PdfKitCached;
  try { const mod = await import('pdfkit'); _PdfKitCached = mod.default || mod; return _PdfKitCached; }
  catch(err){ throw new Error('Dependência pdfkit não instalada: '+err.message); }
}

const router = express.Router();

function requireEscalasAuth(req,res,next){
  if(!req.session?.escalasUser){
    console.log('[AUSENCIAS][AUTH] sessão ausente -> redirect login');
    return res.redirect('/escalas/login');
  }
  next();
}

function renderAusencias(req,res){
  console.log('[AUSENCIAS] render view. baseUrl=%s path=%s', req.baseUrl, req.path);
  const meta = { basePath: '/escalas' };
  res.render('ausencias', { title:'Gestão Ausências', meta });
}

function parseAusenciasListQuery(req){
  const { funcionarioId, unidadeId: rawUnidadeId, tipo, inicio, fim } = req.query;
  const unidadeId = (rawUnidadeId && rawUnidadeId !== 'undefined') ? rawUnidadeId : null;
  return { funcionarioId, unidadeId, tipo, inicio, fim };
}

function validateAusenciasListQuery({ funcionarioId, unidadeId, inicio, fim }){
  if(funcionarioId && unidadeId){
    return 'Informe apenas UNIDADE ou FUNCIONÁRIO (não ambos).';
  }
  if(!funcionarioId && !unidadeId){
    return 'Informe uma UNIDADE ou um FUNCIONÁRIO.';
  }
  if(!inicio || !fim){
    return 'Período (início e fim) obrigatório.';
  }
  return null;
}

function parseAusenciasReportQuery(req){
  const { funcionarioId, unidadeId: rawUnidadeId, tipo, inicio, fim } = req.query;
  const unidadeId = (rawUnidadeId && rawUnidadeId !== 'undefined') ? rawUnidadeId : null;
  return { funcionarioId, unidadeId, tipo, inicio, fim };
}

function validateAusenciasReportQuery({ funcionarioId, unidadeId, inicio, fim }){
  if(funcionarioId && unidadeId){
    return 'Use UNIDADE ou FUNCIONÁRIO (exclusivos).';
  }
  if(!funcionarioId && !unidadeId){
    return 'Informe uma UNIDADE ou um FUNCIONÁRIO.';
  }
  if(!inicio || !fim){
    return 'Período obrigatório';
  }
  return null;
}

async function resolveAusenciasListUnitFilter(unidadeId){
  if(!mongoose.isValidObjectId(unidadeId)){
    return { error: 'unidadeId inválido.' };
  }

  const funcionarios = await Funcionario.find({ unidade_id: unidadeId }, { _id:1 }).lean();
  const ids = funcionarios.map(f=> f._id.toString());
  if(!ids.length){
    return { data: [] };
  }

  return { funcionarioId: { $in: ids } };
}

// Helper para converter WEBP local em PNG em diretório temporário quando necessário
async function ensurePngIfWebp(absPath){
  try{
    if(!/\.webp$/i.test(String(absPath||''))) return absPath;
    let sharpMod=null; try{ const m=await import('sharp'); sharpMod=m.default||m; }catch(_){ sharpMod=null; }
    if(!sharpMod) return absPath;
    const osMod = await import('os');
    const outDir = path.join(osMod.tmpdir(),'logo-cache');
    if(!fs.existsSync(outDir)) fs.mkdirSync(outDir,{recursive:true});
    const outFile = path.join(outDir, path.basename(String(absPath)).replace(/\.webp$/i,'.png'));
    if(!fs.existsSync(outFile)) await sharpMod(String(absPath)).png().toFile(outFile);
    return outFile;
  }catch(_){ return absPath; }
}

// Acessível como /escalas/gestao/ausencias
router.get('/gestao/ausencias', requireEscalasAuth, renderAusencias);
router.get('/ausencias', (req,res)=> res.redirect('/escalas/gestao/ausencias'));

// --- API CRUD Ausências ---
// Listar ausências com filtros simples
router.get('/api/ausencias', requireEscalasAuth, async (req,res)=>{
  try {
    const { funcionarioId, unidadeId, tipo, inicio, fim } = parseAusenciasListQuery(req);
    const validationError = validateAusenciasListQuery({ funcionarioId, unidadeId, inicio, fim });
    if(validationError){
      return res.status(400).json({ ok:false, error: validationError });
    }

    const base = {};
    if(tipo) base.tipo = tipo;
    let filtroPeriodo = { inicioISO: { $lte: fim }, fimISO: { $gte: inicio } }; // sobreposição

    let filtroFinal = { ...base, ...filtroPeriodo };

    if(funcionarioId){
      filtroFinal.funcionarioId = funcionarioId;
    } else if(unidadeId){
      const unitFilter = await resolveAusenciasListUnitFilter(unidadeId);
      if(unitFilter.error){
        return res.status(400).json({ ok:false, error: unitFilter.error });
      }
      if(unitFilter.data){
        return res.json({ ok:true, data: [] });
      }
      filtroFinal.funcionarioId = unitFilter.funcionarioId;
    }

    const lista = await Ausencia.find(filtroFinal).sort({ inicioISO: 1, funcionarioNome:1 }).limit(1000);
    res.json({ ok:true, data: lista });
  } catch(err){
    console.error('[AUSENCIAS][API][LIST] erro', err); res.status(500).json({ ok:false, error:'Erro ao listar ausências' });
  }
});

// --- Relatório Ausências (PDF) ---
router.get('/api/ausencias/relatorio', requireEscalasAuth, async (req,res)=>{
  try {
    const input = parseAusenciasReportQuery(req);
    const validationError = validateAusenciasReportQuery(input);
    if(validationError){ return res.status(400).json({ ok:false, error: validationError }); }

    const { funcionarioId, unidadeId, tipo, inicio, fim } = input;
    const base = {};
    if(tipo) base.tipo = tipo;
    let filtro = { ...base, inicioISO: { $lte: fim }, fimISO: { $gte: inicio } };
    let unidade = null;
    if(funcionarioId){
      filtro.funcionarioId = funcionarioId;
    } else if(unidadeId){
      if(!mongoose.isValidObjectId(unidadeId)){
        return res.status(400).json({ ok:false, error:'unidadeId inválido.' });
      }
      const funcionarios = await Funcionario.find({ unidade_id: unidadeId }, { _id:1 }).lean();
      const ids = funcionarios.map(f=> f._id.toString());
      if(!ids.length){
        // Mesmo sem registros, ainda queremos produzir PDF (vazio) com cabeçalho da unidade
        unidade = await Unidade.findById(unidadeId).lean().catch(()=>null);
      } else {
        filtro.funcionarioId = { $in: ids };
        unidade = await Unidade.findById(unidadeId).lean().catch(()=>null);
      }
    }
    const lista = await Ausencia.find(filtro).sort({ inicioISO:1, funcionarioNome:1 }).limit(1500);
    if(!unidade){
      // fallback tentativa anterior (sessão) permanece
      unidade = unidadeId ? await Unidade.findById(unidadeId).lean().catch(()=>null) : null;
    }
    // Fallbacks para obter unidade da sessão caso não tenha vindo no filtro
    if(!unidade){
      const s = req.session?.escalasUser || {};
      // possíveis campos: unidadeId (nos relatórios ferias), unidade_id (modelo original?), unidade (obj), unidadeCodigo (hipotético)
      const possiveisIds = [];
      if(s.unidadeId) possiveisIds.push({ type:'id', value:s.unidadeId });
      if(s.unidade_id) possiveisIds.push({ type:'id', value:s.unidade_id });
      if(s.unidade && typeof s.unidade === 'object'){
        if(s.unidade._id) possiveisIds.push({ type:'id', value:s.unidade._id });
        if(s.unidade.id) possiveisIds.push({ type:'id', value:s.unidade.id });
        if(s.unidade.codigo) possiveisIds.push({ type:'codigo', value:s.unidade.codigo });
      }
      if(s.unidadeCodigo) possiveisIds.push({ type:'codigo', value:s.unidadeCodigo });
      // Elimina duplicados
      const vistos = new Set();
      for(const cand of possiveisIds){
        const key = cand.type+':'+cand.value; if(vistos.has(key) || !cand.value) continue; vistos.add(key);
        try {
          let uSess=null;
          if(cand.type==='id') uSess = await Unidade.findById(cand.value).lean();
          else if(cand.type==='codigo') uSess = await Unidade.findOne({ codigo: cand.value }).lean();
          if(uSess){ unidade = uSess; break; }
        } catch(e){ console.warn('[AUSENCIAS][RELATORIO] Falha lookup unidade (%s=%s) -> %s', cand.type, cand.value, e.message); }
      }
      if(!unidade){
        console.warn('[AUSENCIAS][RELATORIO] Nenhuma unidade encontrada via sessão. sessionKeys=%o', Object.keys(s));
      }
    }

    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition','inline; filename="relatorio-ausencias.pdf"');
  const PDFDocument = await getPdfKit();
  const doc = new PDFDocument({ margin:36, size:'A4', bufferPages:true });
    doc.pipe(res);
  const titulo='Relatório Ausências';

    async function resolveLogo(){
      const projectRoot = path.resolve(process.cwd());
      function findRepoRoot(){
        let dir=path.dirname(new URL(import.meta.url).pathname);
        for(let i=0;i<6;i++){
          if(fs.existsSync(path.join(dir,'images'))){ return dir; }
          const parent=path.dirname(dir); if(parent===dir) break; dir=parent;
        }
        return projectRoot;
      }
      const altRoot=findRepoRoot();
      function resolveCandidate(rel){
        if(!rel) return null;
        if(/^https?:\/\//i.test(String(rel))) return 'URL:'+String(rel);
        if(path.isAbsolute(rel)) return fs.existsSync(rel)? rel : null;
        const cleaned=String(rel).replace(/^\/+/, '');
        const attempts=[
          path.join(projectRoot, cleaned),
          path.join(altRoot, cleaned),
          path.join(projectRoot,'public', cleaned),
          path.join(projectRoot,'uploads', cleaned),
          path.join(projectRoot,'public','uploads', cleaned)
        ];
        for(const p of attempts){ if(fs.existsSync(p)) return p; }
        return null;
      }
      async function fetchToImageBuffer(url){
        try{
          const fetchImpl = (typeof fetch==='function')? fetch : (await import('node-fetch')).default;
          const resp = await fetchImpl(url); if(!resp.ok) return null;
          const ct = String(resp.headers.get('content-type')||'').toLowerCase();
          let buf = Buffer.from(await resp.arrayBuffer());
          const looksWebp = ct.includes('image/webp') || /\.webp($|\?)/i.test(url);
          const looksSvg = ct.includes('image/svg') || /\.svg($|\?)/i.test(url);
          if(looksWebp || looksSvg){ try{ const sharpMod=(await import('sharp')).default; buf=await sharpMod(buf).png().toBuffer(); }catch(_){ } }
          return buf;
        }catch(_){ return null; }
      }
      // 1) logo da unidade (filtro ou detectada)
      if(unidade?.logo){
        const cand=resolveCandidate(unidade.logo);
        if(cand && !String(cand).startsWith('URL:')) return await ensurePngIfWebp(cand);
        if(String(cand).startsWith('URL:')){ const buf=await fetchToImageBuffer(cand.slice(4)); if(buf) return buf; }
      }
      // 2) sessão: unidade e/ou id
      const s = req.session?.escalasUser || {};
      const poss=[];
      if(s.unidade?.logo) poss.push(s.unidade.logo);
      const uId = s.unidadeId || s.unidade_id || s?.unidade?._id || s?.unidade?.id;
      if(uId){ try{ const u = await Unidade.findById(uId).lean(); if(u?.logo) poss.push(u.logo); }catch(_){ } }
      for(const rel of poss){
        const cand=resolveCandidate(rel);
        if(cand && !String(cand).startsWith('URL:')) return await ensurePngIfWebp(cand);
        if(cand && String(cand).startsWith('URL:')){ const buf=await fetchToImageBuffer(cand.slice(4)); if(buf) return buf; }
      }
      // 3) fallback local WD
      const wd = resolveCandidate('images/logoWDGestor.png');
      if(wd) return wd;
      return null;
    }
    let cursorY=36;
    const headerLogo = await resolveLogo();
  if(headerLogo){
    try {
      if(Buffer.isBuffer(headerLogo)){
        doc.image(headerLogo, 36, cursorY, { fit:[90,40] });
      } else {
        let finalPath = headerLogo;
        if(/\.webp$/i.test(String(headerLogo))){
          try {
            const sharpMod = await import('sharp').then(m=>m.default||m).catch(()=>null);
            if(sharpMod){
              const osMod = await import('os');
              const tmpPng = path.join(osMod.tmpdir(),'logo-cache');
              if(!fs.existsSync(tmpPng)) fs.mkdirSync(tmpPng,{recursive:true});
              const outFile = path.join(tmpPng, path.basename(String(headerLogo)).replace(/\.webp$/i,'.png'));
              if(!fs.existsSync(outFile)) await sharpMod(String(headerLogo)).png().toFile(outFile);
              finalPath = outFile;
            }
          } catch(_){ }
        }
        doc.image(finalPath, 36, cursorY, { fit:[90,40] });
      }
    } catch(e){ console.warn('[AUSENCIAS][RELATORIO] Falha logo -> %s', e.message); }
  }
  else { console.warn('[AUSENCIAS][RELATORIO] Sem logo para inserir'); }
  doc.fontSize(16).font('Helvetica-Bold').text(titulo,0,cursorY,{align:'center'});
  cursorY+=10;
  doc.moveTo(36, cursorY+40).lineTo(doc.page.width-36, cursorY+40).strokeColor('#555').lineWidth(0.5).stroke();
  cursorY+=48;
  doc.fontSize(9).font('Helvetica');
  const periodoTxt = `${(inicio||'').substring(8,10)+'/'+(inicio||'').substring(5,7)+'/'+(inicio||'').substring(0,4)} a ${(fim||'').substring(8,10)+'/'+(fim||'').substring(5,7)+'/'+(fim||'').substring(0,4)}`;
  const unidadeTxt = unidade ? (`${unidade.codigo||''} ${unidade.nome||''}`).trim() : '-';
  const funcionarioTxt = (funcionarioId && lista.length) ? (lista[0].funcionarioNome||'') : '-';
  doc.font('Helvetica-Bold').text('Unidade:',36,cursorY,{continued:true}); doc.font('Helvetica').text(' '+unidadeTxt);
  doc.font('Helvetica-Bold').text('Funcionário:',36,doc.y,{continued:true}); doc.font('Helvetica').text(' '+funcionarioTxt);
  doc.font('Helvetica-Bold').text('Período:',36,doc.y,{continued:true}); doc.font('Helvetica').text(' '+periodoTxt);
  const afterFiltersY = doc.y + 4;
  doc.moveTo(36, afterFiltersY).lineTo(doc.page.width-36, afterFiltersY).strokeColor('#bbb').lineWidth(0.5).stroke();
  doc.moveDown(0.6);

    // Nova tabela: Nome do Funcionário | Tipo de ausência | Início | Fim
  // Larguras ajustadas para caber sem cortar: Nome(250) Tipo(140) Início(65) Fim(65) => total 520 (<= área útil ~523)
  const colX=[36, 36+250, 36+250+140, 36+250+140+65];
  const widths=[250,140,65,65];
    function headerTabela(){
      const startY=doc.y;
      doc.rect(36, startY-4, doc.page.width-72, 16).fill('#f2f2f2').strokeColor('#ccc').lineWidth(0.5).stroke();
      doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
      const headers=['Nome do Funcionário','Tipo de ausência','Início','Fim'];
      headers.forEach((h,i)=>{ doc.text(h, colX[i], startY-2, { width:widths[i], align:'center' }); });
      doc.moveDown(1.0); doc.font('Helvetica').fillColor('#000');
    }
    headerTabela();
    const pageBottom = doc.page.height-70;
    function brData(iso){ if(!iso) return ''; return iso.substring(8,10)+'/'+iso.substring(5,7)+'/'+iso.substring(0,4); }
    lista.forEach(a=>{
      if(doc.y>pageBottom){ doc.addPage(); headerTabela(); }
      const rowY=doc.y; doc.fontSize(8);
      let nome=a.funcionarioNome||''; if(nome.length>60) nome=nome.slice(0,57)+'...';
      const vals=[nome, a.tipo||'', brData(a.inicioISO), brData(a.fimISO)];
      vals.forEach((v,i)=> doc.text(v, colX[i], rowY, { width:widths[i], align:'center' }));
      doc.moveDown(0.9);
      doc.moveTo(36, doc.y-3).lineTo(doc.page.width-36, doc.y-3).strokeColor('#eee').lineWidth(0.5).stroke();
    });

    const now=new Date();
    const dataHora= now.toLocaleDateString('pt-BR')+' '+now.toLocaleTimeString('pt-BR');
    const usuario = req.session?.escalasUser?.nome || 'Usuário';
    // Rodapé 3 colunas
    const reservedFooter=60;
    const range = doc.bufferedPageRange();
    for(let i=0;i<range.count;i++){
      doc.switchToPage(i);
      const footerTop = doc.page.height - reservedFooter + 12;
      doc.moveTo(36, footerTop-10).lineTo(doc.page.width-36, footerTop-10).strokeColor('#ddd').lineWidth(0.5).stroke();
      const centerX = doc.page.width/2;
      doc.fontSize(8).font('Helvetica').fillColor('#000');
      doc.text(`Data/hora: ${dataHora}`, 36, footerTop, { width: centerX-46, align:'left' });
      doc.text(`Usuário: ${usuario}`, centerX-100, footerTop, { width:200, align:'center' });
      doc.text(`Página ${i+1} de ${range.count}`, doc.page.width-36-120, footerTop, { width:120, align:'right' });
    }
    doc.end();
  } catch(err){
    console.error('[AUSENCIAS][API][RELATORIO] erro', err); res.status(500).json({ ok:false, error:'Erro ao gerar relatório' });
  }
});

// Criar ausência
router.post('/api/ausencias', requireEscalasAuth, async (req,res)=>{
  try {
    const { funcionarioId, funcionarioNome, tipo, inicioISO, fimISO, motivo, autorizadorId, autorizadorNome } = req.body||{};
    if(!funcionarioId || !funcionarioNome || !tipo || !inicioISO || !fimISO){
      return res.status(400).json({ ok:false, error:'Campos obrigatórios ausentes' });
    }
    if(fimISO < inicioISO){
      return res.status(400).json({ ok:false, error:'Término anterior ao início' });
    }
    const doc = await Ausencia.create({ funcionarioId, funcionarioNome, tipo, inicioISO, fimISO, motivo, autorizadorId, autorizadorNome });
    res.status(201).json({ ok:true, data: doc });
  } catch(err){
    console.error('[AUSENCIAS][API][CREATE] erro', err); res.status(500).json({ ok:false, error:'Erro ao criar ausência' });
  }
});

// Excluir ausência
router.delete('/api/ausencias/:id', requireEscalasAuth, async (req,res)=>{
  try {
    const { id } = req.params;
    const del = await Ausencia.findByIdAndDelete(id);
    if(!del) return res.status(404).json({ ok:false, error:'Registro não encontrado' });
    res.json({ ok:true });
  } catch(err){
    console.error('[AUSENCIAS][API][DEL] erro', err); res.status(500).json({ ok:false, error:'Erro ao excluir ausência' });
  }
});

// Atualizar ausência
router.put('/api/ausencias/:id', requireEscalasAuth, async (req,res)=>{
  try {
    const { id } = req.params;
    const { inicioISO, fimISO, tipo, motivo, autorizadorId, autorizadorNome } = req.body||{};
    if(!inicioISO || !fimISO || !tipo){ return res.status(400).json({ ok:false, error:'Campos obrigatórios ausentes' }); }
    if(fimISO < inicioISO){ return res.status(400).json({ ok:false, error:'Término anterior ao início' }); }
    const doc = await Ausencia.findById(id);
    if(!doc) return res.status(404).json({ ok:false, error:'Registro não encontrado' });
    const conflito = await Ausencia.findOne({ _id: { $ne: id }, funcionarioId: doc.funcionarioId, $or:[ { inicioISO: { $lte: fimISO }, fimISO: { $gte: inicioISO } } ] });
    if(conflito) return res.status(409).json({ ok:false, error:'Período sobreposto a outra ausência' });
    doc.inicioISO=inicioISO; doc.fimISO=fimISO; doc.tipo=tipo; doc.motivo=motivo; doc.autorizadorId=autorizadorId; doc.autorizadorNome=autorizadorNome;
    await doc.save();
    res.json({ ok:true, data: doc });
  } catch(err){
    console.error('[AUSENCIAS][API][PUT] erro', err); res.status(500).json({ ok:false, error:'Erro ao atualizar ausência' });
  }
});

export default router;