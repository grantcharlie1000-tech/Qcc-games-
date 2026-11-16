"""Regenerate independent model fixtures: Python 3.12, onnxruntime==1.23.0, numpy.

No Python package is needed by the website. This is only a verification tool.
Run from any directory after installing those packages in a separate venv.
"""
import hashlib
import json
from pathlib import Path

import numpy as np
import onnxruntime as ort

assert ort.__version__ == '1.23.0'
root = Path(__file__).resolve().parents[4]
asset_dir = root / 'public/chess-engines/maia'
model = b''.join((asset_dir / f'model.part{n}').read_bytes() for n in range(1, 4))
assert hashlib.sha256(model).hexdigest() == '405bf76c15727dad8728b352c06a8f3c1b80fb2760e8d666b32485c63d75b856'
options = ort.SessionOptions()
options.intra_op_num_threads = 1
options.inter_op_num_threads = 1
options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_DISABLE_ALL
session = ort.InferenceSession(model, sess_options=options, providers=['CPUExecutionProvider'])
vocabulary = json.loads((root / 'src/chess-ai/providers/maia/moves.json').read_text())
fixture_file = Path(__file__).with_name('reference.json')
reference = json.loads(fixture_file.read_text())

for fixture in reference['fixtures']:
    black = fixture['fen'].split()[1] == 'b'
    tokens = np.zeros((1, 64, 12), dtype=np.float32)
    for row, rank in enumerate(fixture['fen'].split()[0].split('/')):
        file = 0
        for char in rank:
            if char.isdigit():
                file += int(char)
            else:
                channel = 'PNBRQKpnbrqk'.index(char)
                if black:
                    channel = (channel + 6) % 12
                square = (row if black else 7 - row) * 8 + file
                tokens[0, square, channel] = 1
                file += 1
    logits, value = session.run(None, {
        'tokens': tokens,
        'elo_self': np.array([fixture['rating']], dtype=np.float32),
        'elo_oppo': np.array([fixture['rating']], dtype=np.float32),
    })
    fixture['tokenSha256'] = hashlib.sha256(tokens.tobytes()).hexdigest()
    for item in fixture['selectedLogits']:
        move = item['moveUci']
        canonical = move if not black else f'{move[0]}{9-int(move[1])}{move[2]}{9-int(move[3])}{move[4:]}'
        item['index'] = vocabulary[canonical]
        item['logit'] = float(logits[0, item['index']])
    fixture['ldw'] = value[0].tolist()

fixture_file.write_text(json.dumps(reference, indent=2) + '\n')
print(f'Generated {len(reference["fixtures"])} fixtures using {reference["runtime"]}')
