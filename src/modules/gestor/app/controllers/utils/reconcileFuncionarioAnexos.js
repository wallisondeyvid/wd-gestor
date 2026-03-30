export function reconcileUpdateFuncionarioIncrementalAnexos({
  funcionarioAtual,
  anexosExistentes,
  anexosExcluidos,
  novosUploads,
  mapFiles,
}) {
  const anexosAtuais = Array.isArray(funcionarioAtual?.anexos) ? funcionarioAtual.anexos : [];

  let anexosBase = anexosAtuais;
  if (typeof anexosExistentes === 'string' && anexosExistentes.trim()) {
    try {
      const parsed = JSON.parse(anexosExistentes);
      anexosBase = Array.isArray(parsed) ? parsed : [];
    } catch {
      anexosBase = [];
    }
  }

  if (typeof anexosExcluidos === 'string' && anexosExcluidos.trim()) {
    try {
      const parsed = JSON.parse(anexosExcluidos);
      const caminhosExcluidos = new Set((Array.isArray(parsed) ? parsed : []).map((item) => item?.caminho).filter(Boolean));
      anexosBase = anexosBase.filter((item) => !caminhosExcluidos.has(item?.caminho));
    } catch {
      anexosBase = anexosBase.slice();
    }
  }

  const uploads = Array.isArray(novosUploads) ? novosUploads : [];
  if (!uploads.length) return anexosBase.slice();

  const novosMapeados = mapFiles(uploads);
  return anexosBase.concat(Array.isArray(novosMapeados) ? novosMapeados : []);
}

export function reconcileUpdateFuncionarioFullAnexos({
  anexosExistentes,
  anexosExcluidos,
  novosUploads,
  mapFiles,
  fs,
  path,
  rootDir,
}) {
  let anexosBase = [];
  if (typeof anexosExistentes === 'string' && anexosExistentes.trim()) {
    try {
      const parsed = JSON.parse(anexosExistentes);
      anexosBase = Array.isArray(parsed) ? parsed : [];
    } catch {
      anexosBase = [];
    }
  }

  if (typeof anexosExcluidos === 'string' && anexosExcluidos.trim()) {
    try {
      const parsed = JSON.parse(anexosExcluidos);
      const excluidos = Array.isArray(parsed) ? parsed : [];
      const caminhosExcluidos = new Set(excluidos.map((item) => item?.caminho).filter(Boolean));
      anexosBase = anexosBase.filter((item) => !caminhosExcluidos.has(item?.caminho));

      for (const item of excluidos) {
        if (!item?.caminho) continue;
        const absolutePath = path.join(rootDir, '.', String(item.caminho).replace(/^public\//, ''));
        try {
          if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
        } catch {}
      }
    } catch {}
  }

  const uploads = Array.isArray(novosUploads) ? novosUploads : [];
  if (!uploads.length) return anexosBase.slice();

  const novosMapeados = mapFiles(uploads);
  return anexosBase.concat(Array.isArray(novosMapeados) ? novosMapeados : []);
}