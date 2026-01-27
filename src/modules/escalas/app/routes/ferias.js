import express from 'express';
import Ferias from '../../../../../models/ferias.js';
import Funcionario from '../../../../core/models/Funcionario.js';
import mongoose from 'mongoose';
import Unidade from '../../../../core/models/unidade.js';
import path from 'path';
import fs from 'fs';
// Import PDF kit apenas quando necessário (lazy) para não quebrar módulo se faltar dependência
let _PdfKitCached = null;
async function getPdfKit(){
  if(_PdfKitCached) return _PdfKitCached;
  try { const mod = await import('pdfkit'); _PdfKitCached = mod.default || mod; return _PdfKitCached; }
  catch(err){ throw new Error('Dependência pdfkit não instalada: '+err.message); }
}

const router = express.Router();

function requireEscalasAuth(req,res,next){
  if(!req.session?.escalasUser){
    console.log('[FERIAS][AUTH] sessão ausente -> redirect login');
    return res.redirect('/escalas/login');
  }
  next();
}

function renderFerias(req,res){
  console.log('[FERIAS] render view. baseUrl=%s path=%s', req.baseUrl, req.path);
  // Força basePath '/escalas' pois o app inteiro é montado nesse prefixo
  const meta = { basePath: '/escalas' };
  res.render('ferias', { title:'Gestão Férias', meta });
}

// Converte arquivo WEBP local em PNG temporário quando necessário
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

// Rota principal (externamente acessada como /escalas/gestao/ferias)
router.get('/gestao/ferias', requireEscalasAuth, renderFerias);

// Redirecionar /ferias simples para /gestao/ferias para manter padrão de URL
router.get('/ferias', (req,res)=> res.redirect('/escalas/gestao/ferias'));

// --- API CRUD Férias ---
router.get('/api/ferias', requireEscalasAuth, async (req,res)=>{
  try {
    const { funcionarioId, unidadeId: rawUnidadeId, ano } = req.query;
    const unidadeId = (rawUnidadeId && rawUnidadeId !== 'undefined') ? rawUnidadeId : null;
    if(funcionarioId && unidadeId){ return res.status(400).json({ ok:false, error:'Informe apenas UNIDADE ou FUNCIONÁRIO (exclusivos).' }); }
    if(!funcionarioId && !unidadeId){ return res.status(400).json({ ok:false, error:'Informe uma UNIDADE ou um FUNCIONÁRIO.' }); }
    if(!ano){ return res.status(400).json({ ok:false, error:'Ano obrigatório.' }); }
    const anoNum = parseInt(ano,10); if(isNaN(anoNum) || anoNum<1900 || anoNum>3000){ return res.status(400).json({ ok:false, error:'Ano inválido.' }); }
    const q = { ano: anoNum };
    if(funcionarioId){
      q.funcionarioId = funcionarioId;
    } else if(unidadeId){
      if(!mongoose.isValidObjectId(unidadeId)) return res.status(400).json({ ok:false, error:'unidadeId inválido.' });
      const funcionarios = await Funcionario.find({ unidade_id: unidadeId }, { _id:1 }).lean();
      const ids = funcionarios.map(f=> f._id.toString());
      if(!ids.length){ return res.json({ ok:true, data: [] }); }
      q.funcionarioId = { $in: ids };
    }
    const lista = await Ferias.find(q).sort({ inicioISO:1, funcionarioNome:1 }).limit(1000);
    res.json({ ok:true, data: lista });
  } catch(err){
    console.error('[FERIAS][API][LIST] erro', err); res.status(500).json({ ok:false, error:'Erro ao listar férias' });
  }
});

