# WDG -- Assembleia Module

## Master Architecture v1.0 (Consolidated)

------------------------------------------------------------------------

# 1. PRINCÍPIOS FUNDAMENTAIS

O WD Gestor se adapta ao regimento do condomínio. O condomínio não se
adapta ao sistema.

-   Multi-condomínio real
-   Multi-modelo de governança
-   Auditoria forte
-   Imutabilidade rastreável
-   Operação com mediador único
-   Portal do Morador integrado

------------------------------------------------------------------------

# 2. DOMÍNIOS ENVOLVIDOS

## 2.1 Gestão de Condomínios

-   Convocação
-   Configuração
-   Execução operacional (mediador)
-   Encerramento
-   Ata

## 2.2 Portal do Morador

-   Confirmação de presença
-   Registro de presença virtual
-   Votação
-   Acompanhamento da assembleia
-   Consulta da ata

------------------------------------------------------------------------

# 3. MÁQUINA DE ESTADOS (STATE MACHINE)

DRAFT\
→ CONVOCADA\
→ EXECUTANDO\
↔ PAUSADA\
→ ENCERRADA\
→ CANCELADA

Transições inválidas são bloqueadas por regra de negócio.

------------------------------------------------------------------------

# 4. LOCK DE MEDIADOR (OPERADOR ÚNICO)

-   Apenas um usuário pode operar assembleia em EXECUÇÃO
-   Lock com TTL
-   Heartbeat periódico
-   Auto-liberação por inatividade
-   Lock armazenado em assembleiaExecution.lock

Invariante: Não pode existir dois mediadores ativos simultaneamente.

------------------------------------------------------------------------

# 5. PRESENÇA E QUÓRUM

## 5.1 Presença

Campos: - unidadeId - tipoParticipacao (presencial \| virtual) -
confirmadoPor (portal \| operador) - horarioEntrada - horarioSaida

## 5.2 Modelo de Quórum Configurável

Configurado antes da convocação.

Tipos: - Por unidades - Por fração ideal - Por maioria simples - Por
maioria qualificada - Por modelo personalizado

Quórum recalculado dinamicamente a cada alteração de presença.

------------------------------------------------------------------------

# 6. MODELO DE VOTAÇÃO

Configurado por assembleia.

## 6.1 Tipos Suportados

-   Simples (1 unidade = 1 voto)
-   Fração ideal
-   Maioria qualificada
-   Ponderado customizado

## 6.2 Invariantes

-   Voto só permitido se presença válida
-   Voto não pode ser alterado após encerramento
-   Resultado calculado conforme regra definida na convocação

------------------------------------------------------------------------

# 7. SCHEMA MONGO (SIMPLIFICADO)

## 7.1 Assembleia

-   condominioId
-   configuracaoQuorum
-   configuracaoVotacao
-   status

## 7.2 AssembleiaExecution

-   assembleiaId
-   status
-   lock
-   presencas\[\]
-   pautas\[\]
-   resultadoFinal
-   encerradaEm

## 7.3 AuditLog

-   assembleiaId
-   tipoEvento
-   payload
-   userId
-   timestamp
-   hashAnterior
-   hashAtual

------------------------------------------------------------------------

# 8. LOG DE AUDITORIA IMUTÁVEL

-   Append-only
-   Cadeia hash SHA-256
-   Não editável
-   Não deletável

Permite auditoria externa.

------------------------------------------------------------------------

# 9. TESTES MÍNIMOS OBRIGATÓRIOS

## 9.1 Lock

-   Dois usuários não podem adquirir lock simultaneamente

## 9.2 Presença

-   Não permite presença após encerramento

## 9.3 Votação

-   Não permite voto duplicado

## 9.4 Auditoria

-   Hash encadeado válido

------------------------------------------------------------------------

# 10. ORDEM SEGURA DE IMPLEMENTAÇÃO

1.  Lock do Mediador
2.  Log de Auditoria Imutável
3.  Presença
4.  Quórum
5.  Votação
6.  Ata Final

------------------------------------------------------------------------

# 11. GARANTIAS DE SISTEMA

-   Multi-tenant seguro
-   Adaptável a qualquer regimento interno
-   Auditoria robusta
-   Operação controlada
-   Evolução segura por invariantes

------------------------------------------------------------------------

Fim do Documento
