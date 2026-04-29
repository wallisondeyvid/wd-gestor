import test from 'node:test';
import assert from 'node:assert/strict';
import { requireLogin } from '../src/modules/gestor/app/middlewares/requireLogin.js';
import * as userModel from '../models/user.js';
import * as funcionarioModel from '../models/Funcionario.js';
import * as unidadeModel from '../models/unidade.js';

function mockRes() {
  const r = { statusCode: 200, redirectUrl: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.redirect = (u) => { r.redirectUrl = u; return r; };
  r.set = () => r;
  r.json = (p) => { r.jsonPayload = p; return r; };
  r.end = () => r;
  return r;
}

test('requireLogin redireciona sem sessão', async () => {
  const req = { session: null, originalUrl: '/privado' };
  const res = mockRes();
  let nextCalled = false;

  await requireLogin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  // Aceita com ou sem ?r=
  assert.ok(
    res.redirectUrl === '/login' ||
    (typeof res.redirectUrl === 'string' && res.redirectUrl.startsWith('/login')),
    `redirect inesperado: ${res.redirectUrl}`
  );
});

test('requireLogin popula req.user para user master', async () => {
  const originalFindOneUser = userModel.default.findOne;
  const originalFindOneUnidade = unidadeModel.default.findOne;
  try {
    userModel.default.findOne = () => ({
      lean() { return { _id: 'u1', email: 'x@y', role: 'master', foto: null, unidade_id: null }; },
      exec() { return Promise.resolve({ _id: 'u1', email: 'x@y', role: 'master', foto: null, unidade_id: null }); }
    });
    unidadeModel.default.findOne = () => ({
      lean() { return { _id: 'un1', is_principal: true }; },
      exec() { return Promise.resolve({ _id: 'un1', is_principal: true }); }
    });

    const req = { session: { user: { email: 'x@y' } } };
    const res = mockRes();
    let nextCalled = false;

    await requireLogin(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(req.user.role, 'master');
    assert.equal(req.user.isMaster, true);
    assert.equal(String(req.user.unidade_id), 'un1');
  } finally {
    userModel.default.findOne = originalFindOneUser;
    unidadeModel.default.findOne = originalFindOneUnidade;
  }
});

test('quando User não é encontrado, mas há funcionario_id válido na sessão, autentica por Funcionario via id', async () => {
  const originalFindOneUser = userModel.default.findOne;
  const originalFindByIdFuncionario = funcionarioModel.default.findById;
  const originalFindOneFuncionario = funcionarioModel.default.findOne;
  try {
    userModel.default.findOne = () => ({
      lean() { return null; },
      exec() { return Promise.resolve(null); }
    });

    funcionarioModel.default.findOne = () => {
      throw new Error('findOne de Funcionario não deve ser chamado no fallback por funcionario_id');
    };

    let findByIdArg = null;
    funcionarioModel.default.findById = (id) => {
      findByIdArg = id;
      return {
        populate(path) {
          assert.equal(path, 'unidade_id funcao_id');
          return {
            _id: '651000000000000000000123',
            nome: 'Funcionario Fallback',
            email: 'funcionario@empresa.com',
            foto: null,
            unidade_id: {
              _id: '661000000000000000000001',
              is_principal: false,
              unidade_principal_id: '661000000000000000000099'
            },
            funcao_id: { nome: 'Operador' }
          };
        }
      };
    };

    const req = {
      session: {
        user: {
          email: 'nao-usar@empresa.com',
          funcionario_id: '651000000000000000000123'
        }
      },
      originalUrl: '/privado'
    };
    const res = mockRes();
    let nextCalled = false;

    await requireLogin(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(res.redirectUrl, null);
    assert.equal(findByIdArg, '651000000000000000000123');
    assert.equal(String(req.user.id), '651000000000000000000123');
    assert.equal(req.user.email, 'funcionario@empresa.com');
    assert.equal(req.user.role, 'user');
    assert.equal(req.user.isMaster, false);
    assert.equal(String(req.user.unidade_id), '661000000000000000000001');
    assert.equal(String(req.user.unidade_principal_id), '661000000000000000000099');
    assert.equal(req.user.funcao, 'Operador');
  } finally {
    userModel.default.findOne = originalFindOneUser;
    funcionarioModel.default.findById = originalFindByIdFuncionario;
    funcionarioModel.default.findOne = originalFindOneFuncionario;
  }
});

test('quando User não é encontrado e não há funcionario_id confiável na sessão, redireciona para login', async () => {
  const originalFindOneUser = userModel.default.findOne;
  const originalFindByIdFuncionario = funcionarioModel.default.findById;
  const originalFindOneFuncionario = funcionarioModel.default.findOne;
  try {
    userModel.default.findOne = () => ({
      lean() { return null; },
      exec() { return Promise.resolve(null); }
    });

    funcionarioModel.default.findOne = () => {
      throw new Error('findOne de Funcionario não deve ser chamado sem funcionario_id confiável');
    };

    funcionarioModel.default.findById = () => {
      throw new Error('findById de Funcionario não deve ser chamado sem funcionario_id confiável');
    };

    const req = {
      session: {
        user: {
          email: 'nao-usar@empresa.com',
          funcionario_id: 'invalido'
        }
      },
      originalUrl: '/privado'
    };
    const res = mockRes();
    let nextCalled = false;

    await requireLogin(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.ok(
      res.redirectUrl === '/login' ||
      (typeof res.redirectUrl === 'string' && res.redirectUrl.startsWith('/login')),
      `redirect inesperado: ${res.redirectUrl}`
    );
  } finally {
    userModel.default.findOne = originalFindOneUser;
    funcionarioModel.default.findById = originalFindByIdFuncionario;
    funcionarioModel.default.findOne = originalFindOneFuncionario;
  }
});

test('requireLogin mantém o comportamento atual com flag desligada mesmo se a sessão tiver needs_selection=true', async () => {
  const req = {
    path: '/dashboard',
    baseUrl: '/gestor',
    originalUrl: '/gestor/dashboard',
    headers: { accept: 'text/html' },
    app: {
      locals: {
        skipDb: true,
        gestorAuthContextFeatureFlags: {
          gestor_auth_context_resolver: false,
        },
      },
    },
    session: {
      user: {
        id: 'u1',
        email: 'x@y',
      },
      gestorAuthContext: {
        needs_selection: true,
        active_membership_id: null,
        active_unidade_id: null,
      },
    },
  };
  const res = mockRes();
  let nextCalled = false;

  await requireLogin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.redirectUrl, null);
  assert.equal(res.statusCode, 200);
});

test('requireLogin redireciona páginas protegidas para /gestor/login?step=select quando há seleção pendente', async () => {
  const req = {
    path: '/dashboard',
    baseUrl: '/gestor',
    originalUrl: '/gestor/dashboard',
    headers: { accept: 'text/html' },
    app: {
      locals: {
        skipDb: true,
        gestorAuthContextFeatureFlags: {
          gestor_auth_context_resolver: true,
        },
      },
    },
    session: {
      user: {
        id: 'u1',
        email: 'x@y',
      },
      gestorAuthContext: {
        needs_selection: true,
        active_membership_id: null,
        active_unidade_id: null,
      },
    },
  };
  const res = mockRes();
  let nextCalled = false;

  await requireLogin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.redirectUrl, '/gestor/login?step=select');
});

test('requireLogin responde 409 funcional em APIs protegidas quando há seleção pendente', async () => {
  const req = {
    path: '/api/unidades',
    baseUrl: '/gestor',
    originalUrl: '/gestor/api/unidades',
    headers: { accept: 'application/json' },
    app: {
      locals: {
        skipDb: true,
        gestorAuthContextFeatureFlags: {
          gestor_auth_context_resolver: true,
        },
      },
    },
    session: {
      user: {
        id: 'u1',
        email: 'x@y',
      },
      gestorAuthContext: {
        needs_selection: true,
        active_membership_id: null,
        active_unidade_id: null,
      },
    },
  };
  const res = mockRes();
  let nextCalled = false;

  await requireLogin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.jsonPayload, {
    success: false,
    authenticated: true,
    error: 'Seleção de unidade pendente',
    code: 'GESTOR_SELECTION_REQUIRED',
    needsUnitSelection: true,
    redirect: '/gestor/login?step=select',
  });
});

test('requireLogin preserva /api/usuario durante seleção pendente', async () => {
  const req = {
    path: '/api/usuario',
    baseUrl: '/gestor',
    originalUrl: '/gestor/api/usuario',
    headers: { accept: 'application/json' },
    app: {
      locals: {
        skipDb: true,
        gestorAuthContextFeatureFlags: {
          gestor_auth_context_resolver: true,
        },
      },
    },
    session: {
      user: {
        id: 'u1',
        email: 'x@y',
      },
      gestorAuthContext: {
        needs_selection: true,
        active_membership_id: null,
        active_unidade_id: null,
      },
    },
  };
  const res = mockRes();
  let nextCalled = false;

  await requireLogin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.redirectUrl, null);
  assert.equal(res.jsonPayload, undefined);
});

