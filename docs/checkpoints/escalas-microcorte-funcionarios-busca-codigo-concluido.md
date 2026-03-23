# Escopo do microcorte

Microcorte concluído na frente Escalas, restrito ao endpoint GET /escalas/api/funcionarios/busca-codigo em funcionarioBuscaCodigoApi.js.

O recorte permaneceu local ao endpoint e não foi ampliado para auth global, sessão global, middleware global, pages, root global ou outros endpoints do módulo.

# Arquivos envolvidos

- Produção: funcionarioBuscaCodigoApi.js
- Guardrail: escalas.funcionarios-busca-codigo.test.js

# O que foi alterado

O endpoint foi reorganizado internamente para explicitar blocos locais de:
- resolução do usuário-base e privilégio;
- resolução de clusterPermitidoIds;
- localização do funcionário na ordem atual de busca.

A mudança permaneceu no mesmo arquivo e não introduziu compartilhamento com outros endpoints.

# O que foi preservado

O contrato externo do endpoint foi mantido.

Permaneceu preservado o comportamento de:
- 401 sem sessão;
- 400 sem codigo e sem id;
- 404 para usuário sem unidade válida;
- 404 para funcionário inexistente;
- 404 para funcionário fora do cluster;
- 200 para master sem filtro de cluster;
- ordem de busca por id, codigo exato case-insensitive com tolerância a espaços laterais, CPF com 11 dígitos e ObjectId quando aplicável;
- payload observável com data.id, data.nome, data.cpf, data.codigo, data.unidade_id, data.unidade_nome e data.unidade_codigo.

# Validação executada

Validação executada com a suíte dedicada em escalas.funcionarios-busca-codigo.test.js.

Resultado observado:
- 8 testes
- 8 verdes
- 0 falhas

# Estado após o microcorte

Este microcorte específico de Escalas foi concluído com refactor interno local e guardrail dedicado.

A frente Escalas permanece aberta como frente de trabalho mais ampla, mas este endpoint agora está:
- coberto por suíte própria;
- com contrato observável protegido;
- com lógica interna organizada sem ampliação do recorte.

# Próximo passo em aberto

O próximo passo continua em aberto dentro da frente Escalas, sem tratar este checkpoint como conclusão da migração multi-tenant do módulo inteiro.

Este checkpoint registra apenas o encerramento disciplinado do microcorte do endpoint de busca de funcionário por código.
