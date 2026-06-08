import assert from 'node:assert/strict';
import path from 'node:path';
import test, { after } from 'node:test';
import { registerHooks } from 'node:module';
import express from 'express';
import session from 'express-session';
import request from 'supertest';

const PROJECT_ROOT = process.cwd();

const IDS = Object.freeze({
  user: '65f300000000000000000001',
  unitA: '65f300000000000000000002',
  unitB: '65f300000000000000000003',
  principalA: '65f300000000000000000005',
  principalB: '65f300000000000000000006',
});

const unidades = Object.freeze({
  [IDS.unitA]: Object.freeze({
    _id: IDS.unitA,
    id: IDS.unitA,
    codigo: 'M0001',
    nome: 'Wd Gestor',
    ativa: true,
    is_principal: false,
    unidade_principal_id: IDS.principalA,
  }),
  [IDS.unitB]: Object.freeze({
    _id: IDS.unitB,
    id: IDS.unitB,
    codigo: 'M0002',
    nome: 'Wd Gestor Filial',
    ativa: true,
    is_principal: false,
    unidade_principal_id: IDS.principalB,
  }),
});

const runtimeState = {
  scopedFuncionarioCalls: [],
  scopedSetorCalls: [],
  scopedFuncaoCalls: [],
  privilegedUnidadeCalls: [],
};

globalThis.__GESTOR_FUNCIONARIOS_SWITCH_UNIT_RUNTIME_STATE__ = runtimeState;
globalThis.__GESTOR_FUNCIONARIOS_SWITCH_UNIT_RUNTIME_IDS__ = IDS;
globalThis.__GESTOR_FUNCIONARIOS_SWITCH_UNIT_RUNTIME_UNIDADES__ = unidades;

