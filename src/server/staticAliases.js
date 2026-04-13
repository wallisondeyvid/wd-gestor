import express from 'express';
import fs from 'fs';
import path from 'path';

export function registerCompatibleStaticAliases({ app, ROOT }) {
  try {
    app.use('/images', express.static(path.join(ROOT, 'images')));
    app.use(express.static(path.join(ROOT, 'public')));
    app.use('/gestor/js/gestor', express.static(path.join(ROOT, 'public/gestor/js')));
    app.use('/gestor/js', express.static(path.join(ROOT, 'public/gestor/js')));
    app.use('/gestor/js', express.static(path.join(ROOT, 'public/js')));
    app.use('/gestor/js/pages', express.static(path.join(ROOT, 'public/gestor/js/pages')));
    app.use('/gestor/css', express.static(path.join(ROOT, 'public/css')));
    app.use('/gestor/images', express.static(path.join(ROOT, 'images')));
    app.use('/gestor/img', express.static(path.join(ROOT, 'public/img')));
    app.use('/gestor/data', express.static(path.join(ROOT, 'public/data')));

    const serveFavicon = (req, res) => {
      try {
        const ico = path.join(ROOT, 'public', 'favicon.ico');
        const png = path.join(ROOT, 'images', 'logoWDGestor.png');
        let target = null;
        if (fs.existsSync(ico)) {
          target = ico;
          res.type('image/x-icon');
        } else if (fs.existsSync(png)) {
          target = png;
          res.type('image/png');
        }
        if (!target) return res.status(204).end();
        res.set('Cache-Control', 'public, max-age=86400');
        return res.sendFile(target, (err) => {
          if (!err) return;
          try {
            if (res.headersSent) return res.end();
            return res.status(204).end();
          } catch {
            return;
          }
        });
      } catch {
        return res.status(204).end();
      }
    };

    app.get('/favicon.ico', serveFavicon);
    app.get('/:seg/favicon.ico', serveFavicon);

    app.get('/escalas/css/*', (req, res) => {
      try {
        const rel = String(req.path || '').replace(/^\/escalas\/css\//, '');
        const p = path.join(ROOT, 'public/css', rel);
        if (!fs.existsSync(p)) return res.status(404).set('X-Served-By', 'escalas-css-miss').type('text/plain').send('Not found');
        res.set('X-Served-By', 'escalas-css');
        res.type('text/css');
        res.set('Cache-Control', 'public, max-age=300');
        return res.sendFile(p);
      } catch {
        return res.status(404).set('X-Served-By', 'escalas-css-error').type('text/plain').send('Not found');
      }
    });

    app.get('/escalas/images/*', (req, res) => {
      try {
        const rel = String(req.path || '').replace(/^\/escalas\/images\//, '');
        const p = path.join(ROOT, 'images', rel);
        if (!fs.existsSync(p)) return res.status(404).set('X-Served-By', 'escalas-images-miss').end();
        res.set('X-Served-By', 'escalas-images');
        res.set('Cache-Control', 'public, max-age=300');
        return res.sendFile(p);
      } catch {
        return res.status(404).set('X-Served-By', 'escalas-images-error').end();
      }
    });

    app.get('/escalas/img/*', (req, res) => {
      try {
        const rel = String(req.path || '').replace(/^\/escalas\/img\//, '');
        const p = path.join(ROOT, 'public/img', rel);
        if (!fs.existsSync(p)) return res.status(404).set('X-Served-By', 'escalas-img-miss').end();
        res.set('X-Served-By', 'escalas-img');
        res.set('Cache-Control', 'public, max-age=300');
        return res.sendFile(p);
      } catch {
        return res.status(404).set('X-Served-By', 'escalas-img-error').end();
      }
    });

    app.get('/escalas/js/pages/login.js', (req, res) => {
      try {
        const primary = path.join(ROOT, 'public/js/escalas/login.js');
        const fallback = path.join(ROOT, 'public/gestor/js/pages/login.js');
        const target = fs.existsSync(primary) ? primary : (fs.existsSync(fallback) ? fallback : null);
        if (!target) return res.status(404).set('X-Served-By', 'escalas-js-login-miss').type('text/plain').send('Not found');
        res.set('X-Served-By', 'escalas-js-login');
        res.type('application/javascript');
        res.set('Cache-Control', 'public, max-age=300');
        return res.sendFile(target);
      } catch {
        return res.status(404).set('X-Served-By', 'escalas-js-login-error').type('text/plain').send('Not found');
      }
    });

    app.get('/escalas/js/*', (req, res) => {
      try {
        const rel = String(req.path || '').replace(/^\/escalas\/js\//, '');
        const p1 = path.join(ROOT, 'public/escalas/js', rel);
        const p2 = path.join(ROOT, 'public/js', rel);
        const target = fs.existsSync(p1) ? p1 : (fs.existsSync(p2) ? p2 : null);
        if (!target) return res.status(404).set('X-Served-By', 'escalas-js-miss').type('text/plain').send('Not found');
        res.set('X-Served-By', target === p1 ? 'escalas-js' : 'escalas-js-shared');
        res.type('application/javascript');
        res.set('Cache-Control', 'public, max-age=300');
        return res.sendFile(target);
      } catch {
        return res.status(404).set('X-Served-By', 'escalas-js-error').type('text/plain').send('Not found');
      }
    });

    app.use('/:seg/css', (req, res, next) => {
      const seg = String(req.params.seg || '');
      if (!seg || seg === 'gestor' || seg === 'escalas') return next();
      return express.static(path.join(ROOT, 'public/css'))(req, res, next);
    });
    app.use('/:seg/images', (req, res, next) => {
      const seg = String(req.params.seg || '');
      if (!seg || seg === 'gestor' || seg === 'escalas') return next();
      return express.static(path.join(ROOT, 'images'))(req, res, next);
    });
    app.use('/:seg/img', (req, res, next) => {
      const seg = String(req.params.seg || '');
      if (!seg || seg === 'gestor' || seg === 'escalas') return next();
      return express.static(path.join(ROOT, 'public/img'))(req, res, next);
    });
    app.use('/:seg/js', (req, res, next) => {
      const seg = String(req.params.seg || '');
      if (!seg || seg === 'gestor' || seg === 'escalas') return next();
      return express.static(path.join(ROOT, 'public/js'))(req, res, next);
    });

    app.use('/:seg/uploads', (req, res, next) => {
      const seg = String(req.params.seg || '');
      if (!seg || seg === 'gestor' || seg === 'escalas') return next();
      const st1 = express.static(path.join(ROOT, 'uploads'));
      const st2 = express.static(path.join(ROOT, 'public/uploads'));
      return st1(req, res, () => st2(req, res, next));
    });

    app.use('/uploads', express.static(path.join(ROOT, 'uploads')));
    app.use('/uploads', express.static(path.join(ROOT, 'public/uploads')));

    app.get('/:seg/js/pages/login.js', (req, res, next) => {
      try {
        const seg = String(req.params.seg || '');
        if (!seg || seg === 'gestor' || seg === 'escalas') return next();
        const p = path.join(ROOT, 'public/gestor/js/pages/login.js');
        res.type('application/javascript');
        res.set('Cache-Control', 'public, max-age=300');
        return res.sendFile(p, (err) => err ? next() : undefined);
      } catch {
        return next();
      }
    });

    app.get('/escalas/uploads/*', (req, res) => {
      try {
        const rel = String((req.path || '').replace(/^\/escalas\/uploads\//, ''));
        const cand = [
          path.join(ROOT, 'public/uploads', rel),
          path.join(ROOT, 'uploads', rel),
        ];
        for (const p of cand) {
          try {
            if (fs.existsSync(p)) {
              res.set('X-Served-By', 'escalas-uploads-hit');
              res.set('Cache-Control', 'public, max-age=300');
              return res.sendFile(p);
            }
          } catch {}
        }
        const phSvg = path.join(ROOT, 'public', 'img', 'user-placeholder.svg');
        const phPng = path.join(ROOT, 'images', 'usuario.png');
        const target = fs.existsSync(phSvg) ? phSvg : (fs.existsSync(phPng) ? phPng : null);
        if (!target) {
          console.warn('[uploads] placeholder inexistente', { rel, phSvg, phPng });
          return res.status(404).set('X-Served-By', 'escalas-uploads-no-placeholder').end();
        }
        const ext = path.extname(target).toLowerCase();
        if (ext === '.svg') res.type('image/svg+xml');
        else if (ext === '.png') res.type('image/png');
        res.set('Cache-Control', 'public, max-age=300');
        res.set('X-Served-By', 'escalas-uploads-fallback');
        console.info('[uploads] fallback placeholder', { rel, target: path.basename(target) });
        return res.sendFile(target);
      } catch (e) {
        console.warn('[uploads] erro ao servir upload', e?.message);
        return res.status(404).set('X-Served-By', 'escalas-uploads-error').end();
      }
    });

    app.use('/escalas/images', express.static(path.join(ROOT, 'images')));
    app.use('/escalas/css', express.static(path.join(ROOT, 'public/css')));
    app.use('/escalas/js/escalas', express.static(path.join(ROOT, 'public/escalas/js/escalas')));
    app.use('/escalas/js', express.static(path.join(ROOT, 'public/escalas/js')));
    app.use('/escalas/js', express.static(path.join(ROOT, 'public/js')));
    app.use('/escalas/img', express.static(path.join(ROOT, 'public/img')));
    app.use('/escalas/uploads', express.static(path.join(ROOT, 'public/uploads')));

    app.get('/escalas/css/*', (req, res, next) => {
      try {
        const rel = String(req.path || '').replace(/^\/escalas\/css\//, '');
        const p = path.join(ROOT, 'public/css', rel);
        res.set('X-Served-By', 'escalas-css-fallback');
        res.type('text/css');
        return res.sendFile(p, (err) => err ? next() : undefined);
      } catch {
        return next();
      }
    });
    app.get('/escalas/images/*', (req, res, next) => {
      try {
        const rel = String(req.path || '').replace(/^\/escalas\/images\//, '');
        const p = path.join(ROOT, 'images', rel);
        res.set('X-Served-By', 'escalas-images-fallback');
        return res.sendFile(p, (err) => err ? next() : undefined);
      } catch {
        return next();
      }
    });
    app.get('/escalas/img/*', (req, res, next) => {
      try {
        const rel = String(req.path || '').replace(/^\/escalas\/img\//, '');
        const p = path.join(ROOT, 'public/img', rel);
        res.set('X-Served-By', 'escalas-img-fallback');
        return res.sendFile(p, (err) => err ? next() : undefined);
      } catch {
        return next();
      }
    });
    app.get('/escalas/js/*', (req, res, next) => {
      try {
        const rel = String(req.path || '').replace(/^\/escalas\/js\//, '');
        const p1 = path.join(ROOT, 'public/escalas/js', rel);
        res.set('X-Served-By', 'escalas-js-fallback-1');
        return res.sendFile(p1, (err1) => {
          if (!err1) return;
          try {
            const p2 = path.join(ROOT, 'public/js', rel);
            res.set('X-Served-By', 'escalas-js-fallback-2');
            return res.sendFile(p2, (err2) => err2 ? next() : undefined);
          } catch {
            return next();
          }
        });
      } catch {
        return next();
      }
    });
    app.get('/gestor/js/pages/login.js', (req, res, next) => {
      try {
        const p = path.join(ROOT, 'public/gestor/js/pages/login.js');
        return res.sendFile(p, (err) => err ? next() : undefined);
      } catch {
        return next();
      }
    });
  } catch (_e) {
    /* noop */
  }
}