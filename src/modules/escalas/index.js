// Wrapper do módulo Escalas
import escalasApp from './app/escalas-app.js';
import express from 'express';

export const meta = {
  name: 'escalas',
  version: '0.1.0',
  basePath: '/escalas', // app interno já não repete o prefixo
  // Unificar: usar ENABLE_ESCALAS como chave definitiva
  disabled: process.env.ENABLE_ESCALAS !== '1',
};

export function buildModule(/* core */) {
  if (meta.disabled) {
    const app = express();
    app.get('/', (_req,res)=> res.status(503).send('Módulo Escalas desabilitado'));
    return app;
  }
  return escalasApp;
}

export default buildModule;
