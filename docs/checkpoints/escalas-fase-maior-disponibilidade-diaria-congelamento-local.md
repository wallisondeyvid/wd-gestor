# Escalas: Fase Maior de Disponibilidade Diaria - Congelamento Local

## 1. Escopo da fase

Registrar o encerramento local da fase de refino interno do endpoint de disponibilidade diaria em Escalas, restrita ao arquivo [src/modules/escalas/app/routes/escalaNova.js](src/modules/escalas/app/routes/escalaNova.js) e validada pela suite dedicada [tests/escalas.disponibilidade-funcionario.test.js](tests/escalas.disponibilidade-funcionario.test.js).

## 2. Arquivos envolvidos

- [src/modules/escalas/app/routes/escalaNova.js](src/modules/escalas/app/routes/escalaNova.js)
- [tests/escalas.disponibilidade-funcionario.test.js](tests/escalas.disponibilidade-funcionario.test.js)

## 3. O que foi consolidado

- parse extraido
- validacao extraida
- periodo-base extraido
- formatter ISO extraido
- envelopes HTTP extraidos
- serializacao extraida
- query compartilhada das fontes extraida
- projecao compartilhada das fontes extraida
- loaders por modelo extraidos
- carga agregada das fontes extraida
- montagem de blocks extraida
- merge extraido
- derivacao de free extraida
- orquestracao de calculo extraida

## 4. O que foi preservado

- contrato externo do endpoint
- auth atual
- comportamento de login/redirect sem sessao
- mensagens
- status codes
- payload externo
- semantica de clip, merge e free
- filtros de sobreposicao das fontes

## 5. Validacao executada

Comando validado no estado atual do workspace:

```bash
node --test .\tests\escalas.disponibilidade-funcionario.test.js
```

Resultado confirmado:

- 18 pass
- 0 fail

## 6. Estado final do arquivo

O handler de disponibilidade ficou reduzido a orquestracao de alto nivel, enquanto parse, validacao, periodo-base, carga das fontes, montagem de blocos, merge, derivacao de free, serializacao e envelopes HTTP permanecem separados em helpers locais no mesmo arquivo.

## 7. Motivo do congelamento local

Foi atingido ponto de congelamento local. A partir do estado atual, novos microcortes no mesmo trecho tenderiam a gerar fragmentacao cosmetica, sem ganho proporcional de clareza, isolamento de regra ou seguranca de manutencao.

## 8. Proximo passo em aberto

Se houver continuidade da fase maior, o proximo passo deve sair deste microcorte e atacar outro recorte funcional ou outro corredor interno relevante, sem reabrir este trecho apenas para novas extracoes mecanicas.