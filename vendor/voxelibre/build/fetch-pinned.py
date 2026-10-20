#!/usr/bin/env python3
"""Restore one pinned, shallow Git checkout; never move an unrelated checkout."""
import argparse, json, pathlib, subprocess
parser=argparse.ArgumentParser()
parser.add_argument('name')
parser.add_argument('destination')
args=parser.parse_args()
pin=json.loads(pathlib.Path(__file__).with_name('pins.json').read_text())[args.name]
dest=pathlib.Path(args.destination).resolve()
if not (dest/'.git').exists():
    if dest.exists() and any(dest.iterdir()):
        raise SystemExit(f'Refusing to replace nonempty directory: {dest}')
    dest.mkdir(parents=True,exist_ok=True)
    subprocess.run(['git','init','-q',str(dest)],check=True)
    subprocess.run(['git','-C',str(dest),'remote','add','origin',pin['repository']],check=True)
    subprocess.run(['git','-C',str(dest),'fetch','--depth=1','origin',pin['commit']],check=True,timeout=300)
    subprocess.run(['git','-C',str(dest),'checkout','--detach',pin['commit']],check=True)
actual=subprocess.check_output(['git','-C',str(dest),'rev-parse','HEAD'],text=True).strip()
if actual != pin['commit']:
    raise SystemExit(f'{dest}: expected {pin["commit"]}, found {actual}')
print(f'{args.name}: verified {actual}')
