import math
from PIL import Image, ImageDraw, ImageFilter

def create_skillforge_icon():
    size = 512
    # Create image with transparent background
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    
    # 1. Base gradient rounded rectangle
    margin = 28
    corner_radius = 110
    
    # Gradient colors: #4338ca (bottom-left) to #8b5cf6 (top-right)
    c1 = (67, 56, 202, 255)   # #4338ca
    c2 = (139, 92, 246, 255)  # #8b5cf6
    
    # Render gradient into a buffer
    grad = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    for y in range(size):
        for x in range(size):
            # Diagonal gradient factor from (0, size) to (size, 0)
            t = ((x / size) + (1.0 - (y / size))) / 2.0
            t = max(0.0, min(1.0, t))
            r = int(c1[0] + (c2[0] - c1[0]) * t)
            g = int(c1[1] + (c2[1] - c1[1]) * t)
            b = int(c1[2] + (c2[2] - c1[2]) * t)
            grad.putpixel((x, y), (r, g, b, 255))
            
    # Rounded mask
    mask = Image.new('L', (size, size), 0)
    draw_mask = ImageDraw.Draw(mask)
    draw_mask.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=corner_radius,
        fill=255
    )
    
    # Apply mask
    img.paste(grad, (0, 0), mask)
    
    # Add subtle inner border
    border_draw = ImageDraw.Draw(img)
    border_draw.rounded_rectangle(
        [margin, margin, size - margin, size - margin],
        radius=corner_radius,
        outline=(255, 255, 255, 70),
        width=6
    )
    
    # 2. Draw the Lucide "layers" icon in white with soft shadow
    # Lucide layers coordinates in 24x24 box:
    # Scale from 24x24 box to inner icon box
    icon_box_size = 280
    offset_x = (size - icon_box_size) / 2
    offset_y = (size - icon_box_size) / 2
    scale = icon_box_size / 24.0
    
    def transform(x, y):
        return (offset_x + x * scale, offset_y + y * scale)
    
    # Layer paths
    # Top diamond/rhombus: (12, 2.5) -> (21.5, 7) -> (12, 11.5) -> (2.5, 7) -> close
    top_diamond = [
        transform(12.0, 2.8),
        transform(21.4, 7.0),
        transform(12.0, 11.2),
        transform(2.6, 7.0)
    ]
    
    # Middle chevron: (2.5, 12.5) -> (12, 16.7) -> (21.5, 12.5)
    mid_chevron = [
        transform(2.6, 12.5),
        transform(12.0, 16.7),
        transform(21.4, 12.5)
    ]
    
    # Bottom chevron: (2.5, 17.5) -> (12, 21.7) -> (21.5, 17.5)
    bot_chevron = [
        transform(2.6, 17.5),
        transform(12.0, 21.7),
        transform(21.4, 17.5)
    ]
    
    stroke_w = int(18 * (scale / 10.0)) # ~20px width
    
    # Draw soft drop shadow for layers
    shadow_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    s_draw = ImageDraw.Draw(shadow_img)
    shadow_color = (15, 23, 42, 140)
    s_offset = 6
    
    s_top = [(x, y + s_offset) for x, y in top_diamond]
    s_draw.polygon(s_top, outline=shadow_color, width=stroke_w + 4)
    s_mid = [(x, y + s_offset) for x, y in mid_chevron]
    s_draw.line(s_mid, fill=shadow_color, width=stroke_w + 4, joint='round')
    s_bot = [(x, y + s_offset) for x, y in bot_chevron]
    s_draw.line(s_bot, fill=shadow_color, width=stroke_w + 4, joint='round')
    
    shadow_blurred = shadow_img.filter(ImageFilter.GaussianBlur(6))
    img.alpha_composite(shadow_blurred)
    
    # Draw foreground white layers
    fg_draw = ImageDraw.Draw(img)
    white = (255, 255, 255, 255)
    
    # Top diamond
    fg_draw.polygon(top_diamond, outline=white, width=stroke_w)
    # Middle chevron
    fg_draw.line(mid_chevron, fill=white, width=stroke_w, joint='round')
    # Bottom chevron
    fg_draw.line(bot_chevron, fill=white, width=stroke_w, joint='round')
    
    # Save icon files
    ico_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    img.save("app_icon.ico", format="ICO", sizes=ico_sizes)
    img.resize((256, 256), Image.Resampling.LANCZOS).save("app_icon.png", format="PNG")
    img.resize((64, 64), Image.Resampling.LANCZOS).save("frontend/favicon.ico", format="ICO")
    print("SkillForge icons generated successfully: app_icon.ico, app_icon.png, frontend/favicon.ico")

if __name__ == "__main__":
    create_skillforge_icon()
