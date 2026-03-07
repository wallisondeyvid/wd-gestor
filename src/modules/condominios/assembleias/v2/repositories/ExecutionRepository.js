import mongoose from 'mongoose';
import CondAssembleia from '#models/cond_assembleia.js';
import CondAssembleiaExecution from '#models/cond_assembleia_execution.js';
import { resolveModel } from '#shared/db/resolveModel.js';
import { BaseRepository } from '#shared/repositories/BaseRepository.js';
import { createUnitScope } from '#shared/unitScope.js';

function safeStr(v, max = 4000) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return s.length > max ? s.slice(0, max) : s;
}

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

export function resolveExecutionUnitScope(req, { fallbackUnidadeId = null } = {}) {
  if (req?.unitScope) return req.unitScope;
  if (req?.ctx?.unitScope) return req.ctx.unitScope;

  const ctxUser = req?.ctxUser || req?.user || req?.portalUser || req?.session?.portalUser || req?.session?.user || null;

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

export class ExecutionRepository extends BaseRepository {
  constructor({ unitScope } = {}) {
    super({ unitScope });
  }

  getAssembleiaModel() {
    return resolveModel({
      name: CondAssembleia.modelName || 'CondAssembleia',
      schema: CondAssembleia.schema,
      unitScope: this.getUnitScope(),
    });
  }

  getExecutionModel() {
    return resolveModel({
      name: CondAssembleiaExecution.modelName || 'CondAssembleiaExecution',
      schema: CondAssembleiaExecution.schema,
      unitScope: this.getUnitScope(),
    });
  }

  async findAssembleiaById(id, { lean = false } = {}) {
    const AssembleiaModel = this.getAssembleiaModel();
    const query = AssembleiaModel.findById(id);
    if (lean) query.lean();
    return query;
  }

  async findExecutionByAssembleiaId(assembleiaId) {
    const ExecutionModel = this.getExecutionModel();
    return ExecutionModel.findOne({ assembleia_id: assembleiaId });
  }

  async getOrCreateExecution(assembleiaId) {
    let execDoc = await this.findExecutionByAssembleiaId(assembleiaId);
    if (execDoc) return execDoc;

    const assembleia = await this.findAssembleiaById(assembleiaId, { lean: true });
    if (!assembleia) return null;

    const agenda = (Array.isArray(assembleia.pauta) ? assembleia.pauta : []).map((it, idx) => ({
      idx,
      tipo: safeStr(it?.tipo || '', 80),
      descricao: safeStr(it?.descricao || '', 4000),
      state: idx === 0 ? 'pendente' : 'pendente',
      discussionStartedAt: null,
      discussionEndedAt: null,
      timeMs: 0,
    }));

    const ExecutionModel = this.getExecutionModel();
    execDoc = await ExecutionModel.create({
      assembleia_id: assembleia._id,
      unidade_id: assembleia.unidade_id || null,
      sessionStatus: 'aguardando',
      isPaused: false,
      openedAt: null,
      pausedAt: null,
      pausedMs: 0,
      closedAt: null,
      virtualLink: safeStr(assembleia.link || '', 800),
      currentAgendaIdx: 0,
      presences: [],
      agenda,
      votes: [],
      events: [],
    });

    return execDoc;
  }

  async saveExecution(doc) {
    if (!doc || typeof doc.save !== 'function') return doc;
    return doc.save();
  }
}
