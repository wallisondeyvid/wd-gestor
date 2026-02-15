import executionV1 from './routes/execution.routes.js';
import executionV2 from './v2/routes/execution.routes.js';
import { isFlagEnabled } from '#core/config/featureFlags.js';

export default function mountAssembleias(app) {
  if (!isFlagEnabled('ASSEMBLEIAS_V2')) {
    app.use(executionV1());
    return;
  }
  app.use(executionV2());
}
