import express from 'express';

const app = express();

function getCtxUser(req) {
  return req?.session?.user || req?.user || null;
}

async function renderCaixaMensagens(req, res) {
  try {
    const ctxUser = getCtxUser(req);

    if (!ctxUser) {
      const nextUrl = encodeURIComponent(String(req.originalUrl || req.url || '/mensagens'));
      return res.redirect(`/mensagens/login?next=${nextUrl}`);
    }

    return res.render('condominios/caixa_de_mensagem', {
      user: ctxUser,
      basePath: '/condominios',
      moduleLabel: 'Caixa de Mensagens'
    });
  } catch (err) {
    console.error('[mensagens][ui] erro:', err);
    return res
      .status(500)
      .type('text/plain; charset=utf-8')
      .send('Falha ao carregar a Caixa de Mensagens.');
  }
}

app.get('/', renderCaixaMensagens);

// O dashboard do módulo é a própria Caixa de Mensagens.
app.get('/dashboard', renderCaixaMensagens);

export default app;