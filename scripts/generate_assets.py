from PIL import Image

src_path = r"C:\Users\satya\.gemini\antigravity-ide\brain\36aeec96-a791-47dd-bcea-2eb4abdc3b30\.user_uploaded\media_1788437882746.png"
src = Image.open(src_path).convert("RGBA")

# 1. icon.png (1024x1024)
# Scale with Lanczos to 1024x1024
icon_1024 = src.resize((1024, 1024), Image.Resampling.LANCZOS)
icon_1024.save(r"d:\project\deluxe-songs\APPLICATION\assets\images\icon.png", "PNG")
print("Saved icon.png")

# 2. splash-icon.png (512x512)
splash_512 = src.resize((512, 512), Image.Resampling.LANCZOS)
splash_512.save(r"d:\project\deluxe-songs\APPLICATION\assets\images\splash-icon.png", "PNG")
print("Saved splash-icon.png")

# 3. android-icon-foreground.png (512x512 with safe zone padding ~340x340 in center)
fg_canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
fg_icon = src.resize((340, 340), Image.Resampling.LANCZOS)
fg_canvas.paste(fg_icon, ((512 - 340) // 2, (512 - 340) // 2), fg_icon)
fg_canvas.save(r"d:\project\deluxe-songs\APPLICATION\assets\images\android-icon-foreground.png", "PNG")
print("Saved android-icon-foreground.png")

# 4. android-icon-background.png (512x512 solid white #ffffff)
bg_canvas = Image.new("RGBA", (512, 512), (255, 255, 255, 255))
bg_canvas.save(r"d:\project\deluxe-songs\APPLICATION\assets\images\android-icon-background.png", "PNG")
print("Saved android-icon-background.png")

# 5. android-icon-monochrome.png (512x512 grayscale in safe zone)
mono_canvas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
mono_icon = src.convert("L").resize((340, 340), Image.Resampling.LANCZOS)
# Create white mask with alpha
r, g, b, a = src.resize((340, 340), Image.Resampling.LANCZOS).split()
mono_colored = Image.merge("RGBA", (mono_icon, mono_icon, mono_icon, a))
mono_canvas.paste(mono_colored, ((512 - 340) // 2, (512 - 340) // 2), mono_colored)
mono_canvas.save(r"d:\project\deluxe-songs\APPLICATION\assets\images\android-icon-monochrome.png", "PNG")
print("Saved android-icon-monochrome.png")

# 6. favicon.png (64x64)
fav = src.resize((64, 64), Image.Resampling.LANCZOS)
fav.save(r"d:\project\deluxe-songs\APPLICATION\assets\images\favicon.png", "PNG")
print("Saved favicon.png")