// --- Relatório Férias (PDF) ---
router.get('/api/ferias/relatorio', requireEscalasAuth, async (req,res)=>{
  try {
    const { funcionarioId, ano, unidadeId: rawUnidadeId } = req.query;
    const unidadeId = (rawUnidadeId && rawUnidadeId !== 'undefined') ? rawUnidadeId : null;
    if(funcionarioId && unidadeId){ return res.status(400).json({ ok:false, error:'Use UNIDADE ou FUNCIONÁRIO (exclusivos).' }); }
    if(!funcionarioId && !unidadeId){ return res.status(400).json({ ok:false, error:'Informe uma UNIDADE ou um FUNCIONÁRIO.' }); }
    if(!ano){ return res.status(400).json({ ok:false, error:'Ano obrigatório.' }); }
    const anoNum = parseInt(ano,10); if(isNaN(anoNum) || anoNum<1900 || anoNum>3000){ return res.status(400).json({ ok:false, error:'Ano inválido.' }); }
    const q = { ano: anoNum };
    let unidade = null;
    if(funcionarioId){
      q.funcionarioId = funcionarioId;
    } else if(unidadeId){
      if(!mongoose.isValidObjectId(unidadeId)) return res.status(400).json({ ok:false, error:'unidadeId inválido.' });
      const funcionarios = await Funcionario.find({ unidade_id: unidadeId }, { _id:1 }).lean();
      const ids = funcionarios.map(f=> f._id.toString());
      if(ids.length){ q.funcionarioId = { $in: ids }; }
      unidade = await Unidade.findById(unidadeId).lean().catch(()=>null);
    }
    const lista = await Ferias.find(q).sort({ inicioISO:1, funcionarioNome:1 }).limit(1500);
    if(!unidade && unidadeId){
      unidade = await Unidade.findById(unidadeId).lean().catch(()=>null);
    }

    res.setHeader('Content-Type','application/pdf');
    res.setHeader('Content-Disposition','inline; filename="relatorio-ferias.pdf"');
  const PDFDocument = await getPdfKit();
  const doc = new PDFDocument({ margin:36, size:'A4', bufferPages:true });
    doc.pipe(res);

  const titulo='Relatório Férias';

    // Determinação da logo de cabeçalho (permite URL/Buffer e prioriza a unidade sempre)
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
      const altRoot = findRepoRoot();
      function resolveCandidate(rel){
        if(!rel) return null;
        if(/^https?:\/\//i.test(String(rel))) return 'URL:'+String(rel);
        if(path.isAbsolute(rel)) return fs.existsSync(rel)? rel : null;
        const cleaned = String(rel).replace(/^\/+/, '');
        const attempts = [
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
          const resp = await fetchImpl(url);
          if(!resp.ok) return null;
          const ct = String(resp.headers.get('content-type')||'').toLowerCase();
          let buf = Buffer.from(await resp.arrayBuffer());
          const looksWebp = ct.includes('image/webp') || /\.webp($|\?)/i.test(url);
          const looksSvg = ct.includes('image/svg') || /\.svg($|\?)/i.test(url);
          if(looksWebp || looksSvg){
            try{ const sharpMod = (await import('sharp')).default; buf = await sharpMod(buf).png().toBuffer(); }catch(_){ }
          }
          return buf;
        }catch(_){ return null; }
      }
      // 1) preferir logo da unidade do filtro
      const tryRel = unidade?.logo;
      if(tryRel){
        const cand = resolveCandidate(tryRel);
        if(cand && !String(cand).startsWith('URL:')) return await ensurePngIfWebp(cand);
        if(String(cand).startsWith('URL:')){
          const buf = await fetchToImageBuffer(cand.slice(4)); if(buf) return buf;
        }
      }
      // 2) unidade da sessão
      const s = req.session?.escalasUser || {};
      const possiveis = [];
      if(s.unidade?.logo) possiveis.push(s.unidade.logo);
      const uId = s.unidadeId || s.unidade_id || s?.unidade?._id || s?.unidade?.id;
      if(uId){ try{ const u = await Unidade.findById(uId).lean(); if(u?.logo) possiveis.push(u.logo); }catch(_){ } }
      for(const logoRel of possiveis){
        const cand = resolveCandidate(logoRel);
        if(cand && !String(cand).startsWith('URL:')) return await ensurePngIfWebp(cand);
        if(cand && String(cand).startsWith('URL:')){
          const buf = await fetchToImageBuffer(cand.slice(4)); if(buf) return buf;
        }
      }
      // 3) fallback WD Gestor local se existir
      const wd = resolveCandidate('images/logoWDGestor.png');
      if(wd) return wd;
      return null;
    }
    const headerLogo = await resolveLogo();
    // Header logo
    let cursorY = 36;
    if(headerLogo){
      try {
        if(Buffer.isBuffer(headerLogo)){
          doc.image(headerLogo, 36, cursorY, { fit:[90,40], align:'left' });
        } else {
          // se string, pode ser caminho local (já convertido para PNG se webp)
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
            }catch(_){ }
          }
          doc.image(finalPath, 36, cursorY, { fit:[90,40], align:'left' });
        }
      } catch(e){ console.warn('[FERIAS][RELATORIO] Falha ao inserir logo -> %s', e.message); }
    } else {
      console.warn('[FERIAS][RELATORIO] Sem logo para inserir.');
    }
    doc.fontSize(16).font('Helvetica-Bold').text(titulo, 0, cursorY, { align:'center' });
    cursorY += 10;
    // Linha divisória
    doc.moveTo(36, cursorY+40).lineTo(doc.page.width-36, cursorY+40).strokeColor('#555').lineWidth(0.5).stroke();
    cursorY += 48;

  // Bloco de filtros: imprime somente linhas que possuem valor; Ano sempre se quiser manter mesmo sem unidade/funcionário.
  doc.fontSize(9).font('Helvetica');
  if(unidade){
    const unidadeTxt = (`${unidade.codigo||''} ${unidade.nome||''}`).trim();
    doc.font('Helvetica-Bold').text('Unidade:',36,cursorY,{continued:true}); doc.font('Helvetica').text(' '+unidadeTxt);
  }
  if(funcionarioId && lista.length){
    const funcionarioTxt = lista[0].funcionarioNome||'';
    doc.font('Helvetica-Bold').text('Funcionário:',36,doc.y,{continued:true}); doc.font('Helvetica').text(' '+funcionarioTxt);
  }
  if(ano){
    doc.font('Helvetica-Bold').text('Ano:',36,doc.y,{continued:true}); doc.font('Helvetica').text(' '+ano);
  }
  const afterFiltersY = doc.y + 6;
  doc.moveTo(36, afterFiltersY).lineTo(doc.page.width-36, afterFiltersY).strokeColor('#bbb').lineWidth(0.5).stroke();
  doc.moveDown(0.5);

    // Tabela
    // Colunas finais solicitadas: Nome do Funcionário, Início, Fim, Dias
    const colX = [36, 36+260, 36+260+80, 36+260+80+80]; // widths: 260,80,80,40
    function headerTabela(){
      const startY=doc.y;
      doc.rect(36, startY-4, doc.page.width-72, 16).fill('#f2f2f2').strokeColor('#ccc').lineWidth(0.5).stroke();
      doc.fillColor('#000').fontSize(9).font('Helvetica-Bold');
      doc.text('Nome do Funcionário', colX[0], startY-2, { width:260, align:'center' });
      doc.text('Início', colX[1], startY-2, { width:80, align:'center' });
      doc.text('Fim', colX[2], startY-2, { width:80, align:'center' });
      doc.text('Dias', colX[3], startY-2, { width:40, align:'center' });
      doc.moveDown(1.0);
      doc.font('Helvetica').fillColor('#000');
    }
    headerTabela();
  // Reservar espaço de 60px fixos para rodapé (não gerar nova página só com rodapé)
  const reservedFooter = 60;
  function pageBottomY(){ return doc.page.height - reservedFooter; }
    function brData(iso){ if(!iso) return ''; return iso.substring(8,10)+'/'+iso.substring(5,7)+'/'+iso.substring(0,4); }
    lista.forEach(f=>{
      if(doc.y > pageBottomY()){ doc.addPage(); headerTabela(); }
      const rowY = doc.y;
      doc.fontSize(8);
      // Nome truncado se exceder largura
      let nome = f.funcionarioNome||''; if(nome.length>60) nome=nome.slice(0,57)+'...';
      doc.text(nome, colX[0], rowY, { width:260, align:'center' });
      doc.text(brData(f.inicioISO), colX[1], rowY, { width:80, align:'center' });
      doc.text(brData(f.fimISO), colX[2], rowY, { width:80, align:'center' });
      doc.text(f.dias!=null? String(f.dias):'', colX[3], rowY, { width:40, align:'center' });
      doc.moveDown(0.9);
      doc.moveTo(36, doc.y-3).lineTo(doc.page.width-36, doc.y-3).strokeColor('#eee').lineWidth(0.5).stroke();
    });

    // Rodapé com paginação
    const now = new Date();
    const dataHora = now.toLocaleDateString('pt-BR')+' '+now.toLocaleTimeString('pt-BR');
    const usuario = req.session?.escalasUser?.nome || 'Usuário';
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      const footerTop = doc.page.height - reservedFooter + 12;
      // linha superior
      doc.moveTo(36, footerTop-10).lineTo(doc.page.width-36, footerTop-10).strokeColor('#ddd').lineWidth(0.5).stroke();
      const leftX=36;
      const centerX=doc.page.width/2;
      const rightX=doc.page.width-36;
      doc.fontSize(8).font('Helvetica').fillColor('#000');
      // esquerda
      doc.text(`Data/hora: ${dataHora}` , leftX, footerTop, { width: (centerX-leftX)-10, align:'left' });
      // centro
      doc.text(`Usuário: ${usuario}` , centerX - 100, footerTop, { width:200, align:'center' });
      // direita
      doc.text(`Página ${i+1} de ${range.count}` , rightX-120, footerTop, { width:120, align:'right' });
    }
    doc.end();
  } catch(err){
    console.error('[FERIAS][API][RELATORIO] erro', err); res.status(500).json({ ok:false, error:'Erro ao gerar relatório' });
  }
});

