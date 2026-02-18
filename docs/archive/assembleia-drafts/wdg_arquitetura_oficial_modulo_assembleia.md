# WD Gestor

# Arquitetura Oficial --- Módulo de Execução de Assembleia

Versão: 1.0\
Status: Documento oficial de arquitetura (pré-implementação final)

------------------------------------------------------------------------

# 1. Princípio Fundamental

O WD Gestor **não impõe modelo de governança**.

Cada condomínio possui seu próprio regimento interno.\
O sistema deve permitir configurar regras conforme o regimento do
condomínio --- não o contrário.

A Assembleia é gerida pelo módulo **Gestão de Condomínios**, mas possui
integração direta com o **Portal do Morador**.

------------------------------------------------------------------------

# 2. Escopo do Módulo Assembleia

O módulo deve permitir:

-   Convocação da assembleia
-   Definição de regras de governança
-   Geração automática do edital
-   Confirmação de presença (Portal do Morador)
-   Execução controlada (mediador único)
-   Votações configuráveis
-   Apuração conforme regras congeladas
-   Geração e armazenamento da ata
-   Auditoria completa de eventos

------------------------------------------------------------------------

# 3. Arquitetura em Camadas

## Nível A --- Política de Governança do Condomínio

Configuração base permanente do condomínio.

Exemplos de regras configuráveis:

-   Método de contagem:
    -   Por unidade
    -   Por fração ideal
-   Quórum padrão:
    -   Maioria simples
    -   2/3
    -   Unanimidade
    -   Percentual customizado
-   Abstenção:
    -   Conta para quórum?
    -   Conta para resultado?
-   Desempate:
    -   Presidente decide
    -   Reabre votação
    -   Reprova automaticamente
-   Procuração:
    -   Permitida ou não
    -   Limite por pessoa
    -   Exige anexo?

Resultado: Objeto versionado: `governanca_condominio`

------------------------------------------------------------------------

## Nível B --- Template de Assembleia

Modelo reutilizável.

Exemplos:

-   Assembleia Ordinária
-   Assembleia Extraordinária
-   Assembleia de Obras

Define:

-   Modo padrão (presencial, virtual, híbrida)
-   Regras padrão por pauta
-   Layout padrão do edital

Resultado: Objeto versionado: `template_assembleia`

------------------------------------------------------------------------

## Nível C --- Convocação da Assembleia

Ao convocar:

-   Seleciona template
-   Define data/hora
-   Define pautas
-   Define regras específicas por pauta
-   Gera edital

Quando o edital é publicado:

As regras são congeladas.

------------------------------------------------------------------------

# 4. Congelamento de Regras

Ao publicar o edital, o sistema deve gravar:

-   Snapshot completo das regras
-   Hash criptográfico das regras
-   Versão da governança
-   Versão do template

Após isso:

-   Não pode alterar regras de quórum ou contagem
-   Alterações exigem cancelamento e nova convocação

------------------------------------------------------------------------

# 5. Execução da Assembleia

## Estados

1.  Rascunho
2.  Convocada
3.  Aberta
4.  Em votação
5.  Encerrada
6.  Ata gerada
7.  Finalizada

------------------------------------------------------------------------

# 6. Regra de Operação Exclusiva (Mediador Único)

Apenas um usuário pode operar a assembleia.

Modelo adotado:

-   Lock exclusivo
-   TTL configurável
-   Heartbeat automático
-   Liberação automática por inatividade

------------------------------------------------------------------------

# 7. Portal do Morador

O morador poderá:

-   Confirmar presença
-   Acompanhar andamento
-   Votar
-   Visualizar resultado
-   Acessar ata

Todas as ações são registradas em log.

------------------------------------------------------------------------

# 8. Motor de Regras (Governance Engine)

A apuração deve obedecer:

resultado = apurar(votos, presencas, regras_frozen)

A execução nunca interpreta regras dinâmicas. Apenas aplica regras
congeladas.

------------------------------------------------------------------------

# 9. Auditoria

Registrar:

-   Início da assembleia
-   Mudança de estado
-   Abertura e encerramento de votação
-   Cada voto
-   Desempate
-   Encerramento
-   Geração da ata

------------------------------------------------------------------------

# 10. Segurança Jurídica

O sistema deve garantir:

-   Integridade das regras
-   Registro imutável de eventos
-   Histórico completo
-   Não alteração retroativa

------------------------------------------------------------------------

# 11. MVP Definido

O MVP deve suportar:

-   Contagem por unidade ou fração ideal
-   Quórum simples, 2/3, unanimidade ou percentual customizado
-   Configuração de abstenção
-   Desempate configurável
-   Procuração básica (opcional no MVP)

------------------------------------------------------------------------

# 12. Próximo Passo Técnico

Com esta arquitetura congelada, o próximo passo seguro é:

Modelar entidades de dados (schema lógico): - assembleia - pauta -
voto - presenca - lock_execucao - ata

Somente após isso iniciar implementação de backend.

------------------------------------------------------------------------

Documento encerrado.
