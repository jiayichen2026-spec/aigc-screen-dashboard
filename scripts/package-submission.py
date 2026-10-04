#!/usr/bin/env python3
"""Package tracked source and a verified build; Python standard library only."""
import argparse
import hashlib
from pathlib import Path
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--verification', type=Path, help='Clean-extraction verification report to include in final ZIP')
args = parser.parse_args()
revision = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
if subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=normal'], cwd=ROOT):
    raise SystemExit('Commit the intended deliverables first; packaging requires a clean worktree.')
if not (ROOT / 'dist/index.html').is_file():
    raise SystemExit('Run npm run build first.')
tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
files = {}
for relative in filter(None, tracked):
    path = Path(relative)
    if any(part in {'.git', '.vercel', 'node_modules', 'artifacts'} or part.startswith('.env') for part in path.parts):
        raise SystemExit(f'Unexpected private/generated source path: {relative}')
    if (ROOT / path).is_symlink():
        raise SystemExit(f'Symlink not supported: {relative}')
    files[f'03-source/{relative}'] = (ROOT / path).read_bytes()
for path in sorted((ROOT / 'dist').rglob('*')):
    if path.is_file():
        files['04-preview/' + path.relative_to(ROOT / 'dist').as_posix()] = path.read_bytes()
copies = {
    '00-START_HERE.md': 'docs/SUBMISSION.md',
    '01-metrics-one-page.pdf': 'output/pdf/01-metrics-one-page.pdf',
    '02-ai-tool-usage.pdf': 'output/pdf/02-ai-tool-usage.pdf',
    '05-validation.md': 'docs/VALIDATION.md',
    '06-demo-guide.md': 'docs/DEMO_GUIDE.md',
}
for destination, source in copies.items():
    files[destination] = (ROOT / source).read_bytes()
files['SOURCE_REVISION.txt'] = (revision + '\n').encode()
if args.verification:
    report = args.verification.read_text(encoding='utf-8')
    if revision not in report or 'PASS' not in report:
        raise SystemExit('Verification report must identify this revision and a PASS result.')
    files['05-validation.md'] += ('\n\n' + report).encode('utf-8')
manifest = ''.join(f'{hashlib.sha256(content).hexdigest()}  {name}\n' for name, content in sorted(files.items()))
files['MANIFEST.sha256'] = manifest.encode('utf-8')
directory = ROOT / 'artifacts/submission'
directory.mkdir(parents=True, exist_ok=True)
name = 'ScreenPulse-submission.zip' if args.verification else 'ScreenPulse-submission-draft.zip'
destination = directory / name
with zipfile.ZipFile(destination, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, content in sorted(files.items()):
        info = zipfile.ZipInfo('ScreenPulse-submission/' + name, date_time=(2026, 10, 4, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        archive.writestr(info, content, compresslevel=9)
if destination.stat().st_size >= 30_000_000:
    raise SystemExit('Archive exceeds the 30MB submission limit.')
with zipfile.ZipFile(destination) as archive:
    assert archive.testzip() is None
digest = hashlib.sha256(destination.read_bytes()).hexdigest()
destination.with_suffix('.zip.sha256').write_text(f'{digest}  {destination.name}\n', encoding='utf-8')
print(f'{destination}\n{len(files)} files; {destination.stat().st_size} bytes\nSHA-256 {digest}')
