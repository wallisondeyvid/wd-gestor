// Cliente genérico de integrações bancárias. Esta implementação centraliza as
// regras de autenticação e entrega um ponto único para todos os módulos do
// WD Gestor conversarem com APIs externas de bancos.
import axios from 'axios';
import https from 'https';
import fs from 'fs/promises';

import Unidade from '#models/unidade.js';
import decrypt from '#core/security/decrypt.js'; // função existente no core (não implementar aqui)

const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_HEADERS = { 'Content-Type': 'application/json', Accept: 'application/json' };

// Faz uma chamada HTTP autenticada usando as credenciais salvas na unidade.
export async function callBankApi(unidadeId, { method = 'GET', path = '/', data, params = {}, headers = {} } = {}) {
  if (!unidadeId) throw new Error('ID da unidade é obrigatório.');

  const unidade = await Unidade.findById(unidadeId).lean();
  if (!unidade) throw new Error('Unidade não encontrada.');

  const cfg = unidade.apiBancaria || {};
  const baseUrl = (cfg.apiBaseUrl || '').trim();
  if (!baseUrl) throw new Error('Base URL da API não configurada.');

  const url = resolveUrl(baseUrl, path);
  const authContext = await buildAuth(unidade);

  const requestConfig = {
    method: method.toLowerCase(),
    url,
    data,
    headers: { ...DEFAULT_HEADERS, ...authContext.headers, ...headers },
    params: { ...authContext.extraQuery, ...params },
    timeout: DEFAULT_TIMEOUT_MS,
    httpsAgent: authContext.httpsAgent,
    validateStatus: null
  };

  try {
    const response = await axios(requestConfig);
    if (response.status >= 200 && response.status < 300) {
      return response.data;
    }
    throw new Error(formatAxiosMessage(response));
  } catch (error) {
    if (error.response) {
      const formatted = formatAxiosMessage(error.response);
      throw new Error(formatted || 'Requisição ao banco falhou');
    }
    if (error.request) {
      throw new Error('Requisição ao banco falhou (sem resposta).');
    }
    throw new Error(error.message || 'Requisição ao banco falhou');
  }
}

// Monta cabeçalhos/queries adicionais (e agent HTTPS quando for mTLS) com base
// no tipo de autenticação definido para a unidade.
export async function buildAuth(unidade) {
  const cfg = unidade?.apiBancaria || {};
  const tipo = (cfg.tipoAutenticacaoAPI || '').toLowerCase();
  const headers = {};
  const extraQuery = {};
  let httpsAgent;

  switch (tipo) {
    case 'api-key-header': {
      if (!cfg.apiHeaderName || !cfg.apiHeaderValue) break;
      headers[cfg.apiHeaderName] = safeDecrypt(cfg.apiHeaderValue);
      break;
    }
    case 'api-key-query': {
      if (!cfg.apiQueryParamName || !cfg.apiQueryParamValue) break;
      extraQuery[cfg.apiQueryParamName] = safeDecrypt(cfg.apiQueryParamValue);
      break;
    }
    case 'basic': {
      if (!cfg.apiBasicUser || !cfg.apiBasicPassword) break;
      const user = safeDecrypt(cfg.apiBasicUser);
      const pass = safeDecrypt(cfg.apiBasicPassword);
      headers.Authorization = `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
      break;
    }
    case 'oauth2': {
      const token = await getOAuthTokenFromConfig(cfg);
      headers.Authorization = `Bearer ${token}`;
      break;
    }
    case 'mtls': {
      httpsAgent = await buildMtlsAgent(cfg);
      break;
    }
    default:
      break;
  }

  return { headers, extraQuery, httpsAgent };
}

// Obtém um token OAuth2 usando o fluxo client-credentials configurado na unidade.
export async function getOAuthTokenFromConfig(cfg = {}) {
  const tokenUrl = (cfg.apiOauthTokenUrl || '').trim();
  if (!tokenUrl) throw new Error('Token URL de OAuth2 não configurada.');

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('client_id', safeDecrypt(cfg.apiOauthClientId));
  params.append('client_secret', safeDecrypt(cfg.apiOauthClientSecret));
  if (cfg.apiOauthScope) params.append('scope', cfg.apiOauthScope);

  try {
    const response = await axios.post(tokenUrl, params, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: DEFAULT_TIMEOUT_MS
    });
    const token = response.data?.access_token;
    if (!token) throw new Error('Falha na autenticação OAuth2');
    return token;
  } catch (error) {
    throw new Error('Falha na autenticação OAuth2');
  }
}

// Cria https.Agent com certificado cliente para cenários mTLS.
async function buildMtlsAgent(cfg) {
  const certPath = (cfg.apiMtlsCertFilePath || '').trim();
  if (!certPath) throw new Error('Arquivo de certificado mTLS não encontrado.');

  try {
    const pfx = await fs.readFile(certPath);
    const passphrase = cfg.apiMtlsPassword ? safeDecrypt(cfg.apiMtlsPassword) : undefined;
    return new https.Agent({ pfx, passphrase, rejectUnauthorized: true });
  } catch (error) {
    throw new Error('Arquivo de certificado mTLS não encontrado.');
  }
}

function resolveUrl(base, path) {
  const trimmedPath = path || '';
  if (/^https?:\/\//i.test(trimmedPath)) return trimmedPath;
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedPath = trimmedPath.startsWith('/') ? trimmedPath.slice(1) : trimmedPath;
  return normalizedBase + normalizedPath;
}

// Wrapper seguro para decrypt (fornecido pelo core). Caso o módulo de
// criptografia não esteja disponível no ambiente atual, devolvemos o valor
// original para evitar quebra durante desenvolvimento/local.
function safeDecrypt(value) {
  if (!value) return value;
  try {
    return decrypt(value);
  } catch (_err) {
    return value;
  }
}

function formatAxiosMessage(response) {
  if (!response) return 'Requisição ao banco falhou';
  const status = response.status;
  const reason = response.data?.message || response.statusText || 'Erro desconhecido';
  return `Requisição ao banco falhou (${status}): ${reason}`;
}
