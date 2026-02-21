import mongoose from 'mongoose';

const connections = new Map();

export function getConnectionForUnit(unidadeId) {
  if (!unidadeId) {
    return mongoose.connection;
  }

  if (!connections.has(unidadeId)) {
    connections.set(unidadeId, mongoose.connection);
  }

  // FASE 1: ainda não cria DB separado
  return connections.get(unidadeId);
}
