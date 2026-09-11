"""Package the extension for the Chrome Web Store.

Writes dist/vinted-location-filter-<version>.zip with manifest.json at the root
of the archive, which is what the store expects: a zip of the extension folder
itself puts everything one level too deep.
"""
import json
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'extension'
DIST = ROOT / 'dist'


def package():
    version = json.loads((SOURCE / 'manifest.json').read_text())['version']
    DIST.mkdir(exist_ok=True)
    out = DIST / f'vinted-location-filter-{version}.zip'

    files = sorted(p for p in SOURCE.rglob('*')
                   if p.is_file()
                   and not p.name.startswith('.')
                   and '__MACOSX' not in p.parts)

    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in files:
            archive.write(path, path.relative_to(SOURCE).as_posix())

    print(f'{out.relative_to(ROOT)}  {out.stat().st_size:,} bytes  {len(files)} files')
    return out


if __name__ == '__main__':
    package()
