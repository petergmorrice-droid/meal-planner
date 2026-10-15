"""Draws the app icon (a white cooking pot on green) as public/icon-192.png and public/icon-512.png.

Run with: python3 scripts/make-icons.py   (needs Pillow)
The pot sits inside the middle 60% so the icon also works when phones crop it to a circle.
"""
from pathlib import Path
from PIL import Image, ImageDraw

GREEN = (5, 150, 105, 255)   # emerald-600, the app's main colour
WHITE = (255, 255, 255, 255)
S = 1024                     # draw large, then shrink for smooth edges

img = Image.new('RGBA', (S, S), GREEN)
d = ImageDraw.Draw(img)

Y = -30  # nudge everything up a little so it looks centred
# Pot body
d.rounded_rectangle((300, 485 + Y, 724, 765 + Y), radius=70, fill=WHITE)
d.rectangle((300, 485 + Y, 724, 590 + Y), fill=WHITE)
# Handles
d.rounded_rectangle((230, 530 + Y, 320, 575 + Y), radius=22, fill=WHITE)
d.rounded_rectangle((704, 530 + Y, 794, 575 + Y), radius=22, fill=WHITE)
# Lid and knob
d.rounded_rectangle((275, 435 + Y, 749, 470 + Y), radius=17, fill=WHITE)
d.rounded_rectangle((482, 385 + Y, 542, 430 + Y), radius=16, fill=WHITE)
# Steam: three wavy wisps
for x in (430, 512, 594):
    d.arc((x - 18, 255 + Y, x + 18, 305 + Y), start=90, end=270, fill=WHITE, width=14)
    d.arc((x - 18, 297 + Y, x + 18, 347 + Y), start=270, end=90, fill=WHITE, width=14)

out = Path(__file__).resolve().parent.parent / 'public'
out.mkdir(exist_ok=True)
for size in (192, 512):
    img.resize((size, size), Image.LANCZOS).save(out / f'icon-{size}.png', optimize=True)
print('wrote', out / 'icon-192.png', 'and', out / 'icon-512.png')
