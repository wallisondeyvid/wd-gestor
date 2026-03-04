import mongoose from 'mongoose';

export function getModel(name, schema, connection) {
  const targetConnection = connection || mongoose.connection;

  if (targetConnection.models && targetConnection.models[name]) {
    return targetConnection.models[name];
  }

  return targetConnection.model(name, schema);
}