test('requireLogin preserva /api/modulos durante seleção pendente', async () => {
  const req = {
    path: '/api/modulos',
    baseUrl: '/gestor',
    originalUrl: '/gestor/api/modulos',
    headers: { accept: 'application/json' },
    app: {
      locals: {
        skipDb: true,
        gestorAuthContextFeatureFlags: {
          gestor_auth_context_resolver: true,
        },
      },
    },
    session: {
      user: {
        id: 'u1',
        email: 'x@y',
      },
      gestorAuthContext: {
        needs_selection: true,
        active_membership_id: null,
        active_unidade_id: null,
      },
    },
  };
  const res = mockRes();
  let nextCalled = false;

  await requireLogin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.redirectUrl, null);
  assert.equal(res.jsonPayload, undefined);
});

test('requireLogin reidrata req.user e req.session.user a partir do auth-context canônico já selecionado', async () => {
  const originalFindOneUser = userModel.default.findOne;
  const originalFindByIdUnidade = unidadeModel.default.findById;
  const originalFindOneUnidade = unidadeModel.default.findOne;
  const originalNodeEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'test';
    userModel.default.findOne = () => ({
      lean() {
        return {
          _id: 'u1',
          nome: 'Usuário DB',
          email: 'x@y',
          role: 'user',
          foto: 'db.png',
          unidade_id: 'legacy-unit',
          funcionario_id: 'funcionario-db-legado',
        };
      },
      exec() {
        return Promise.resolve({
          _id: 'u1',
          nome: 'Usuário DB',
          email: 'x@y',
          role: 'user',
          foto: 'db.png',
          unidade_id: 'legacy-unit',
          funcionario_id: 'funcionario-db-legado',
        });
      }
    });
    unidadeModel.default.findById = () => ({
      lean() {
        return {
          _id: 'legacy-unit',
          is_principal: false,
          unidade_principal_id: 'legacy-principal',
        };
      },
      exec() {
        return Promise.resolve({
          _id: 'legacy-unit',
          is_principal: false,
          unidade_principal_id: 'legacy-principal',
        });
      }
    });
    unidadeModel.default.findOne = () => ({
      lean() { return null; },
      exec() { return Promise.resolve(null); }
    });

    const req = {
      path: '/dashboard',
      baseUrl: '/gestor',
      originalUrl: '/gestor/dashboard',
      headers: { accept: 'text/html' },
      app: {
        locals: {
          gestorAuthContextFeatureFlags: {
            gestor_auth_context_resolver: true,
          },
          gestorAuthContextResolverDeps: {
            async loadActiveMembershipsByUserId({ userId }) {
              return [
                {
                  _id: 'mem-legado',
                  user_id: userId,
                  unidade_id: 'legacy-unit',
                  papel_contextual: 'user',
                  funcionario_id: 'funcionario-legado',
                },
                {
                  _id: 'mem-canonica',
                  user_id: userId,
                  unidade_id: 'unit-canonical',
                  papel_contextual: 'gestor',
                  funcionario_id: 'funcionario-canonico',
                },
              ];
            },
            async loadUnidadeById({ unidadeId }) {
              if (unidadeId === 'unit-canonical') {
                return {
                  _id: 'unit-canonical',
                  is_principal: false,
                  unidade_principal_id: 'principal-canonical',
                  nome: 'Unidade Canônica',
                  codigo: 'UC1',
                };
              }
              if (unidadeId === 'legacy-unit') {
                return {
                  _id: 'legacy-unit',
                  is_principal: false,
                  unidade_principal_id: 'legacy-principal',
                  nome: 'Unidade Legada',
                  codigo: 'UL1',
                };
              }
              return null;
            },
          },
        },
      },
      session: {
        user: {
          id: 'u1',
          email: 'x@y',
          nome: 'Sessão Atual',
          role: 'user',
          unidade_id: 'legacy-session-unit',
          unidade_principal_id: 'legacy-session-principal',
          funcionario_id: 'funcionario-session-legado',
          funcao: 'Analista',
        },
        gestorAuthContext: {
          needs_selection: false,
          active_membership_id: 'mem-canonica',
          active_unidade_id: 'unit-canonical',
          global_role: null,
        },
      },
    };
    const res = mockRes();
    let nextCalled = false;

    await requireLogin(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(res.redirectUrl, null);
    assert.equal(req.user.role, 'diretor');
    assert.equal(req.user.global_role, null);
    assert.equal(String(req.user.unidade_id), 'unit-canonical');
    assert.equal(String(req.user.unidade_principal_id), 'principal-canonical');
    assert.equal(String(req.user.funcionario_id), 'funcionario-canonico');
    assert.equal(req.session.user.role, 'diretor');
    assert.equal(req.session.user.global_role, null);
    assert.equal(String(req.session.user.unidade_id), 'unit-canonical');
    assert.equal(String(req.session.user.unidade_principal_id), 'principal-canonical');
    assert.equal(String(req.session.user.funcionario_id), 'funcionario-canonico');
    assert.equal(req.session.user.auth_version, 'phase3');
  } finally {
    process.env.NODE_ENV = originalNodeEnv;
    userModel.default.findOne = originalFindOneUser;
    unidadeModel.default.findById = originalFindByIdUnidade;
    unidadeModel.default.findOne = originalFindOneUnidade;
  }
});

