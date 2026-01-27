// Logger simples centralizado - pode evoluir depois (ex: pino, winston)
import util from 'util';

function format(msg, args) {
  if (!args.length) return msg;
  return msg + ' ' + args.map(a => (typeof a === 'string' ? a : util.inspect(a, { depth: 3, colors: false }))).join(' ');
}

class Logger {
  constructor(context) { this.context = context; }
  _prefix() { return `[${new Date().toISOString()}][${this.context}]`; }
  info(msg, ...args) { console.log(this._prefix(), format(msg, args)); }
  warn(msg, ...args) { console.warn(this._prefix(), format(msg, args)); }
  error(msg, ...args) { console.error(this._prefix(), format(msg, args)); }
  debug(msg, ...args) { if (process.env.DEBUG) console.debug(this._prefix(), format(msg, args)); }
}

export function createLogger(context = 'app') { return new Logger(context); }

export const logger = createLogger('core');
