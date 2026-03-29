export async function resolveUnidadeLogoResource({
  unidade,
  parseDataUrl,
  fs,
  path,
  cwd,
}) {
  const logo = unidade.logo || '';

  if (/^https?:\/\//i.test(logo)) {
    return {
      kind: 'redirect',
      url: logo,
      cacheControl: 'public, max-age=60',
    };
  }

  if (/^data:/i.test(logo)) {
    const parsed = parseDataUrl(logo);
    if (!parsed) return { kind: 'empty' };

    return {
      kind: 'buffer',
      buffer: parsed.buffer,
      contentType: parsed.contentType,
      cacheControl: 'private, max-age=300',
    };
  }

  try {
    if (typeof logo === 'string' && logo) {
      const rel = logo.replace(/^\/*/, '');
      const root = cwd();
      const candidates = [
        path.join(root, 'public', rel),
        path.join(root, rel),
        path.join(root, 'public/uploads', rel),
      ];

      for (const filePath of candidates) {
        try {
          const stat = await fs.stat(filePath).catch(() => null);
          if (stat && stat.isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            const contentType = ext === '.svg' ? 'image/svg+xml'
              : ext === '.png' ? 'image/png'
              : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
              : ext === '.webp' ? 'image/webp'
              : 'application/octet-stream';

            return {
              kind: 'file',
              filePath,
              contentType,
              cacheControl: 'private, max-age=300',
              fallbackTo204OnError: false,
            };
          }
        } catch {}
      }
    }
  } catch {}

  try {
    return {
      kind: 'file',
      filePath: path.join(cwd(), 'public', 'img', 'placeholder-logo.svg'),
      contentType: 'image/svg+xml',
      cacheControl: 'public, max-age=600',
      fallbackTo204OnError: true,
    };
  } catch {
    return { kind: 'empty' };
  }
}