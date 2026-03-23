# Escopo do microcorte

Microcorte concluído na frente Escalas, restrito ao endpoint GET /escalas/api/funcionarios/por-ids em funcionariosResponsaveisApi.js.

O recorte permaneceu local ao endpoint e não foi ampliado para auth global, sessão global, middleware global, pages, root global ou outros endpoints do módulo.

# Arquivos envolvidos

- Produção: funcionariosResponsaveisApi.js
- Guardrail: escalas.funcionarios-por-ids.test.js

# O que foi alterado

O endpoint foi reorganizado internamente para explicitar blocos locais de:
- parse e normalização de ids;
- montagem do mapa de unidades;
- serialização do payload observável.

A mudança permaneceu no mesmo arquivo e não introduziu compartilhamento com outros endpoints.

# O que foi preservado

O contrato externo do endpoint foi mantido.

Permaneceu preservado o comportamento de:
- 401 sem sessão;
- 200 com success: true e data: [] sem ids;
- 200 com success: true e data: [] com ids inválidos;
- retorno com itens observáveis compatíveis com a suíte dedicada;
- ausência atual de filtro explícito de escopo;
- shape observável com id, nome, cpf, codigo, unidade_id, unidade_nome e unidade_codigo.

# Validação executada

Validação executada com a suíte dedicada em escalas.funcionarios-por-ids.test.js.

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

Este checkpoint registra apenas o encerramento disciplinado do microcorte do endpoint de funcionários por ids.