router.post('/api/ferias', requireEscalasAuth, async (req,res)=>{
  try {
    const { funcionarioId, funcionarioNome, inicioISO, fimISO, ano, observacoes } = req.body||{};
    if(!funcionarioId || !funcionarioNome || !inicioISO || !fimISO || !ano){
      return res.status(400).json({ ok:false, error:'Campos obrigatórios ausentes' });
    }
    if(fimISO < inicioISO){
      return res.status(400).json({ ok:false, error:'Término anterior ao início' });
    }
    const dias = Math.max(1, Math.round((new Date(fimISO) - new Date(inicioISO)) / 86400000) + 1);
    const doc = await Ferias.create({ funcionarioId, funcionarioNome, inicioISO, fimISO, ano, dias, observacoes });
    res.status(201).json({ ok:true, data: doc });
  } catch(err){
    console.error('[FERIAS][API][CREATE] erro', err); res.status(500).json({ ok:false, error:'Erro ao criar férias' });
  }
});

router.delete('/api/ferias/:id', requireEscalasAuth, async (req,res)=>{
  try {
    const { id } = req.params;
    const del = await Ferias.findByIdAndDelete(id);
    if(!del) return res.status(404).json({ ok:false, error:'Registro não encontrado' });
    res.json({ ok:true });
  } catch(err){
    console.error('[FERIAS][API][DEL] erro', err); res.status(500).json({ ok:false, error:'Erro ao excluir férias' });
  }
});