const AUTH_DB_MOCK_URL = 'mock:gestor-funcionarios-switch-unit-auth-db';
const AUTH_DB_BRIDGE_MOCK_URL = 'mock:gestor-funcionarios-switch-unit-auth-db-bridge';
const API_DB_BRIDGE_MOCK_URL = 'mock:gestor-funcionarios-switch-unit-api-db-bridge';
const FUNCIONARIO_REPOSITORY_MOCK_URL = 'mock:gestor-funcionarios-switch-unit-funcionario-repository';
const FUNCAO_REPOSITORY_MOCK_URL = 'mock:gestor-funcionarios-switch-unit-funcao-repository';
const SETOR_REPOSITORY_MOCK_URL = 'mock:gestor-funcionarios-switch-unit-setor-repository';
const UNIDADE_REPOSITORY_MOCK_URL = 'mock:gestor-funcionarios-switch-unit-unidade-repository';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '#modules/gestor/app/db/auth.db.js') {
      return { url: AUTH_DB_MOCK_URL, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/services/authDbBridgeService.js') {
      return { url: AUTH_DB_BRIDGE_MOCK_URL, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/services/apiDbBridgeService.js') {
      return { url: API_DB_BRIDGE_MOCK_URL, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/repositories/FuncionarioRepository.js') {
      return { url: FUNCIONARIO_REPOSITORY_MOCK_URL, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/repositories/FuncaoReadRepository.js') {
      return { url: FUNCAO_REPOSITORY_MOCK_URL, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/repositories/SetorReadRepository.js') {
      return { url: SETOR_REPOSITORY_MOCK_URL, shortCircuit: true };
    }

    if (specifier === '#modules/gestor/app/repositories/UnidadeReadRepository.js') {
      return { url: UNIDADE_REPOSITORY_MOCK_URL, shortCircuit: true };
    }

    return nextResolve(specifier, context);
  },

  load(url, context, nextLoad) {
    if (url === AUTH_DB_MOCK_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const IDS = globalThis.__GESTOR_FUNCIONARIOS_SWITCH_UNIT_RUNTIME_IDS__;',
          'export async function findUserLeanByEmail() {',
          '  return {',
          '    _id: IDS.user,',
          "    id: IDS.user,",
          "    email: 'master@gestor.test',",
          "    nome: 'Master Gestor',",
          "    role: 'master',",
          "    global_role: 'master',",
          '    unidade_id: IDS.unitA,',
          '    unidade_principal_id: IDS.principalA,',
          '    ativo: true,',
          '    primeiro_acesso: false,',
          '    senha_provisoria: false,',
          '  };',
          '}',
          'export async function findFuncionarioByIdPopulate() { return null; }',
          'export async function findUnidadeLeanById(id) { return globalThis.__GESTOR_FUNCIONARIOS_SWITCH_UNIT_RUNTIME_UNIDADES__?.[String(id)] || null; }',
          'export async function findUnidadePrincipalLean() { return null; }',
        ].join('\n'),
      };
    }

    if (url === AUTH_DB_BRIDGE_MOCK_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const unidades = globalThis.__GESTOR_FUNCIONARIOS_SWITCH_UNIT_RUNTIME_UNIDADES__ || {};',
          'export async function createRememberToken() { return null; }',
          'export async function findFuncaoByIdSelect() { return null; }',
          'export async function findFuncionarioByIdSelect() { return null; }',
          'export async function findModuloByOr() { return null; }',
          'export async function findModuloLeanByOrSelect() { return null; }',
          'export async function findUnidadeByIdSelect({ unidadeId }) { return unidades[String(unidadeId)] || null; }',
          'export async function findUserByEmail() { return null; }',
          'export async function revokeRememberTokenByHash() { return null; }',
          'export async function saveUserDocument(user) { return user; }',
        ].join('\n'),
      };
    }

    if (url === API_DB_BRIDGE_MOCK_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const unidades = globalThis.__GESTOR_FUNCIONARIOS_SWITCH_UNIT_RUNTIME_UNIDADES__ || {};',
          'const listUnidades = () => Object.values(unidades);',
          'const byId = (id) => unidades[String(id)] || null;',
          'const byIds = (ids = []) => ids.map((id) => byId(id)).filter(Boolean);',
          '',
          '// Unidades',
          'export async function findUnidadeByIdLean(id) { return byId(id); }',
          'export async function findUnidadeUserBaseLean(id) { return byId(id); }',
          'export async function findUnidadeById(id) { return byId(id); }',
          'export async function findUnidadesById(ids = []) { return byIds(ids); }',
          'export async function findUnidadesByIdsNomeCodigoLean(ids = []) { return byIds(ids); }',
          'export async function findAllUnidades() { return listUnidades(); }',
          'export async function findAllUnidadesLean() { return listUnidades(); }',
          'export async function findAllUnidadesSelectIdCodigoNomeLean() { return listUnidades(); }',
          'export async function findUnidadesByMatrizOuPrincipal() { return listUnidades(); }',
          'export async function findUnidadesByCondSelectCodigoNomeOrdenadasLean() { return listUnidades(); }',
          'export async function findUnidadesByCondLeanFull() { return listUnidades(); }',
          'export async function findUnidadesPrincipaisLean() { return listUnidades(); }',
          'export async function findUnidadesPrincipaisSelectIdLean() { return listUnidades(); }',
          'export async function findUnidadesPrincipais() { return listUnidades(); }',
          'export async function findUnidadesForSetorPageSelectLean() { return listUnidades(); }',
          'export async function findUnidadesForSetorPageByCondSelectLean() { return listUnidades(); }',
          'export async function findUnidadesForSetorPageByIdsSelectLean(ids = []) { return byIds(ids); }',
          '',
          '// Funcionários / usuários',
          'export async function findAllFuncionariosSelectIdNomeCpfLean() { return []; }',
          'export async function findFuncionariosByUnidadeIdsSelectIdNomeCpfLean() { return []; }',
          'export async function findUserMembershipsByUserIdsLean() { return []; }',
          'export async function findUserMembershipsUserIdsByUnidadeIdsLean() { return []; }',
          'export async function findUserMembershipUserIdsByUnidadeIdsLean() { return []; }',
          'export async function findUsuariosByUnidadeIdsLean() { return []; }',
          'export async function findUsuariosByIdsLean() { return []; }',
          'export async function findAllUsuariosLean() { return []; }',
          'export async function findAllUsersLean() { return []; }',
          'export async function findUsersByIdsExcludingMasterLean() { return []; }',
          'export async function findUsersByQueryLean() { return []; }',
          'export async function findUsersByUnidadeIdsExcludingMasterLean() { return []; }',
          'export async function findUsersByIdsLean() { return []; }',
          'export async function findUserByIdLean() { return null; }',
          'export async function findUserByEmailLean() { return null; }',
          'export async function findUsuarioByIdLean() { return null; }',
          'export async function findUsuarioByEmailLean() { return null; }',
          '',
          '// Módulos',
          'export async function findAllModulosBaseLean() { return []; }',
          'export async function findAllModulosLean() { return []; }',
          'export async function findModulosAtivosStatusLean() { return []; }',
          'export async function findModuloByIdLean() { return null; }',
          'export async function findModuloByOr() { return null; }',
          'export async function findModuloLeanByOrSelect() { return null; }',
          'export async function findUnidadeByIdWithModulosAcessiveisLean(id) { return byId(id); }',
          '',
          '// Funções',
          'export async function findAllFuncoesPopuladas() { return []; }',
          'export async function findFuncoesByUnidadePrincipalPopuladas() { return []; }',
          'export async function findFuncoesByUnidadePrincipalIdsPopuladas() { return []; }',
          'export async function findFuncoesAtivasNomeOrdenadasSelectLean() { return []; }',
          'export async function findFuncaoByIdSelect() { return null; }',
          '',
          '// Setores',
          'export async function findSetoresByCondNomeOrdenadosSelectLean() { return []; }',
          'export async function findSetoresByUnidadeIdPopulateLean() { return []; }',
          'export async function findSetoresByCondDescricaoPopulateUnidadeOrdenadosLean() { return []; }',
          '',
          '// Recursos / cadastros auxiliares',
          'export async function findAllRecursosLean() { return []; }',
          'export async function findAllMarcasLean() { return []; }',
          'export async function findAllCargosLean() { return []; }',
          'export async function findAllDepartamentosLean() { return []; }',
          'export async function findAllPermissoesLean() { return []; }',
          '',
          '// Fallbacks neutros para imports laterais do pagesRouter',
          'export async function countDocuments() { return 0; }',
          'export async function findOneLean() { return null; }',
          'export async function findManyLean() { return []; }',
        ].join('\n'),
      };
    }

    if (url === FUNCIONARIO_REPOSITORY_MOCK_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_FUNCIONARIOS_SWITCH_UNIT_RUNTIME_STATE__;',
          'export async function findFuncionarioByCpfAndUnidadeRepo() { return null; }',
          'export async function findAllFuncionariosSelectIdNomeCpfLeanRepo() { return []; }',
          'export async function findFuncionariosByUnidadeIdsSelectIdNomeCpfLeanRepo() { return []; }',
          'export async function findFuncionarioByIdSelectIdUnidadeUsuarioLeanRepo() { return null; }',
          'export async function findFuncionarioByCpfUnidadeSelectIdUnidadeEmailLeanRepo() { return null; }',
          'export async function findFuncionarioByEmailSelectIdUnidadeEmailLeanRepo() { return null; }',
          'export async function findFuncionarioByCpfOrEmailLeanRepo() { return null; }',
          'export async function unsetFuncionarioUsuarioIdByIdRepo() { return { modifiedCount: 0 }; }',
          'export async function setFuncionarioUsuarioIdByIdRepo() { return { modifiedCount: 0 }; }',
          'export async function unsetFuncionarioUsuarioIdIfMatchesUserRepo() { return { modifiedCount: 0 }; }',
          'export async function setFuncionarioUsuarioIdIfEmptyRepo() { return { modifiedCount: 0 }; }',
          'export async function findFuncionariosParaListagemComRefsSelectLeanRepo(args) {',
          '  const cloned = JSON.parse(JSON.stringify(args || {}));',
          '  if (cloned?.filtro?.unidade_id) state.scopedFuncionarioCalls.push(cloned);',
          '  return [];',
          '}',
          'export async function findFuncionariosDisponiveisSemUsuarioPorUnidadeSelectLeanRepo() { return []; }',
          'export async function findFuncionarioByEmailRepo() { return null; }',
          'export async function findFuncionariosByEmailsSelectEmailNomeLeanRepo() { return []; }',
          'export async function createFuncionarioDocRepo() { return {}; }',
          'export async function findFuncionarioByIdRepo() { return null; }',
          'export async function updateFuncionarioByIdWithOpsRepo() { return null; }',
          'export async function findFuncionarioByIdPopulateRefsRepo() { return null; }',
          'export async function findFuncionarioByIdLeanRepo() { return null; }',
          'export async function deleteFuncionarioByIdRepo() { return null; }',
          'export async function findFuncionariosDisponiveisByUnidadeLeanRepo() { return []; }',
          'export async function findFuncionarioByIdSelectBasicLeanRepo() { return null; }',
          'export async function findFuncionarioByCpfAndUnidadeSelectLeanRepo() { return null; }',
          'export async function findFuncionarioByEmailSelectLeanRepo() { return null; }',
        ].join('\n'),
      };
    }

    if (url === FUNCAO_REPOSITORY_MOCK_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_FUNCIONARIOS_SWITCH_UNIT_RUNTIME_STATE__;',
          'export async function findFuncaoByIdLeanRepo() { return null; }',
          'export async function findFuncoesByUnidadeLeanRepo() { return []; }',
          'export async function findFuncaoByNomeRepo() { return null; }',
          'export async function createFuncaoRepo() { return {}; }',
          'export async function findFuncaoByIdPopulatedRepo() { return null; }',
          'export async function findAllFuncoesPopuladasRepo() { return []; }',
          'export async function findFuncaoByIdRepo() { return null; }',
          'export async function findOutraFuncaoByNomeExcludingIdRepo() { return null; }',
          'export async function updateFuncaoByIdRepo() { return null; }',
          'export async function findFuncoesByFiltroLeanRepo() { return []; }',
          'export async function findFuncoesByFiltroSelectLeanRepo() { return []; }',
          'export async function deleteFuncaoByIdRepo() { return null; }',
          'export async function findFuncoesAtivasNomeOrdenadasSelectLeanRepo(args) { return []; }',
          'export async function findFuncoesByUnidadePrincipalIdsPopuladasRepo() { return []; }',
          'export async function findFuncoesByUnidadePrincipalPopuladasRepo(args) {',
          '  state.scopedFuncaoCalls.push(JSON.parse(JSON.stringify(args)));',
          '  return [];',
          '}',
        ].join('\n'),
      };
    }

    if (url === SETOR_REPOSITORY_MOCK_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_FUNCIONARIOS_SWITCH_UNIT_RUNTIME_STATE__;',
          'export async function findSetorByUnidadeAndNomeNormalizadoLeanRepo() { return null; }',
          'export async function createSetorRepo() { return {}; }',
          'export async function findSetorByIdPopulateUnidadeRepo() { return null; }',
          'export async function findSetorByIdRepo() { return null; }',
          'export async function findSetorDupByNomeNormalizadoExcludingIdRepo() { return null; }',
          'export async function findSetoresByFiltroPopulateUnidadeLeanRepo() { return []; }',
          'export async function findSetoresAtivosPopulateUnidadeOrdenadosLeanRepo() { return []; }',
          'export async function findSetoresByCondDescricaoPopulateUnidadeOrdenadosLeanRepo() { return []; }',
          'export async function findSetorByIdAndDeleteRepo() { return null; }',
          'export async function findMaxSetorCodigoLeanRepo() { return null; }',
          'export async function findSetoresAtivosNomeOrdenadosSelectLeanRepo() { return []; }',
          'export async function findCounterSetorCodigoLeanRepo() { return null; }',
          'export async function findOneAndUpdateCounterSetorCodigoRepo() { return null; }',
          'export async function findSetoresByCondNomeOrdenadosSelectLeanRepo(args) { return []; }',
          'export async function findSetoresByUnidadeIdPopulateLeanRepo(args) {',
          '  state.scopedSetorCalls.push(JSON.parse(JSON.stringify(args)));',
          '  return [];',
          '}',
        ].join('\n'),
      };
    }

    if (url === UNIDADE_REPOSITORY_MOCK_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: [
          'const state = globalThis.__GESTOR_FUNCIONARIOS_SWITCH_UNIT_RUNTIME_STATE__;',
          'const unidades = globalThis.__GESTOR_FUNCIONARIOS_SWITCH_UNIT_RUNTIME_UNIDADES__ || {};',
          'const listUnidades = () => Object.values(unidades);',
          'const byId = (id) => unidades[String(id)] || null;',
          'const byIds = (ids = []) => ids.map((id) => byId(id)).filter(Boolean);',
          'export function findUnidadeByIdLeanRepo({ unidadeId }) { return Promise.resolve(unidades[String(unidadeId)] || null); }',
          'export async function findSubunidadesLeanRepo() { return listUnidades(); }',
          'export async function findUnidadesByCondLeanRepo() { return listUnidades(); }',
          'export async function findUnidadeByCodigoLeanRepo() { return null; }',
          'export async function findUnidadeUserBaseLeanRepo({ id }) { return byId(id); }',
          'export async function findUnidadeByIdOrRawLeanRepo() { return null; }',
          'export async function findClusterUnidadesByAnchorLeanRepo() { return listUnidades(); }',
          'export async function findAllUnidadesLeanRepo() { return listUnidades(); }',
          'export async function findAllUnidadesSelectIdCodigoNomeLeanRepo() { return listUnidades(); }',
          'export async function findAllUnidadesRepo() { return listUnidades(); }',
          'export async function findUnidadesByMatrizOuPrincipalRepo() { return listUnidades(); }',
          'export async function findUnidadesAtivasStatusLeanRepo() { return listUnidades(); }',
          'export async function findUnidadePrincipalLeanRepo() { return null; }',
          'export async function findUnidadeByIdWithModulosAcessiveisLeanRepo() { return null; }',
          'export async function findUnidadeByIdRepo({ setorUnidadeId }) { return byId(setorUnidadeId); }',
          'export async function findUnidadeUserBaseSetorLeanRepo({ id }) { return byId(id); }',
          'export async function findUnidadesAtivasNomeCodigoOrdenadasLeanRepo() { return listUnidades(); }',
          'export async function findUnidadesByIdsNomeCodigoLeanRepo({ unidadeIds = [] }) { return byIds(unidadeIds); }',
          'export async function findUnidadesForSetorPageSelectLeanRepo() { return listUnidades(); }',
          'export async function findUnidadesForSetorPageByCondSelectLeanRepo() { return listUnidades(); }',
          'export async function findUnidadesForSetorPageByIdsSelectLeanRepo({ unidadeIds = [] }) { return byIds(unidadeIds); }',
          'export async function findUnidadeByIdWithModulosAcessiveisRepo() { return null; }',
          'export async function findUnidadesAtivasCodigoNomeOrdenadasSelectLeanRepo() { return listUnidades(); }',
          'export async function findUnidadesPrincipaisRepo() { return Object.values(unidades); }',
          'export async function findUnidadesPrincipaisSelectIdLeanRepo() { return Object.values(unidades); }',
          'export async function findUnidadesByCondLeanFullRepo() { return listUnidades(); }',
          'export async function findUltimaUnidadePorCodigoRepo() { return null; }',
          'export async function findUnidadeByCodigoRepo() { return null; }',
          'export async function findUnidadeByCpfRepo() { return null; }',
          'export async function findUnidadeByCnpjRepo() { return null; }',
          'export async function findSubunidadesByUnidadePrincipalRepo() { return listUnidades(); }',
          'export async function createUnidadeDocRepo() { return {}; }',
          'export async function findUnidadeByCpfExcludingIdRepo() { return null; }',
          'export async function findUnidadeByCnpjExcludingIdRepo() { return null; }',
          'export async function findUnidadesPrincipaisByIdsRepo({ unitIds = [] }) { return byIds(unitIds); }',
          'export async function findUnidadesPrincipaisLeanRepo() { return listUnidades(); }',
          'export async function findUnidadesByIdRepo({ unidadeId }) { return byId(unidadeId); }',
          'export async function updateManyUnidadesAccessByIdsRepo() { return { modifiedCount: 0 }; }',
          'export async function findUnidadesPermitidasByMatrizRefRepo() { return listUnidades(); }',
          'export async function findUnidadesByCondSelectCodigoNomeOrdenadasLeanRepo(args) {',
          '  state.privilegedUnidadeCalls.push(JSON.parse(JSON.stringify(args)));',
          '  return Object.values(unidades);',
          '}',
        ].join('\n'),
      };
    }

    return nextLoad(url, context);
  },
});

