// Teste E2E rápido da API Escalas focado em refeicoes.computavel
import fetch from 'node-fetch';

const BASE = process.env.BASE_URL || 'http://localhost:3000/escalas/api';

function iso(d){ return d.toISOString().slice(0,10); }

async function main(){
  const hoje = new Date();
  const ini = new Date(hoje.getTime());
  const fim = new Date(hoje.getTime() + 24*3600*1000);
  // 1) Criar escala
  const escalaBody = {
    descricao: 'E2E Refeicoes '+Date.now(),
    classificacao: 'ORDINÁRIA',
    unidadeId: null,
    periodo: { ini: iso(ini), fim: iso(fim) },
    gruposTurnos: [ { id: 'G1', turnos: [{ ini:'08:00', fim:'17:00' }] } ],
    equipes: [ { id:'EQ1', nome:'EQ1', descricao:'Equipe 1', componentes:[] } ]
  };
  let r = await fetch(`${BASE.replace(/\/$/,'')}/escalas`, { method:'POST', headers:{ 'content-type':'application/json', 'x-skip-auth':'1' }, body: JSON.stringify(escalaBody) });
  const js = await r.json();
  if(!r.ok){ throw new Error('Falha ao criar escala: '+JSON.stringify(js)); }
  const escalaId = js.id;
  console.log('Criada escala', escalaId);

  // 2) POST recurso com 2 refeições (uma computável, outra não)
  const recurso = {
    id: 'R1', equipeId: 'EQ1', nome: 'Recurso Teste', placa: 'TEST-1234',
    alocacoesRecurso: { [`${iso(ini)}__G1::08:00-17:00`]: true },
    refeicoesRecurso: {
      [`${iso(ini)}__G1::08:00-17:00`]: [
        { inicio: '12:00', fim: '12:30', computavel: true,  tipo: 'ALMOCO' },
        { inicio: '15:00', fim: '15:10', computavel: false, tipo: 'PAUSA' }
      ]
    }
  };
  r = await fetch(`${BASE.replace(/\/$/,'')}/escalas/${escalaId}/equipes/EQ1/recursos`, { method:'POST', headers:{ 'content-type':'application/json', 'x-skip-auth':'1' }, body: JSON.stringify({ recurso }) });
  const postJs = await r.json();
  if(!r.ok){ throw new Error('Falha ao criar recurso: '+JSON.stringify(postJs)); }
  console.log('POST recurso dbg', postJs.dbg);

  // 3) GET recurso e verificar contadores
  r = await fetch(`${BASE.replace(/\/$/,'')}/escalas/${escalaId}/equipes/EQ1/recursos/R1`, { headers: { 'x-skip-auth':'1' } });
  const getJs = await r.json();
  if(!r.ok){ throw new Error('Falha ao obter recurso: '+JSON.stringify(getJs)); }
  console.log('GET recurso dbg', getJs.dbg);
  const counts = getJs?.dbg?.refeicoes;
  if(!counts || counts.total < 2){ throw new Error('Refeicoes não persistidas como esperado: '+JSON.stringify(counts)); }
  if(counts.verdadeiros < 1 || counts.falsos < 1){ throw new Error('Computável/não computável não refletidos: '+JSON.stringify(counts)); }
  console.log('OK: computável/não computável persistidos.');
}

main().catch(e=>{ console.error(e); process.exit(1); });
