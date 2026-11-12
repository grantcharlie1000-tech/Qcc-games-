"""Evidence sheets for the weapons rebuild: frames side by side with labels, and 2x crops of the weapon in hand.
Usage: python3 evidence.py OUT.jpg WIDTH "label=path[@crop]" ... [--cols N]
  crop "hip" = the weapon at the hip (x 560..1200, y 300..660 of a 1280x720 frame) shown at 2x;
  crop "ads" = the sight window (x 400..880, y 180..450) at 2x. Each cell is WIDTH/cols wide. Writes JPEG under ~300 KB."""
import sys
from PIL import Image, ImageDraw, ImageFont

CROPS = {'hip': (560, 300, 1200, 660), 'ads': (400, 180, 880, 450), 'hand': (300, 330, 940, 690)}
args = [a for a in sys.argv[1:] if not a.startswith('--')]
cols = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--cols=')), '2'))
out, width, items = args[0], int(args[1]), args[2:]
cw = width // cols
cells = []
for it in items:
    label, spec = it.split('=', 1)
    path, _, crop = spec.partition('@')
    im = Image.open(path).convert('RGB')
    if crop:
        im = im.crop(CROPS[crop])
    h = round(cw * im.height / im.width)
    im = im.resize((cw, h), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    try:
        f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
    except Exception:
        f = ImageFont.load_default()
    tw = d.textlength(label, font=f)
    d.rectangle([4, 4, 12 + tw, 26], fill=(0, 0, 0))
    d.text((8, 6), label, fill=(255, 255, 255), font=f)
    cells.append(im)
rows = [cells[i:i + cols] for i in range(0, len(cells), cols)]
H = sum(max(c.height for c in r) for r in rows)
sheet = Image.new('RGB', (width, H), (20, 20, 20))
y = 0
for r in rows:
    for i, c in enumerate(r):
        sheet.paste(c, (i * cw, y))
    y += max(c.height for c in r)
q = 85
while True:
    sheet.save(out, quality=q, optimize=True)
    import os
    if os.path.getsize(out) < 300_000 or q < 40:
        break
    q -= 7
print(out, sheet.size, os.path.getsize(out) // 1024, 'KB')