after(() => {
  delete globalThis.__GESTOR_FUNCIONARIOS_SWITCH_UNIT_RUNTIME_STATE__;
  delete globalThis.__GESTOR_FUNCIONARIOS_SWITCH_UNIT_RUNTIME_IDS__;
  delete globalThis.__GESTOR_FUNCIONARIOS_SWITCH_UNIT_RUNTIME_UNIDADES__;
});

function resetRuntimeState() {
  runtimeState.scopedFuncionarioCalls.length = 0;
  runtimeState.scopedSetorCalls.length = 0;
  runtimeState.scopedFuncaoCalls.length = 0;
  runtimeState.privilegedUnidadeCalls.length = 0;
}

function createResolverDeps() {
  return {
    async loadActiveMembershipsByUserId() {
      throw new Error('Master/Admin global nao deve carregar memberships explicitas para switch-unit');
    },
    async loadUnidadeById({ unidadeId }) {
      return unidades[unidadeId] || null;
    },
  };
}

async function createAuthApp({ sessionUser, authenticatedUser, existingAuthContext }) {
  const [{ default: authRouter }, { default: pagesRouter }] = await Promise.all([
    import('#modules/gestor/app/routes/auth.js'),
    import('#modules/gestor/app/routes/pagesRouter.js'),
  ]);

  const app = express();

  app.set('views', [
    path.join(PROJECT_ROOT, 'views/gestor'),
    path.join(PROJECT_ROOT, 'views'),
  ]);
  app.set('view engine', 'ejs');

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(session({
    secret: 'gestor-funcionarios-switch-unit-runtime',
    resave: false,
    saveUninitialized: true,
  }));

  app.locals.gestorAuthContextFeatureFlags = { gestor_auth_context_resolver: true };
  app.locals.gestorAuthContextResolverDeps = createResolverDeps();
  app.locals.gestorAuthContextMaxTimeMS = 4321;

  app.use('/gestor', (req, res, next) => {
    res.locals.basePath = req.baseUrl || '/gestor';
    res.locals.assetVersion = 'test';
    next();
  });

  app.use('/gestor', (req, _res, next) => {
    if (sessionUser && !req.session.__seededSessionUser) {
      req.session.user = { ...sessionUser };
      req.session.__seededSessionUser = true;
    }

    if (existingAuthContext && !req.session.__seededGestorAuthContext) {
      req.session.gestorAuthContext = { ...existingAuthContext };
      req.session.__seededGestorAuthContext = true;
    }

    if (authenticatedUser) {
      req.user = { ...authenticatedUser };
    }

    next();
  });

  app.use('/gestor', authRouter);
  app.use('/gestor', pagesRouter);

  return app;
}

