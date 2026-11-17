from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)

SIZE = 1024
SCALE = SIZE / 256


def point(x, y):
    return round(x * SCALE), round(y * SCALE)


def polygon(points):
    return [point(x, y) for x, y in points]


mask = Image.new("L", (SIZE, SIZE), 0)
ImageDraw.Draw(mask).rounded_rectangle((0, 0, SIZE - 1, SIZE - 1), radius=round(52 * SCALE), fill=255)

background = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
bg_draw = ImageDraw.Draw(background)
for y in range(SIZE):
    mix = y / SIZE
    color = (
        round(25 - 13 * mix),
        round(34 - 18 * mix),
        round(42 - 20 * mix),
        255,
    )
    bg_draw.line((0, y, SIZE, y), fill=color)
background.putalpha(mask)

v_shape = polygon([
    (48, 54), (88, 54), (128, 164), (168, 54),
    (208, 54), (150, 211), (106, 211),
])

glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
ImageDraw.Draw(glow).polygon(v_shape, fill=(190, 255, 103, 170))
glow = glow.filter(ImageFilter.GaussianBlur(round(17 * SCALE)))
glow.putalpha(ImageChops.multiply(glow.getchannel("A"), mask))
icon = Image.alpha_composite(background, glow)

draw = ImageDraw.Draw(icon)
draw.rounded_rectangle(
    (point(9, 9), point(246, 246)),
    radius=round(44 * SCALE),
    outline=(106, 136, 108, 150),
    width=round(2.1 * SCALE),
)
draw.polygon(v_shape, fill=(213, 255, 100, 255))

# A small highlight gives the letter some depth without obscuring it at 16 px.
draw.polygon(polygon([(51, 56), (69, 56), (119, 194), (107, 210)]), fill=(243, 255, 176, 255))
draw.polygon(polygon([(191, 56), (205, 56), (149, 210), (135, 210)]), fill=(153, 224, 71, 255))
draw.ellipse((point(208, 28), point(225, 45)), fill=(255, 138, 103, 255))

preview = icon.resize((256, 256), Image.Resampling.LANCZOS)
preview.save(ASSETS / "voltage-icon.png")
icon.save(
    ASSETS / "voltage.ico",
    format="ICO",
    sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
)
print(ASSETS / "voltage.ico")
