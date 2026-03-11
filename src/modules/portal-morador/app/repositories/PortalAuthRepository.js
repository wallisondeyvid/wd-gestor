import mongoose from 'mongoose';
import User from '#models/user.js';
import CondUsuario from '#models/cond_usuario.js';
import { resolveModel } from '#shared/db/resolveModel.js';
import { BaseRepository } from '#shared/repositories/BaseRepository.js';
import { createUnitScope } from '#shared/unitScope.js';

function normalizeObjectIdString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = normalizeObjectIdString(value);
    if (normalized) return normalized;
  }
  return '';
}

export function resolvePortalAuthUnitScope(req, { fallbackUnidadeId = null } = {}) {
  if (req?.unitScope) return req.unitScope;
  if (req?.ctx?.unitScope) return req.ctx.unitScope;

  const ctxUser = req?.portalUser || req?.session?.portalUser || null;

  const unidadeId = firstNonEmpty(
    req?.query?.unidadeId,
    req?.query?.unidade_id,
    req?.params?.unidadeId,
    req?.params?.unidade_id,
    req?.body?.unidadeId,
    req?.body?.unidade_id,
    ctxUser?.matriz_unidade_id,
    ctxUser?.unidade_principal_id,
    ctxUser?.unidade_id,
    ctxUser?.unidadeId,
    fallbackUnidadeId,
  );

  if (unidadeId && mongoose.isValidObjectId(unidadeId)) {
    return createUnitScope({ unidadeId });
  }

  return createUnitScope({ unidadeId: null });
}

export class PortalAuthRepository extends BaseRepository {
  constructor({ unitScope } = {}) {
    super({ unitScope });
  }

  getGestorUserModel() {
    return resolveModel({
      name: User.modelName || 'User',
      schema: User.schema,
      unitScope: this.getUnitScope(),
    });
  }

  getPortalUserModel() {
    return resolveModel({
      name: CondUsuario.modelName || 'CondUsuario',
      schema: CondUsuario.schema,
      unitScope: this.getUnitScope(),
    });
  }

  async findGestorUserByEmail(email, { maxTimeMs } = {}) {
    const GestorUserModel = this.getGestorUserModel();
    const query = GestorUserModel.findOne({ email });
    if (Number(maxTimeMs) > 0) query.maxTimeMS(Number(maxTimeMs));
    return query;
  }

  async findPortalUserById(id) {
    const PortalUserModel = this.getPortalUserModel();
    return PortalUserModel.findById(id);
  }

  async createPortalUserFromGestor(userData = {}) {
    const PortalUserModel = this.getPortalUserModel();
    return PortalUserModel.create({
      email: userData?.email,
      nome: userData?.nome || '',
      telefone: userData?.telefone || '',
      unidade_id: userData?.unidade_id || null,
      ativo: true,
      portal_acesso_ativo: true,
      portal_primeiro_acesso_obrigatorio: false,
    });
  }
}
