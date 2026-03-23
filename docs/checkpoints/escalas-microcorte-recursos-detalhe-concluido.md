# Escopo do microcorte

Microcorte concluído na frente Escalas, restrito ao endpoint GET /escalas/api/recursos/:id em recursosApi.js.

O recorte permaneceu local ao endpoint e não foi ampliado para auth global, sessão global, middleware global, pages, root global ou outros endpoints do módulo.

# Arquivos envolvidos

- Produção: recursosApi.js
- Guardrail: escalas.recursos-detalhe.test.js

# O que foi alterado

O endpoint foi reorganizado internamente para explicitar blocos locais de:
- resolução do usuário-base e privilégio;
- checagem de escopo do recurso;
- serialização do payload observável.

A mudança permaneceu no mesmo arquivo e não introduziu compartilhamento com outros endpoints.

# O que foi preservado

O contrato externo do endpoint foi mantido.

Permaneceu preservado o comportamento de:
- 401 com error = nao_autenticado sem sessão;
- 404 com error = nao_encontrado para id inexistente;
- 200 para master com recurso existente;
- 200 para usuário comum com recurso dentro do escopo;
- 403 com error = fora_do_escopo para recurso fora do escopo;
- 500 com error = erro_interno para id malformado;
- payload de sucesso com:
  - id
  - placa
  - marca
  - modelo
  - nome
  - unidade

# Validação executada

Validação executada com a suíte dedicada em escalas.recursos-detalhe.test.js.

Resultado observado:
- 6 testes
- 6 verdes
- 0 falhas

# Estado após o microcorte

Este microcorte específico de Escalas foi concluído com refactor interno local e guardrail dedicado.

A frente Escalas permanece aberta como frente de trabalho mais ampla, mas este endpoint agora está:
- coberto por suíte própria;
- com contrato observável protegido;
- com lógica interna organizada sem ampliação do recorte.

# Próximo passo em aberto

O próximo passo continua em aberto dentro da frente Escalas, sem tratar este checkpoint como conclusão da migração multi-tenant do módulo inteiro.

Este checkpoint registra apenas o encerramento disciplinado do microcorte do endpoint de detalhe de recurso por id.
