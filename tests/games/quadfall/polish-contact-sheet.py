"""Build the external audit contact sheet and sample glass at five heights."""
import json
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(os.environ.get('QF_AUDIT_DIR', '/workspace/qcc-liquid-glass/tetris/polish-audit'))
font_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
bold_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
font = ImageFont.truetype(font_path, 16)
small = ImageFont.truetype(font_path, 13)
bold = ImageFont.truetype(bold_path, 22)
columns = 4
column_width = 300
label_width = 130
padding = 24
gap = 16
width = padding * 2 + label_width + column_width * columns + gap * (columns - 1)
sections = []
samples = []
heights = [.15, .325, .5, .675, .85]
for engine in ['chromium', 'webkit']:
    rows = []
    for surface, label in [('dock', 'Shared dock'), ('chips', 'Hold / Next'), ('start', 'Start prompt'), ('over', 'Game over'), ('stats', 'Stats baseline'), ('menu', 'Shared menu')]:
        images = []
        for size in ['390x844', '1366x768']:
            for phase in ['before', 'after']:
                file = root / f'{phase}-{engine}-{size}-{surface}.png'
                image = Image.open(file).convert('RGB')
                image.thumbnail((column_width, 520), Image.Resampling.LANCZOS)
                images.append(image)
        rows.append((label, images, max(60, max(i.height for i in images)) + 30))
    sections.append((engine.upper(), rows))

# Sample painted pills, not their unpainted layout wrappers. These columns sit
# inside the rounded body and outside text/icons; menu groups get a second probe.
for record in json.loads((root / 'after-metrics.json').read_text()):
    engine, size, dpr = record['engine'], f"{record['width']}x{record['height']}", record['dpr']
    for surface, css_x in [('back', 18), ('hud', 18), ('pause', 18), ('hold', 44), ('next', 42), ('start', 26), ('over', 12), ('menu', 12), ('menu-groups', 24)]:
        file_surface = 'menu' if surface == 'menu-groups' else surface
        image = Image.open(root / f'after-{engine}-{size}-{file_surface}.png').convert('RGB')
        x = min(image.width - 1, round(css_x * dpr))
        samples.append({'engine': engine, 'size': size, 'phase': 'after', 'surface': surface,
                        'columnCssPx': css_x, 'yFractions': heights,
                        'rgb': [image.getpixel((x, min(image.height - 1, int(image.height * y)))) for y in heights]})

extra = []
for engine in ['chromium', 'webkit']:
    for phase in ['before', 'after']:
        image = Image.open(root / f'{phase}-{engine}-320x568-over-full.png').convert('RGB')
        image.thumbnail((column_width, 540), Image.Resampling.LANCZOS)
        extra.append(image)
height = 150 + sum(90 + sum(row[2] for row in rows) for _, rows in sections) + 100 + max(i.height for i in extra) + 80
sheet = Image.new('RGB', (width, height), '#111619')
draw = ImageDraw.Draw(sheet)
draw.text((padding, 20), 'QCC / TETRIS — POLISH AUDIT', fill='white', font=bold)
draw.text((padding, 58), '390×844 at DPR 3 · 1366×768 · both browser engines · additional 320 px overflow check', fill='#c3cdd2', font=font)
draw.text((padding, 88), 'Shared sheet findings are documented for their owners; their material and controls are unchanged.', fill='#c3cdd2', font=small)
y = 140
for name, rows in sections:
    draw.text((padding, y), name, fill='white', font=bold)
    for index, label in enumerate(['390×844 / BEFORE', '390×844 / AFTER', '1366×768 / BEFORE', '1366×768 / AFTER']):
        draw.text((padding + label_width + index * (column_width + gap), y + 37), label, fill='#c3cdd2', font=small)
    y += 78
    for label, images, row_height in rows:
        draw.text((padding, y + 8), label, fill='#e4e9eb', font=small)
        for index, image in enumerate(images):
            x = padding + label_width + index * (column_width + gap)
            sheet.paste(image, (x + (column_width - image.width) // 2, y + 6))
        y += row_height
    y += 12

draw.text((padding, y), '320×568 / RESULTS OVERFLOW', fill='white', font=bold)
for index, label in enumerate(['Chromium BEFORE', 'Chromium AFTER', 'WebKit BEFORE', 'WebKit AFTER']):
    x = padding + label_width + index * (column_width + gap)
    draw.text((x, y + 38), label, fill='#c3cdd2', font=small)
    sheet.paste(extra[index], (x + (column_width - extra[index].width) // 2, y + 66))
sheet.save(root / 'AUDIT_SHEET.jpg', quality=95)
(root / 'material-samples.json').write_text(json.dumps(samples, indent=2) + '\n')
print(f'Created {root / "AUDIT_SHEET.jpg"}; sampled every surface at five heights.')