// Atualizar férias
router.put('/api/ferias/:id', requireEscalasAuth, async (req,res)=>{
  try {
    const { id } = req.params;
    const { inicioISO, fimISO, observacoes } = req.body || {};
    if(!inicioISO || !fimISO){ return res.status(400).json({ ok:false, error:'Datas obrigatórias' }); }
    if(fimISO < inicioISO){ return res.status(400).json({ ok:false, error:'Término anterior ao início' }); }
    const doc = await Ferias.findById(id);
    if(!doc) return res.status(404).json({ ok:false, error:'Registro não encontrado' });
    // Validação sobreposição (mesmo funcionário diferente id)
    const conflito = await Ferias.findOne({ _id: { $ne: id }, funcionarioId: doc.funcionarioId, $or:[ { inicioISO: { $lte: fimISO }, fimISO: { $gte: inicioISO } } ] });
    if(conflito) return res.status(409).json({ ok:false, error:'Período sobreposto a outra férias' });
    doc.inicioISO=inicioISO; doc.fimISO=fimISO; doc.dias=Math.max(1, Math.round((new Date(fimISO)-new Date(inicioISO))/86400000)+1); doc.observacoes=observacoes;
    await doc.save();
    res.json({ ok:true, data: doc });
  } catch(err){
    console.error('[FERIAS][API][PUT] erro', err); res.status(500).json({ ok:false, error:'Erro ao atualizar férias' });
  }
});

export default router;
