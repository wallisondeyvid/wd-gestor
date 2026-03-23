# Escopo do microcorte

Microcorte concluído na frente Escalas, restrito ao endpoint `GET /escalas/api/funcionarios-responsaveis` em `src/modules/escalas/app/routes/funcionariosResponsaveisApi.js`.

O recorte permaneceu local ao endpoint e não foi ampliado para auth global, sessão global, middleware global, pages, root global ou outros endpoints do módulo.

# Arquivos envolvidos

- Produção: `src/modules/escalas/app/routes/funcionariosResponsaveisApi.js`
- Guardrail: `tests/escalas.funcionarios-responsaveis.test.js`
- Contexto local consultado: `src/modules/escalas/app/routes/funcionarioBuscaCodigoApi.js`

# O que foi alterado

O endpoint foi reorganizado internamente para explicitar blocos locais de:
- resolução do usuário-base e privilégio;
- resolução de cluster por unidade;
- mapeamento do payload observável.

A mudança permaneceu no mesmo arquivo e não introduziu compartilhamento com outros endpoints.

# O que foi preservado

O contrato externo do endpoint foi mantido.

Permaneceu preservado o comportamento de:
- `401` sem sessão do módulo;
- ramo master sem restrição de cluster;
- usuário sem unidade com retorno vazio;
- usuário comum restrito ao cluster;
- unidade fora do cluster com retorno vazio;
- expansão por `incluirFiliais=1`;
- heurística atual de `codigo`;
- rota `GET /api/funcionarios/por-ids` sem alteração;
- payload com `data` contendo itens observáveis compatíveis com a suíte dedicada.

# Validação executada

Validação executada com a suíte dedicada em `tests/escalas.funcionarios-responsaveis.test.js`.

Resultado observado:
- 7 testes
- 7 verdes
- 0 falhas

# Estado após o microcorte

Este microcorte específico de Escalas foi concluído com refactor interno local e guardrail dedicado.

A frente Escalas permanece aberta como frente de trabalho mais ampla, mas este endpoint agora está:
- coberto por suíte própria;
- com contrato observável protegido;
- com lógica interna menos duplicada do que no snapshot anterior.

# Próximo passo em aberto

O próximo passo continua em aberto dentro da frente Escalas, sem tratar este checkpoint como conclusão da migração multi-tenant do módulo inteiro.

Este checkpoint registra apenas o encerramento disciplinado do microcorte do endpoint de funcionários responsáveis.