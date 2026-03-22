# Escopo do microcorte

Microcorte concluído na frente Escalas, restrito ao endpoint `GET /escalas/api/unidades-relacionadas` em `src/modules/escalas/app/routes/unidadesApi.js`.

O recorte permaneceu local ao endpoint e não foi ampliado para auth global, sessão global, middleware global, pages, root global ou outros endpoints do módulo.

# Arquivos envolvidos

- Produção: `src/modules/escalas/app/routes/unidadesApi.js`
- Guardrail: `tests/escalas.unidades-relacionadas.test.js`
- Wiring consultado como contexto local: `src/modules/escalas/app/escalas-app.js`

# O que foi alterado

O endpoint foi reorganizado internamente para explicitar blocos locais de:
- resolução do usuário-base;
- resolução de `matrizId`;
- montagem e ordenação do cluster;
- normalização do payload observável.

A mudança permaneceu no mesmo arquivo e não introduziu compartilhamento com outros endpoints.

# O que foi preservado

O contrato externo do endpoint foi mantido.

Permaneceu preservado o comportamento de:
- `401` para não autenticado;
- ramo master e admin;
- fallback `no-unidade-matrizes` para usuário autenticado sem unidade;
- unidade inexistente com resposta `data` vazio;
- retorno de matriz e filiais conforme o cluster;
- ordenação observável já exercitada pela suíte;
- payload com `data` contendo objetos com `id`, `codigo`, `nome` e `is_principal`.

# Validação executada

Validação executada com a suíte dedicada em `tests/escalas.unidades-relacionadas.test.js`.

Resultado observado:
- 5 testes
- 5 verdes
- 0 falhas

# Estado após o microcorte

Este microcorte específico de Escalas foi concluído com refactor interno local e guardrail dedicado.

A frente Escalas permanece aberta como frente de trabalho mais ampla, mas este endpoint agora está:
- isolado por suíte própria;
- com contrato observável protegido;
- com lógica interna menos acoplada do que no snapshot anterior.

# Próximo passo em aberto

O próximo passo continua em aberto dentro da frente Escalas, sem tratar este checkpoint como conclusão da migração multi-tenant do módulo inteiro.

Este checkpoint registra apenas o encerramento disciplinado do microcorte do endpoint de unidades relacionadas.