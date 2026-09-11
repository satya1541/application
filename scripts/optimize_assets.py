import os
from PIL import Image

assets_dir = r"d:\project\deluxe-songs\APPLICATION\assets\images"

# Unused boilerplate files to remove
unused_files = [
    "logo-glow.png",
    "tutorial-web.png",
    "react-logo.png",
    "react-logo@2x.png",
    "react-logo@3x.png",
    "expo-badge.png",
    "expo-badge-white.png",
    "expo-logo.png"
]

for filename in unused_files:
    file_path = os.path.join(assets_dir, filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        print(f"Removed unused asset: {filename}")

# Compress and optimize remaining icons
icons_to_optimize = [
    ("icon.png", (1024, 1024)),
    ("splash-icon.png", (512, 512)),
    ("android-icon-foreground.png", (512, 512)),
    ("android-icon-background.png", (512, 512)),
    ("android-icon-monochrome.png", (512, 512)),
    ("favicon.png", (64, 64))
]

src_path = r"C:\Users\satya\.gemini\antigravity-ide\brain\36aeec96-a791-47dd-bcea-2eb4abdc3b30\.user_uploaded\media_1788437882746.png"
src = Image.open(src_path).convert("RGBA")

# 1. icon.png
icon_1024 = src.resize((1024, 1024), Image.Resampling.LANCZOS)
icon_opt = icon_1024.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
icon_opt.save(os.path.join(assets_dir, "icon.png"), "PNG", optimize=True)
print("Optimized icon.png: ", os.path.getsize(os.path.join(assets_dir, "icon.png")), "bytes")

# 2. splash-icon.png
splash_512 = src.resize((512, 512), Image.Resampling.LANCZOS)
splash_opt = splash_512.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
splash_opt.save(os.path.join(assets_dir, "splash-icon.png"), "PNG", optimize=True)
print("Optimized splash-icon.png: ", os.path.getsize(os.path.join(assets_dir, "splash-icon.png")), "bytes")

# 3. android-icon-foreground.png
fg_canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
fg_icon = src.resize((340, 340), Image.Resampling.LANCZOS)
fg_canvas.paste(fg_icon, ((512 - 340) // 2, (512 - 340) // 2), fg_icon)
fg_opt = fg_canvas.quantize(colors=256, method=Image.Quantize.FASTOCTREE)
fg_opt.save(os.path.join(assets_dir, "android-icon-foreground.png"), "PNG", optimize=True)
print("Optimized android-icon-foreground.png: ", os.path.getsize(os.path.join(assets_dir, "android-icon-foreground.png")), "bytes")

# 4. android-icon-background.png (pure white)
bg_canvas = Image.new("RGB", (512, 512), (255, 255, 255))
bg_opt = bg_canvas.quantize(colors=2)
bg_opt.save(os.path.join(assets_dir, "android-icon-background.png"), "PNG", optimize=True)
print("Optimized android-icon-background.png: ", os.path.getsize(os.path.join(assets_dir, "android-icon-background.png")), "bytes")

# 5. android-icon-monochrome.png
mono_canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
mono_icon = src.convert("L").resize((340, 340), Image.Resampling.LANCZOS)
r, g, b, a = src.resize((340, 340), Image.Resampling.LANCZOS).split()
mono_colored = Image.merge("RGBA", (mono_icon, mono_icon, mono_icon, a))
mono_canvas.paste(mono_colored, ((512 - 340) // 2, (512 - 340) // 2), mono_colored)
mono_opt = mono_canvas.quantize(colors=128, method=Image.Quantize.FASTOCTREE)
mono_opt.save(os.path.join(assets_dir, "android-icon-monochrome.png"), "PNG", optimize=True)
print("Optimized android-icon-monochrome.png: ", os.path.getsize(os.path.join(assets_dir, "android-icon-monochrome.png")), "bytes")

# 6. favicon.png
fav = src.resize((64, 64), Image.Resampling.LANCZOS).quantize(colors=64, method=Image.Quantize.FASTOCTREE)
fav.save(os.path.join(assets_dir, "favicon.png"), "PNG", optimize=True)
print("Optimized favicon.png: ", os.path.getsize(os.path.join(assets_dir, "favicon.png")), "bytes")
