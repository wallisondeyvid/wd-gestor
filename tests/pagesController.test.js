import test from 'node:test';
import assert from 'node:assert/strict';
import { paginaDashboard, paginaUsuarios } from '../src/modules/gestor/app/controllers/views/pagesController.js';

function mockRes(){
  const r={}; r.statusCode=200; r.view=null; r.context=null; r.sent=null;
  r.status=(c)=>{ r.statusCode=c; return r; };
  r.render=(view,ctx,cb)=>{
    // Suporte a assinatura com callback (partials) ou simples
    if(typeof cb === 'function'){
      try { const html = `<html>${view}</html>`; cb(null, html); } catch(e){ cb(e); }
    } else {
      r.view=view; r.context=ctx; return r; }
  };
  r.send=(html)=>{ r.sent=html; return r; };
  return r;
}

// Mock de dependências mínimas (as funções usam somente req.user em dashboard)

test('paginaDashboard renderiza view com user', async () => {
  const req={ user:{ nome:'Teste', role:'user', isMaster:false } };
  const res=mockRes();
  paginaDashboard(req,res);
  assert.equal(res.view,'dashboard-gestor');
  assert.equal(res.context.user.nome,'Teste');
});

test('paginaUsuarios exige admin/master', async () => {
  const req={ user:{ role:'user', isMaster:false } };
  const res=mockRes();
  await paginaUsuarios(req,res,()=>{});
  assert.equal(res.statusCode,403);
});