function assertContains(haystack, needle, message) {
  assert.ok(haystack.includes(needle), message || `Esperava encontrar: ${needle}`);
}

function assertDoesNotContain(haystack, needle, message) {
  assert.equal(haystack.includes(needle), false, message || `Nao esperava encontrar: ${needle}`);
}

test('POST switch-unit real não força banner ou seletor manual em GET /gestor/funcionarios', async () => {
  resetRuntimeState();

  const sessionUser = {
    id: IDS.user,
    email: 'master@gestor.test',
    nome: 'Master Gestor',
    role: 'master',
    global_role: 'master',
    unidade_id: IDS.unitA,
    unidade_principal_id: IDS.principalA,
    auth_version: 'phase3',
  };

  const authenticatedUser = {
    _id: IDS.user,
    id: IDS.user,
    email: 'master@gestor.test',
    nome: 'Master Gestor',
    role: 'master',
    global_role: 'master',
    unidade_id: IDS.unitA,
    unidade_principal_id: IDS.principalA,
  };

  const app = await createAuthApp({
    sessionUser,
    authenticatedUser,
    existingAuthContext: {
      source: 'auth-context-v1',
      user_id: IDS.user,
      user_email: 'master@gestor.test',
      global_role: 'master',
      active_membership_id: `global:${IDS.unitA}`,
      active_unidade_id: IDS.unitA,
      active_unidade_principal_id: IDS.principalA,
      active_papel_contextual: 'gestor',
      active_funcionario_id: null,
      legacy_role: 'master',
      needs_selection: false,
    },
  });

  const agent = request.agent(app);

  const switchRes = await agent
    .post('/gestor/auth/switch-unit')
    .send({ unidade_id: IDS.unitB });

  assert.equal(switchRes.status, 200);
  assert.equal(switchRes.body.ok, true);
  assert.equal(switchRes.body.activeContext?.unidadeId, IDS.unitB);
  assert.equal(switchRes.body.activeContext?.unidadePrincipalId, IDS.principalB);
  assert.equal(switchRes.body.effectiveRole, 'master');

  const contextRes = await agent.get('/gestor/auth/context');

  assert.equal(contextRes.status, 200);
  assert.equal(contextRes.body.ok, true);
  assert.equal(contextRes.body.activeContext?.unidadeId, IDS.unitB);
  assert.equal(contextRes.body.activeContext?.unidadePrincipalId, IDS.principalB);

const pageRes = await agent.get('/gestor/funcionarios');

assert.equal(pageRes.status, 200);
assertContains(pageRes.text, 'Cadastrar Funcionário');
assertContains(pageRes.text, 'formFuncionario');

assertDoesNotContain(pageRes.text, 'id="gestor-funcionarios-unidade-ativa-banner"');
assertDoesNotContain(pageRes.text, 'gestorFuncionariosGlobalUnidadeSelect');
assertDoesNotContain(pageRes.text, 'gestorFuncionariosGlobalTrocarUnidadeBtn');
assertDoesNotContain(pageRes.text, 'gestorFuncionariosGlobalAtivarUnidadeBtn');
assertDoesNotContain(pageRes.text, 'gestorFuncionariosGlobalSwitchFeedback');
assertDoesNotContain(pageRes.text, 'Modo global de consulta');
assertDoesNotContain(pageRes.text, 'Funcionários - Consulta Global');
assertDoesNotContain(pageRes.text, 'data-unidade-ativa-id=');

assert.equal(runtimeState.scopedFuncionarioCalls.length, 1);
assert.equal(runtimeState.scopedFuncionarioCalls[0].filtro.unidade_id, IDS.unitB);

assert.equal(runtimeState.scopedSetorCalls.length, 1);
assert.equal(runtimeState.scopedSetorCalls[0].unidadeId, IDS.unitB);

assert.equal(runtimeState.scopedFuncaoCalls.length, 1);
assert.equal(runtimeState.scopedFuncaoCalls[0].unidadePrincipalId, IDS.principalB);

assert.equal(runtimeState.privilegedUnidadeCalls.length, 1);
});
