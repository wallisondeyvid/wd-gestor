#!/usr/bin/env python3
"""
Gera um mapa detalhado da estrutura de um repositório.

Recursos:
- Percorre recursivamente com boa performance (os.scandir).
- Mostra árvore hierárquica com indentação.
- Exibe caminho completo de cada pasta/arquivo.
- Exibe tipo por extensão (e categorias para arquivos sem extensão).
- Exibe tamanho opcional dos arquivos.
- Ignora diretórios pesados por padrão (ex.: node_modules, vendor, bin).
- Exporta para arquivo texto (tree.txt por padrão).

Uso rápido:
    python scripts/repo_tree_map.py .
    python scripts/repo_tree_map.py . --output tree.txt --size
"""

from __future__ import annotations

import argparse
import os
import stat
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Set, Tuple

DEFAULT_IGNORED_DIRS: Set[str] = {
    "node_modules",
    "vendor",
    "bin",
    "obj",
    ".git",
    ".svn",
    ".hg",
    "__pycache__",
    ".next",
    ".nuxt",
    "dist",
    "build",
    "target",
    "coverage",
    ".idea",
    ".vscode",
    ".venv",
    "venv",
}


@dataclass
class Entry:
    path: Path
    is_dir: bool
    extension: str
    size: int = 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Gera árvore detalhada de pastas e arquivos do repositório."
    )
    parser.add_argument(
        "root",
        nargs="?",
        default=".",
        help="Diretório raiz do repositório (padrão: diretório atual).",
    )
    parser.add_argument(
        "-o",
        "--output",
        default=None,
        help="Arquivo de saída (ex.: tree.txt). Se omitido, imprime no terminal.",
    )
    parser.add_argument(
        "--size",
        action="store_true",
        help="Inclui tamanho dos arquivos.",
    )
    parser.add_argument(
        "--max-depth",
        type=int,
        default=None,
        help="Profundidade máxima a percorrer (0 = só raiz).",
    )
    parser.add_argument(
        "--ignore",
        default="",
        help="Lista adicional de diretórios para ignorar, separados por vírgula.",
    )
    parser.add_argument(
        "--no-default-ignore",
        action="store_true",
        help="Não usar lista padrão de diretórios ignorados.",
    )
    return parser.parse_args()


def human_size(num_bytes: int) -> str:
    units = ["B", "KB", "MB", "GB", "TB"]
    value = float(num_bytes)
    for unit in units:
        if value < 1024.0 or unit == units[-1]:
            return f"{value:.1f}{unit}" if unit != "B" else f"{int(value)}B"
        value /= 1024.0
    return f"{num_bytes}B"


def detect_type(path: Path, is_dir: bool) -> str:
    if is_dir:
        return "directory"

    suffix = path.suffix.lower()
    if suffix:
        return suffix[1:]

    # Arquivo sem extensão: tenta classificar minimamente.
    name = path.name.lower()
    if name in {"dockerfile", "makefile", "license", "readme", "readme.md"}:
        return "text"

    return "no-ext"


def safe_stat_size(entry: os.DirEntry[str]) -> int:
    try:
        return entry.stat(follow_symlinks=False).st_size
    except (OSError, PermissionError):
        return 0


def build_tree(
    root: Path,
    ignored_dirs: Set[str],
    include_size: bool,
    max_depth: int | None,
) -> Tuple[List[str], Dict[str, int]]:
    lines: List[str] = []
    counts = {"dirs": 0, "files": 0}

    root = root.resolve()
    lines.append(f"{root.name}/")

    # Pilha: (path, prefixes, depth)
    stack: List[Tuple[Path, List[bool], int]] = [(root, [], 0)]

    while stack:
        current_path, parents_has_next, depth = stack.pop()

        if max_depth is not None and depth >= max_depth:
            continue

        try:
            with os.scandir(current_path) as iterator:
                child_entries: List[os.DirEntry[str]] = []
                for item in iterator:
                    # Ignora symlink de diretório para evitar loops.
                    try:
                        if item.is_dir(follow_symlinks=False):
                            if item.name in ignored_dirs:
                                continue
                    except (OSError, PermissionError):
                        continue
                    child_entries.append(item)
        except (OSError, PermissionError):
            # Sem permissão/leitura, segue para próxima pasta.
            continue

        # Diretórios primeiro, depois arquivos; ambos por nome.
        child_entries.sort(
            key=lambda e: (
                0 if safe_is_dir(e) else 1,
                e.name.lower(),
            )
        )

        formatted_children: List[Entry] = []
        for item in child_entries:
            is_dir = safe_is_dir(item)
            item_path = Path(item.path)
            ext = detect_type(item_path, is_dir)
            size = safe_stat_size(item) if (include_size and not is_dir) else 0
            formatted_children.append(
                Entry(path=item_path, is_dir=is_dir, extension=ext, size=size)
            )

        total_children = len(formatted_children)
        for idx, entry in enumerate(formatted_children):
            is_last = idx == total_children - 1
            connector = "└─ " if is_last else "├─ "
            indent_parts = ["   " if has_next else "│  " for has_next in parents_has_next]
            indent = "".join(indent_parts)

            path_display = str(entry.path.resolve())
            suffix = "/" if entry.is_dir else ""

            if entry.is_dir:
                counts["dirs"] += 1
                line = (
                    f"{indent}{connector}{entry.path.name}{suffix} "
                    f"[type:{entry.extension}] [path:{path_display}]"
                )
            else:
                counts["files"] += 1
                size_part = f" [size:{human_size(entry.size)}]" if include_size else ""
                line = (
                    f"{indent}{connector}{entry.path.name} "
                    f"[type:{entry.extension}] [path:{path_display}]{size_part}"
                )

            lines.append(line)

        # Empilha diretórios em ordem reversa para manter impressão correta.
        for idx in range(total_children - 1, -1, -1):
            entry = formatted_children[idx]
            if not entry.is_dir:
                continue
            is_last = idx == total_children - 1
            stack.append((entry.path, parents_has_next + [not is_last], depth + 1))

    return lines, counts


def safe_is_dir(entry: os.DirEntry[str]) -> bool:
    try:
        mode = entry.stat(follow_symlinks=False).st_mode
        return stat.S_ISDIR(mode)
    except (OSError, PermissionError):
        return False


def parse_additional_ignores(raw: str) -> Set[str]:
    if not raw.strip():
        return set()
    return {piece.strip() for piece in raw.split(",") if piece.strip()}


def write_output(content: str, output_path: Path | None) -> None:
    if output_path is None:
        print(content)
        return

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(content, encoding="utf-8", newline="\n")
    print(f"Árvore exportada para: {output_path.resolve()}")


def main() -> int:
    args = parse_args()
    root = Path(args.root)

    if not root.exists() or not root.is_dir():
        print(f"Erro: diretório inválido: {root}", file=sys.stderr)
        return 1

    ignored = set()
    if not args.no_default_ignore:
        ignored.update(DEFAULT_IGNORED_DIRS)
    ignored.update(parse_additional_ignores(args.ignore))

    lines, counts = build_tree(
        root=root,
        ignored_dirs=ignored,
        include_size=args.size,
        max_depth=args.max_depth,
    )

    summary = [
        "",
        "---",
        f"Resumo: {counts['dirs']} diretórios, {counts['files']} arquivos.",
        f"Ignorados: {', '.join(sorted(ignored)) if ignored else '(nenhum)'}",
    ]

    output_content = "\n".join(lines + summary)

    output_path = Path(args.output).resolve() if args.output else None
    write_output(output_content, output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
