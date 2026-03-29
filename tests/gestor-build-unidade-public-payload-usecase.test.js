import test from 'node:test';
import assert from 'node:assert/strict';

import { buildUnidadePublicPayload } from '../src/modules/gestor/app/usecases/unidades/buildUnidadePublicPayload.js';

test('buildUnidadePublicPayload monta o payload publico minimo com logo relativo exposto via rota', () => {
  const payload = buildUnidadePublicPayload({
    unidade: {
      _id: 'u-publica',
      nome: 'Clinica Alpha',
      razaoSocial: 'Clinica Alpha LTDA',
      endereco: 'Rua 1',
      telefoneFixo: '1133334444',
      telefoneCelular: '1199998888',
      emailPrincipal: 'contato@alpha.test',
      banco: '001',
      agencia: '1234',
      contaCorrente: '99999-0',
      pixChave: 'pix@alpha.test',
      tipoPix: 'email',
      is_principal: 'sim',
      subunidade: 0,
      logo: 'uploads/unidades/logo.png',
      apiBancaria: { segredo: 'nao deve vazar' },
      cnpj: '00.000.000/0001-00',
    },
  });

  assert.deepEqual(payload, {
    _id: 'u-publica',
    nome: 'Clinica Alpha',
    razaoSocial: 'Clinica Alpha LTDA',
    endereco: 'Rua 1',
    telefone: '1199998888',
    emailPrincipal: 'contato@alpha.test',
    banco: '001',
    agencia: '1234',
    contaCorrente: '99999-0',
    pixChave: 'pix@alpha.test',
    tipoPix: 'email',
    is_principal: true,
    subunidade: false,
    logoUrl: '/api/unidades/u-publica/logo',
  });
  assert.equal('apiBancaria' in payload, false);
  assert.equal('cnpj' in payload, false);
  assert.equal('logoDataUrl' in payload, false);
});

test('buildUnidadePublicPayload preserva logoUrl HTTP publica', () => {
  const payload = buildUnidadePublicPayload({
    unidade: {
      _id: 'u-http',
      nome: 'Clinica HTTP',
      logo: 'https://cdn.example.test/logo.webp',
    },
  });

  assert.equal(payload.logoUrl, 'https://cdn.example.test/logo.webp');
  assert.equal('logoDataUrl' in payload, false);
});

test('buildUnidadePublicPayload expõe data URL em logoDataUrl quando esse é o formato persistido', () => {
  const dataUrl = 'data:image/webp;base64,AAAA';
  const payload = buildUnidadePublicPayload({
    unidade: {
      _id: 'u-data',
      nome: 'Clinica Data URL',
      logo: dataUrl,
    },
  });

  assert.equal(payload.logoDataUrl, dataUrl);
  assert.equal('logoUrl' in payload, false);
});

test('buildUnidadePublicPayload devolve logoUrl nulo quando nao ha logo persistida', () => {
  const payload = buildUnidadePublicPayload({
    unidade: {
      _id: 'u-sem-logo',
      nome: 'Clinica Sem Logo',
    },
  });

  assert.equal(payload.logoUrl, null);
  assert.equal('logoDataUrl' in payload, false);
});