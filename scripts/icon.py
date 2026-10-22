"""Generate the code-drawn macOS icon. Requires Pillow, only for rebuilding artwork."""
from pathlib import Path
import math
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent
out = root / 'assets'
out.mkdir(exist_ok=True)
size = 1024
image = Image.new('RGBA', (size, size))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((30, 30, 994, 994), radius=220, fill='#7963d7')
# Concentric orbital paths, calculated directly as vector geometry.
for angle, color in [(-32, '#f5edff'), (35, '#c6b5f1'), (90, '#a893e5')]:
    theta = math.radians(angle)
    points = []
    for step in range(361):
        t = math.radians(step)
        x, y = 335 * math.cos(t), 138 * math.sin(t)
        points.append((512+x*math.cos(theta)-y*math.sin(theta), 512+x*math.sin(theta)+y*math.cos(theta)))
    draw.line(points, fill=color, width=13, joint='curve')
draw.ellipse((438, 438, 586, 586), fill='#ffffff')
draw.ellipse((739, 300, 793, 354), fill='#ffffff')
image.save(out / 'icon.png')
# Pillow writes the multi-resolution icns container directly.
image.save(out / 'icon.icns')
print('Icon generated in assets/')