test('requireLogin mantém rotas protegidas funcionando quando o contexto já está completo', async () => {
  const req = {
    path: '/dashboard',
    baseUrl: '/gestor',
    originalUrl: '/gestor/dashboard',
    headers: { accept: 'text/html' },
    app: {
      locals: {
        skipDb: true,
        gestorAuthContextFeatureFlags: {
          gestor_auth_context_resolver: true,
        },
      },
    },
    session: {
      user: {
        id: 'u1',
        email: 'x@y',
        role: 'diretor',
        unidade_id: 'un1',
      },
      gestorAuthContext: {
        needs_selection: false,
        active_membership_id: 'mem1',
        active_unidade_id: 'un1',
        legacy_role: 'diretor',
      },
    },
  };
  const res = mockRes();
  let nextCalled = false;

  await requireLogin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.redirectUrl, null);
  assert.equal(res.statusCode, 200);
});

test('requireLogin não reidrata unidade legada da sessão quando o auth-context phase3 está autoritativo sem contexto ativo', async () => {
  const req = {
    path: '/dashboard',
    baseUrl: '/gestor',
    originalUrl: '/gestor/dashboard',
    headers: { accept: 'text/html' },
    app: {
      locals: {
        skipDb: true,
        gestorAuthContextFeatureFlags: {
          gestor_auth_context_resolver: true,
        },
      },
    },
    session: {
      user: {
        id: 'u1',
        email: 'admin@example.com',
        role: 'admin',
        global_role: 'admin',
        unidade_id: 'legacy-session-unit',
        unidade_principal_id: 'legacy-session-principal',
        funcionario_id: 'legacy-session-funcionario',
        auth_version: 'phase3',
      },
      gestorAuthContext: {
        needs_selection: false,
        global_role: 'admin',
        active_membership_id: null,
        active_unidade_id: null,
        active_unidade_principal_id: null,
        active_funcionario_id: null,
      },
    },
  };
  const res = mockRes();
  let nextCalled = false;

  await requireLogin(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, true);
  assert.equal(res.redirectUrl, null);
  assert.equal(res.statusCode, 200);
  assert.equal(req.user.role, 'admin');
  assert.equal(req.user.global_role, 'admin');
  assert.equal(req.user.unidade_id, null);
  assert.equal(req.user.unidade_principal_id, null);
  assert.equal(req.user.funcionario_id, null);
}
);