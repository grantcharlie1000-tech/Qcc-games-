"""Compare full glass suite and frozen score harness sequentially (Python 3.12+).

Requires installed npm dependencies and Playwright browsers. Output must be new.
Only output paths and server ports change in the copied harness.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--harness', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--base', default='origin/main')
parser.add_argument('--head', default='HEAD')
parser.add_argument('--port', type=int, default=4891)
args = parser.parse_args()
root = Path.cwd()
out = args.output.resolve()
if out.exists():
    parser.error('--output must not exist')
out.mkdir(parents=True)
frozen = out / 'harness'
shutil.copytree(args.harness / 'tests/liquid-glass-score', frozen / 'tests/liquid-glass-score')
(frozen / 'scripts').mkdir()
shutil.copy2(args.harness / 'scripts/check-liquid-glass.mjs', frozen / 'scripts')
manifest = {str(p.relative_to(frozen)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in frozen.rglob('*') if p.is_file()}
(out / 'harness-sha256.json').write_text(json.dumps(manifest, indent=2))
rows = []
for label, ref, port in [('base', args.base, args.port), ('head', args.head, args.port + 1)]:
    revision = subprocess.check_output(['git', 'rev-parse', ref], text=True).strip()
    checkout = out / label
    checkout.mkdir()
    archive = subprocess.check_output(['git', 'archive', revision])
    with tarfile.open(fileobj=io.BytesIO(archive)) as archive_file:
        archive_file.extractall(checkout, filter='data')
    (checkout / 'node_modules').symlink_to(root / 'node_modules', target_is_directory=True)
    shutil.copytree(frozen / 'tests/liquid-glass-score', checkout / 'tests/liquid-glass-score')
    shutil.copy2(frozen / 'scripts/check-liquid-glass.mjs', checkout / 'scripts')
    outputs = out / (label + '-outputs')
    files = [checkout / 'scripts/check-liquid-glass.mjs',
             *list((checkout / 'tests/liquid-glass-score').glob('*.ts'))]
    for file in files:
        file.write_text(file.read_text().replace('/workspace/liquid-glass', str(outputs)))
    config = checkout / 'tests/liquid-glass-score/playwright.config.ts'
    config.write_text(config.read_text().replace('4600', str(port)))
    commands = [
        ('suite', ['node', 'node_modules/@playwright/test/cli.js', 'test',
                   'tests/e2e/liquid-glass.spec.ts', '--workers=1', '--reporter=json']),
        ('score', ['node', 'scripts/check-liquid-glass.mjs']),
    ]
    for name, command in commands:
        env = os.environ.copy()
        env.pop('ARCADE_URL', None)
        env['PLAYWRIGHT_PORT'] = str(port)
        env.pop('PLAYWRIGHT_REUSE_SERVER', None)
        started = time.monotonic()
        with (out / f'{label}-{name}.log').open('w') as log:
            result = subprocess.run(command, cwd=checkout, env=env, stdout=log, stderr=subprocess.STDOUT)
        row = dict(label=label, revision=revision, command=command,
                   seconds=time.monotonic() - started, exit=result.returncode)
        if name == 'score':
            report_path = outputs / 'score-report.json'
            if report_path.exists():
                report = json.loads(report_path.read_text())
                row.update(failures=report['failures'], infrastructure=report['infrastructure'],
                           assertions=len(report['assertions']))
        rows.append(row)
        (out / 'timings.json').write_text(json.dumps(rows, indent=2))
        print(json.dumps(row), flush=True)
# Retain failures as evidence. Never interpret a faster failing command as a speedup.

reports = [json.loads((out / f'{label}-outputs/score-report.json').read_text())
           for label in ['base', 'head']]
vectors = [{(r['matrix'], r['id']): r['pass'] for r in report['assertions']}
           for report in reports]
comparison = dict(same_assertions=vectors[0].keys() == vectors[1].keys(),
                  same_outcomes=vectors[0] == vectors[1],
                  infrastructure=[r['infrastructure'] for r in reports],
                  failures=[r['failures'] for r in reports])
(out / 'comparison.json').write_text(json.dumps(comparison, indent=2))
print(json.dumps(comparison), flush=True)
