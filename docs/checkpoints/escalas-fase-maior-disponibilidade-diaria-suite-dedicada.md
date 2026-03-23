# Escopo da etapa

Abertura prática da fase maior de disponibilidade diária em Escalas, restrita ao congelamento do comportamento real do endpoint GET /escalas/api/disponibilidade-funcionario por suíte dedicada de domínio.

Nesta etapa não houve alteração de produção.

# Arquivos envolvidos

- Guardrail: tests/escalas.disponibilidade-funcionario.test.js
- Produção observada, sem alteração: src/modules/escalas/app/routes/escalaNova.js

# O que foi feito

Foi criada uma suíte dedicada de domínio para o endpoint de disponibilidade diária, cobrindo:

- autenticação observada em runtime;
- validações 400;
- cenário sem bloqueios;
- férias simples;
- ausência simples;
- clip nas bordas;
- merge de blocos adjacentes e sobrepostos;
- mistura de tipos resultando em misto;
- complemento entre blocked e free;
- shape observável do payload.

# O que ficou congelado

O comportamento real atual do endpoint ficou protegido por suíte, incluindo:

- sem sessão, a rota termina na página HTML de login com status 200;
- erros de validação retornam 400 com ok: false e success: false;
- sucesso retorna 200 com ok: true e data.base, data.funcionarioId, data.blocked e data.free;
- blocked expõe inicio, fim e tipo;
- free expõe inicio e fim.

# Validação executada

Validação executada apenas com a suíte dedicada:

- node --test tests/escalas.disponibilidade-funcionario.test.js

Resultado observado:

- 18 testes
- 18 verdes
- 0 falhas

# Estado após esta etapa

A frente de disponibilidade diária agora está protegida por suíte de domínio própria.

Com isso, o endpoint deixa de depender apenas de leitura manual e passa a permitir refactor interno com risco controlado.

# Próximo passo em aberto

O próximo passo seguro é um microrefactor interno em escalaNova.js, ainda sem alterar contrato externo, para separar blocos locais de:

- validação de query;
- coleta e clip de bloqueios;
- merge de intervalos;
- cálculo de free;
- serialização final do payload.

Este checkpoint não encerra a fase maior; ele registra apenas o congelamento disciplinado do comportamento atual por suíte dedicada.