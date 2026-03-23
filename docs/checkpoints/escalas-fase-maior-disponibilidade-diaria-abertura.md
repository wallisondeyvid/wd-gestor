# Escopo da fase

Fase maior deliberada aberta na frente Escalas para o subdomínio de disponibilidade diária, centrado no endpoint GET /escalas/api/disponibilidade-funcionario.

Nesta rodada não houve patch de produção, nem alteração de testes, nem ampliação para outros módulos.

# Rota e wiring

O endpoint está implementado em escalaNova.js e exposto externamente em /escalas/api/disponibilidade-funcionario.

O wiring permanece local ao módulo Escalas, com montagem do router de escalaNova dentro de escalas-app e basePath /escalas definido no módulo.

O guard local do arquivo redireciona para /escalas/login quando não há sessão.

# Contrato HTTP real

O comportamento HTTP observado no código atual é:
- redirect para login quando não há sessão;
- 400 para ausência de funcionarioId, inicio ou fim;
- 400 para funcionarioId inválido;
- 400 para datas fora do formato YYYY-MM-DD;
- 400 para fim anterior a inicio;
- 400 para janela acima de 370 dias;
- 200 com ok: true e data contendo base, funcionarioId, blocked e free;
- 500 com ok: false e erro genérico em caso de falha interna.

# Shape real de free e blocked

O payload observado hoje retorna:
- data.base com inicio e fim;
- data.funcionarioId;
- data.blocked como lista de intervalos com inicio, fim e tipo;
- data.free como lista de intervalos com inicio e fim.

Os tipos observados para blocked são ferias, ausencia e misto.

# Regras de domínio identificadas

As regras embutidas hoje no endpoint são:
- clip de férias e ausências ao período-base consultado;
- merge de blocos sobrepostos ou adjacentes;
- promoção de tipo para misto quando há mescla de naturezas diferentes;
- cálculo de free como complemento de blocked dentro do período-base;
- granularidade diária, sem considerar horas ou turnos dentro do handler.

# Formatos alternativos tolerados pelo front

O front tolera hoje mais de um formato de leitura, ainda que o handler não produza todos eles explicitamente.

Há consumidores que aceitam:
- js.data ou o próprio js como contêiner de free e blocked;
- free na raiz em alguns fallbacks locais;
- campos de intervalo lidos como inicio ou ini;
- campos de término lidos como fim ou fimISO.

Essa tolerância espalhada no front faz parte do risco atual do subdomínio.

# Invariantes desejáveis ainda não explícitos

Os seguintes invariantes parecem desejáveis, mas não estão explicitamente protegidos hoje:
- blocked ordenado por inicio;
- blocked sem sobreposição após o merge;
- free sem sobreposição e sem adjacências redundantes;
- união de free e blocked reconstruindo exatamente o período-base;
- todos os intervalos respeitando inicio <= fim;
- blocked sempre contido dentro de data.base.

# Dependências de dados

O endpoint depende diretamente de:
- coleção Ferias;
- coleção Ausencia;
- funcionarioId como chave de consulta;
- campos inicioISO e fimISO para projeção e clip temporal.

O consumo real no front depende ainda da interpretação de free e blocked em múltiplos pontos da UI de Escalas.

# Motivo pelo qual deixou de ser microcorte pequeno

Este corredor deixou a faixa de microcorte pequeno porque combina ao mesmo tempo:
- regra de domínio temporal não trivial;
- múltiplos consumidores vivos espalhados no front;
- contrato observável mais amplo que um simples lookup;
- tolerâncias de shape já distribuídas pela interface.

O risco de regressão não está apenas no handler, mas no ecossistema de consumo de disponibilidade diária.

# Próximo passo obrigatório

Antes de qualquer refactor, o próximo passo obrigatório é criar uma suíte de domínio dedicada para disponibilidade diária.

Essa suíte deve congelar primeiro:
- auth real observado;
- erros 400 do contrato atual;
- cenários sem bloqueio;
- férias simples;
- ausência simples;
- merge de blocos;
- tipo misto;
- complemento de free em relação a blocked.

Somente depois disso a fase maior pode avançar para reorganização interna do endpoint.