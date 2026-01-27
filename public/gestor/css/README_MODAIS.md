# Guia rápido: CSS padronizado para modais (WDGestor)

Este pacote define estilos reutilizáveis para modais, com foco em aparência consistente e utilitários para tabelas com rolagem, cabeçalho fixo e coluna de ações sem quebra.

Arquivos:
- `/gestor/css/modals.css` — folha de estilos com utilitários.

## Como incluir

Em páginas completas (com `<head>`):

```html
<link rel="stylesheet" href="/gestor/css/modals.css" />
```

Em parciais de modal (EJS) que são injetadas dinamicamente após o carregamento:

- Opcional: injete automaticamente o CSS se não estiver presente (exemplo utilizado nos modais deste módulo):

```html
<script>
(function ensureModalCss(){
  if(!document.getElementById('wdgModalsCSS')){
    var l = document.createElement('link');
    l.id = 'wdgModalsCSS';
    l.rel = 'stylesheet';
    l.href = '/gestor/css/modals.css';
    document.head.appendChild(l);
  }
})();
</script>
```

## Classes principais

- `wdg-modal` (aplicar em `.modal-content`): ajusta bordas, espaçamentos e delimita o escopo de estilos do modal.

- `wdg-scroll-2` (aplicar no wrapper `.table-responsive`): define altura máxima com `overflow-y: auto` para que a lista role a partir de ~2–3 itens.

- `wdg-table-centered` (aplicar na `<table>`): centraliza todo o conteúdo (th e td).

- `wdg-sticky-head` (aplicar na `<table>`): fixa o cabeçalho (thead th) durante a rolagem do corpo da tabela.

- `actions-col` (aplicar no `<th>` da coluna de ações): evita quebra de linha no cabeçalho.

- `wdg-actions-lastcol` (aplicar na `<table>`): evita quebra de linha na última coluna (útil quando a última é "Ações").

- `.wdg-modal .btn-date-icon { display: none; }` já incluso para esconder o ícone do simple-datepicker dentro de modais quando necessário.

## Exemplo mínimo

```html
<div class="modal-dialog modal-xl modal-dialog-scrollable">
  <div class="modal-content wdg-modal">
    <div class="modal-header">...</div>
    <div class="modal-body">
      <div class="table-responsive wdg-scroll-2">
        <table class="table table-sm align-middle wdg-table-centered wdg-sticky-head wdg-actions-lastcol">
          <thead>
            <tr>
              <th>Coluna</th>
              <th>Outra</th>
              <th class="actions-col">Ações</th>
            </tr>
          </thead>
          <tbody>...</tbody>
        </table>
      </div>
    </div>
  </div>
</div>
```

## Dicas

- Para inputs de data com calendário: use `simple-datepicker.js` (já utilizado em outras páginas) e classes `datepicker` + `data-formato="br"`. O CSS dos modais não interfere nesse comportamento.
- Para manter consistência, prefira `table table-sm align-middle` e os utilitários deste guia.
- Evite estilos inline; use as classes acima para facilitar manutenção e reutilização.
