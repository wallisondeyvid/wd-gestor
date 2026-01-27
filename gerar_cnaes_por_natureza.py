"""Gera arquivo de mapeamento Natureza Jurídica -> CNAEs.

Uso:
  python gerar_cnaes_por_natureza.py            # gera somente com associações explícitas presentes em cada CNAE
  python gerar_cnaes_por_natureza.py --all       # associa TODOS os CNAEs a TODAS as naturezas (arquivo muito grande)

Observações:
 - A API oficial do IBGE não fornece relação direta entre CNAEs e naturezas jurídicas.
 - Por padrão, a lista de CNAEs (cnaes_lista.json) contém apenas {cod, desc}. Sem campo 'naturezas_juridicas',
   portanto o mapeamento ficará com listas vazias até que você enriqueça manualmente os CNAEs adicionando, em
   cada objeto, um array opcional "naturezas_juridicas": ["206-2", "213-5", ...].
 - A opção --all deve ser usada com cautela: duplicará ~5.300 CNAEs para cada natureza jurídica, produzindo
   centenas de milhares de linhas.
"""

import json
import sys
from pathlib import Path

BASE = Path(r'c:\Projeto3')
CAMINHO_CNAES = BASE / 'public' / 'data' / 'cnaes_lista.json'
CAMINHO_NATUREZAS = BASE / 'public' / 'data' / 'naturezas_juridicas.json'
CAMINHO_SAIDA = BASE / 'public' / 'data' / 'CNAES_POR_NATUREZA.json'

GERAR_TODOS = '--all' in sys.argv

with CAMINHO_CNAES.open(encoding='utf-8') as f:
    cnaes = json.load(f)
with CAMINHO_NATUREZAS.open(encoding='utf-8') as f:
    naturezas = json.load(f)

codes_naturezas = [str(nj.get('codigo') or nj.get('cod')) for nj in naturezas]

# Inicializa estrutura
cnaes_por_natureza = {codigo: [] for codigo in codes_naturezas}

# Verifica se algum CNAE já possui campo de associação
tem_campo = any('naturezas_juridicas' in c for c in cnaes)

if tem_campo:
    total_associadas = 0
    for cnae in cnaes:
        for codigo_nj in cnae.get('naturezas_juridicas', []) or []:
            codigo_nj = str(codigo_nj)
            if codigo_nj in cnaes_por_natureza:
                cnaes_por_natureza[codigo_nj].append({
                    'codigo': cnae.get('cod'),
                    'descricao': cnae.get('desc')
                })
                total_associadas += 1
    print(f'Associações explícitas aplicadas: {total_associadas}')
elif GERAR_TODOS:
    for codigo_nj in codes_naturezas:
        cnaes_por_natureza[codigo_nj] = [
            {'codigo': c['cod'], 'descricao': c['desc']} for c in cnaes
        ]
    print('Gerado mapeamento completo (todos CNAEs para todas as naturezas).')
else:
    print('Nenhum campo naturezas_juridicas encontrado nos CNAEs. Gerado arquivo com listas vazias. Use --all para preencher tudo ou enriqueça os CNAEs.')

with CAMINHO_SAIDA.open('w', encoding='utf-8') as f:
    json.dump(cnaes_por_natureza, f, ensure_ascii=False, indent=2)

print(f'Arquivo salvo em: {CAMINHO_SAIDA}')