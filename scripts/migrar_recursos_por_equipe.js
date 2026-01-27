#!/usr/bin/env node
/**
 * Migração: mover recursos raiz de Escala para dentro da equipe correspondente.
 * - Agrupa escala.recursos por recurso.equipeId
 * - Se equipe com id correspondente existir, push em equipe.recursos
 * - Caso não exista cria equipe "GERAL" (id: 'e_default') se houver recursos sem equipeId
 * - Limpa escala.recursos ao final
 * - Adiciona campo escala.schemaVersion = 2
 * Execução: node scripts/migrar_recursos_por_equipe.js
 */
import mongoose from 'mongoose';
import Escala from '../src/core/models/escala.js';

async function run(){
  const uri = process.env.MONGO_URL || process.env.MONGODB_URI || 'mongodb://localhost:27017/gestor';
  await mongoose.connect(uri, { autoIndex:false });
  console.log('[migrar_recursos_por_equipe] conectado');
  const cursor = Escala.find({ $or:[ { recursos: { $exists:true, $ne: [] } }, { schemaVersion: { $lt:2 } } ] }).cursor();
  let processed=0, moved=0, createdEquipe=0;
  for await (const esc of cursor){
    const recursos = Array.isArray(esc.recursos)? esc.recursos: [];
    if(!recursos.length){
      if(!esc.schemaVersion || esc.schemaVersion < 2){ esc.schemaVersion = 2; await esc.save(); processed++; }
      continue;
    }
    const byEquipe = new Map();
    for(const r of recursos){
      const key = r.equipeId || 'SEM';
      if(!byEquipe.has(key)) byEquipe.set(key, []);
      byEquipe.get(key).push(r);
    }
    const equipes = esc.equipes || [];
    const ensureEquipe = (id)=>{
      let eq = equipes.find(e=> e.id === id);
      if(!eq){
        if(id === 'SEM'){
          eq = { id:'e_default', nome:'Equipe Geral', descricao:'Criada pela migração', componentes:[], disponibilidade:{}, recursos:[] };
        } else {
          eq = { id, nome: 'Equipe '+id, descricao:'Criada por migração (referência recurso)', componentes:[], disponibilidade:{}, recursos:[] };
        }
        equipes.push(eq); createdEquipe++;
      }
      return eq;
    };
    for(const [eqId, recs] of byEquipe.entries()){
      const eq = ensureEquipe(eqId);
      if(!Array.isArray(eq.recursos)) eq.recursos=[];
      for(const r of recs){
        // Evita duplicar caso já tenha sido migrado manualmente
        if(!eq.recursos.find(x=> x.id === r.id)){
          eq.recursos.push({ ...r }); moved++;
        }
      }
    }
    esc.equipes = equipes;
    esc.recursos = []; // limpa legacy
    esc.schemaVersion = 2;
    try { await esc.save(); } catch(e){ console.error('Falha ao salvar escala', esc._id, e.message); }
    processed++;
  }
  console.log('[migrar_recursos_por_equipe] fim', { processed, moved, createdEquipe });
  await mongoose.disconnect();
}
run().catch(e=>{ console.error(e); process.exit(1); });
