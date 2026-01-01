#!/usr/bin/env python3
"""
AI Video Generation - Professional Documentary Video Processing Module
Uses FFmpeg native filters for fast, high-quality rendering with
VidRush-style Ken Burns effects, crossfade transitions, and cinematic look.
"""

import os
import sys
import json
import subprocess
import tempfile
import random
from pathlib import Path
from typing import List, Dict, Optional, Tuple

OUTPUT_DIR = Path("./generated_videos")
TEMP_DIR = Path("./temp_processing")

# Professional Ken Burns effect presets - VidRush style
# Each preset defines start/end zoom and pan positions for smooth motion
KEN_BURNS_PRESETS = {
    # Basic motions
    "zoom_in_center": {
        "start_zoom": 1.0, "end_zoom": 1.20,
        "start_x": 0.5, "end_x": 0.5,
        "start_y": 0.5, "end_y": 0.5,
    },
    "zoom_out_center": {
        "start_zoom": 1.25, "end_zoom": 1.0,
        "start_x": 0.5, "end_x": 0.5,
        "start_y": 0.5, "end_y": 0.5,
    },
    # Pan with slight zoom
    "pan_left_zoom": {
        "start_zoom": 1.15, "end_zoom": 1.20,
        "start_x": 0.65, "end_x": 0.35,
        "start_y": 0.5, "end_y": 0.5,
    },
    "pan_right_zoom": {
        "start_zoom": 1.15, "end_zoom": 1.20,
        "start_x": 0.35, "end_x": 0.65,
        "start_y": 0.5, "end_y": 0.5,
    },
    "pan_up_zoom": {
        "start_zoom": 1.15, "end_zoom": 1.20,
        "start_x": 0.5, "end_x": 0.5,
        "start_y": 0.60, "end_y": 0.40,
    },
    "pan_down_zoom": {
        "start_zoom": 1.15, "end_zoom": 1.20,
        "start_x": 0.5, "end_x": 0.5,
        "start_y": 0.40, "end_y": 0.60,
    },
    # Diagonal movements (cinematic)
    "diagonal_tl_br": {
        "start_zoom": 1.10, "end_zoom": 1.25,
        "start_x": 0.35, "end_x": 0.65,
        "start_y": 0.35, "end_y": 0.65,
    },
    "diagonal_tr_bl": {
        "start_zoom": 1.10, "end_zoom": 1.25,
        "start_x": 0.65, "end_x": 0.35,
        "start_y": 0.35, "end_y": 0.65,
    },
    "diagonal_bl_tr": {
        "start_zoom": 1.25, "end_zoom": 1.10,
        "start_x": 0.35, "end_x": 0.65,
        "start_y": 0.65, "end_y": 0.35,
    },
    "diagonal_br_tl": {
        "start_zoom": 1.25, "end_zoom": 1.10,
        "start_x": 0.65, "end_x": 0.35,
        "start_y": 0.65, "end_y": 0.35,
    },
    # Focus pulls (zoom to specific area)
    "focus_top_left": {
        "start_zoom": 1.0, "end_zoom": 1.35,
        "start_x": 0.5, "end_x": 0.30,
        "start_y": 0.5, "end_y": 0.30,
    },
    "focus_top_right": {
        "start_zoom": 1.0, "end_zoom": 1.35,
        "start_x": 0.5, "end_x": 0.70,
        "start_y": 0.5, "end_y": 0.30,
    },
    "focus_bottom_center": {
        "start_zoom": 1.0, "end_zoom": 1.30,
        "start_x": 0.5, "end_x": 0.5,
        "start_y": 0.5, "end_y": 0.70,
    },
    # Reveal movements (zoom out from detail)
    "reveal_from_center": {
        "start_zoom": 1.40, "end_zoom": 1.0,
        "start_x": 0.5, "end_x": 0.5,
        "start_y": 0.5, "end_y": 0.5,
    },
    "reveal_from_left": {
        "start_zoom": 1.35, "end_zoom": 1.0,
        "start_x": 0.30, "end_x": 0.5,
        "start_y": 0.5, "end_y": 0.5,
    },
    "reveal_from_right": {
        "start_zoom": 1.35, "end_zoom": 1.0,
        "start_x": 0.70, "end_x": 0.5,
        "start_y": 0.5, "end_y": 0.5,
    },
}

# Effect sequences for documentary pacing (avoid repetition)
EFFECT_SEQUENCES = [
    ["zoom_in_center", "pan_left_zoom", "diagonal_tl_br", "reveal_from_center", "pan_right_zoom", "focus_top_left"],
    ["pan_right_zoom", "zoom_out_center", "diagonal_br_tl", "pan_up_zoom", "focus_bottom_center", "reveal_from_right"],
    ["diagonal_bl_tr", "zoom_in_center", "pan_left_zoom", "reveal_from_left", "diagonal_tr_bl", "pan_down_zoom"],
]

def get_effect_for_scene(scene_index: int, total_scenes: int) -> str:
    """Get a Ken Burns effect that creates visual variety without repetition."""
    sequence = EFFECT_SEQUENCES[scene_index % len(EFFECT_SEQUENCES)]
    return sequence[scene_index % len(sequence)]


# =============================================================================
# TEXT OVERLAY AND TYPEWRITER EFFECTS - VidRush Documentary Style
# =============================================================================

# Text overlay styles for different documentary elements
TEXT_STYLES = {
    "year_title": {
        "fontsize": 180,
        "fontcolor": "beige",
        "font": "Serif",
        "position": "center",
        "shadow": True,
        "fade_in": 0.5,
    },
    "chapter_title": {
        "fontsize": 72,
        "fontcolor": "beige",
        "font": "Serif",
        "position": "center",
        "shadow": True,
        "typewriter": True,
        "fade_in": 0.3,
    },
    "date_overlay": {
        "fontsize": 48,
        "fontcolor": "white",
        "font": "Serif",
        "position": "top_right",
        "shadow": True,
        "fade_in": 0.4,
    },
    "location_text": {
        "fontsize": 36,
        "fontcolor": "white@0.9",
        "font": "Sans",
        "position": "bottom_left",
        "shadow": True,
        "typewriter": True,
        "fade_in": 0.3,
    },
    "caption": {
        "fontsize": 32,
        "fontcolor": "white",
        "font": "Sans",
        "position": "bottom_center",
        "shadow": True,
        "box": True,
        "fade_in": 0.2,
    },
    # VidRush-style advanced overlays
    "letterbox_caption": {
        "fontsize": 42,
        "fontcolor": "beige",
        "font": "Serif",
        "position": "letterbox_bottom",
        "shadow": False,
        "fade_in": 0.5,
    },
    "quote_box": {
        "fontsize": 38,
        "fontcolor": "#F5F0E8",
        "font": "Serif",
        "position": "top_left",
        "shadow": False,
        "box": True,
        "box_color": "#C9A67A@0.85",
        "fade_in": 0.4,
        "typewriter": True,
    },
    "date_stamp": {
        "fontsize": 52,
        "fontcolor": "white",
        "font": "Serif",
        "position": "bottom_left",
        "shadow": False,
        "box": True,
        "box_color": "#2C2C2C@0.9",
        "fade_in": 0.3,
    },
    "title_subtitle": {
        "fontsize": 36,
        "fontcolor": "beige@0.9",
        "font": "Serif",
        "position": "center_left",
        "shadow": True,
        "fade_in": 0.4,
    },
}


def get_text_position(position: str, w: int, h: int, text_w: int = 0, text_h: int = 0) -> Tuple[str, str]:
    """Calculate x,y position expressions for text placement."""
    positions = {
        "center": ("(w-text_w)/2", "(h-text_h)/2"),
        "center_left": ("80", "(h-text_h)/2"),
        "center_right": ("w-text_w-80", "(h-text_h)/2"),
        "top_left": ("50", "50"),
        "top_right": ("w-text_w-50", "50"),
        "top_center": ("(w-text_w)/2", "80"),
        "bottom_left": ("50", "h-text_h-80"),
        "bottom_right": ("w-text_w-50", "h-text_h-80"),
        "bottom_center": ("(w-text_w)/2", "h-text_h-80"),
        "letterbox_bottom": ("(w-text_w)/2", "h-120"),
    }
    return positions.get(position, positions["center"])


def build_typewriter_filter(
    text: str,
    style: str = "chapter_title",
    start_time: float = 0.5,
    chars_per_second: float = 12.0,
    duration: Optional[float] = None,
    w: int = 1920,
    h: int = 1080,
    fps: int = 24
) -> str:
    """
    Build FFmpeg drawtext filter with typewriter effect.
    Text appears character by character like a typewriter.
    Supports multi-line text (split by newlines) and box backgrounds.
    """
    style_config = TEXT_STYLES.get(style, TEXT_STYLES["chapter_title"])
    
    fontsize = style_config["fontsize"]
    fontcolor = style_config["fontcolor"]
    font = style_config["font"]
    position = style_config["position"]
    has_shadow = style_config.get("shadow", False)
    has_box = style_config.get("box", False)
    box_color = style_config.get("box_color", "black@0.5")
    
    base_x, base_y = get_text_position(position, w, h)
    line_height = int(fontsize * 1.4)
    char_width = fontsize * 0.55
    
    filters = []
    
    # For quote boxes with background, draw the box first (appears immediately)
    # The box needs to be sized for the full text
    if has_box:
        lines = text.split('\n') if '\n' in text else [text]
        max_line_len = max(len(line) for line in lines)
        num_lines = len(lines)
        box_w = int(max_line_len * char_width + 50)
        box_h = int(num_lines * line_height + 30)
        
        # Draw a colored rectangle using drawbox filter
        box_filter = f"drawbox=x={base_x}:y={base_y}:w={box_w}:h={box_h}:color={box_color}:t=fill:enable='gte(t,{start_time - 0.1:.3f})'"
        filters.append(box_filter)
    
    # Split text into lines for multi-line support
    lines = text.split('\n') if '\n' in text else [text]
    char_index = 0
    
    for line_num, line in enumerate(lines):
        y_offset = line_num * line_height
        
        for char_in_line, char in enumerate(line):
            char_start = start_time + (char_index / chars_per_second)
            char_escaped = char.replace("'", "\\'").replace(":", "\\:").replace("\\", "\\\\")
            if char == " ":
                char_escaped = " "
            
            # Calculate x offset within the line
            x_offset = char_in_line * char_width
            
            # Build position expressions
            if position == "center":
                line_width = len(line) * char_width
                char_x = f"((w-{line_width})/2)+{x_offset}"
                char_y = f"((h-{len(lines) * line_height})/2)+{y_offset}"
            else:
                char_x = f"({base_x})+20+{x_offset}"
                char_y = f"({base_y})+15+{y_offset}"
            
            enable_expr = f"gte(t,{char_start:.3f})"
            
            # Shadow layer
            if has_shadow:
                shadow_filter = f"drawtext=text='{char_escaped}':fontsize={fontsize}:fontcolor=black@0.6:font={font}:x={char_x}+3:y={char_y}+3:enable='{enable_expr}'"
                filters.append(shadow_filter)
            
            # Main character
            char_filter = f"drawtext=text='{char_escaped}':fontsize={fontsize}:fontcolor={fontcolor}:font={font}:x={char_x}:y={char_y}:enable='{enable_expr}'"
            filters.append(char_filter)
            
            char_index += 1
        
        # Count newline as a character for timing
        char_index += 1
    
    return ",".join(filters)


def build_simple_text_filter(
    text: str,
    style: str = "year_title",
    start_time: float = 0.0,
    end_time: Optional[float] = None,
    fade_duration: float = 0.5,
    w: int = 1920,
    h: int = 1080
) -> str:
    """
    Build simple text overlay with fade in/out.
    For titles, dates, and static text.
    """
    style_config = TEXT_STYLES.get(style, TEXT_STYLES["year_title"])
    
    fontsize = style_config["fontsize"]
    fontcolor = style_config["fontcolor"]
    font = style_config["font"]
    position = style_config["position"]
    has_shadow = style_config.get("shadow", False)
    has_box = style_config.get("box", False)
    
    x_pos, y_pos = get_text_position(position, w, h)
    
    # Escape text
    escaped_text = text.replace("'", "\\'").replace(":", "\\:")
    
    # Build enable expression with fade
    if end_time:
        # Fade in and out
        alpha_expr = f"if(lt(t,{start_time}),0,if(lt(t,{start_time + fade_duration}),(t-{start_time})/{fade_duration},if(lt(t,{end_time - fade_duration}),1,if(lt(t,{end_time}),({end_time}-t)/{fade_duration},0))))"
        enable_expr = f"between(t,{start_time},{end_time})"
    else:
        # Fade in only, stay visible
        alpha_expr = f"if(lt(t,{start_time}),0,if(lt(t,{start_time + fade_duration}),(t-{start_time})/{fade_duration},1))"
        enable_expr = f"gte(t,{start_time})"
    
    filters = []
    
    # Shadow layer
    if has_shadow:
        shadow = f"drawtext=text='{escaped_text}':fontsize={fontsize}:fontcolor=black@0.6:font={font}:x={x_pos}+4:y={y_pos}+4:enable='{enable_expr}'"
        filters.append(shadow)
    
    # Box background
    box_opts = ""
    if has_box:
        box_color = style_config.get("box_color", "black@0.5")
        box_opts = f":box=1:boxcolor={box_color}:boxborderw=18"
    
    # Main text
    main_text = f"drawtext=text='{escaped_text}':fontsize={fontsize}:fontcolor={fontcolor}:font={font}:x={x_pos}:y={y_pos}:enable='{enable_expr}'{box_opts}"
    filters.append(main_text)
    
    return ",".join(filters)


def generate_typewriter_sound(duration: float, chars_per_second: float = 12.0, output_path: Optional[str] = None) -> Optional[str]:
    """
    Generate typewriter click sound effect using FFmpeg.
    Creates rhythmic clicking sounds synchronized with text reveal.
    """
    if output_path is None:
        output_path = str(TEMP_DIR / "typewriter_sound.wav")
    
    # Generate clicks using FFmpeg's sine wave with decay envelope
    # Each "click" is a short burst of white noise
    click_interval = 1.0 / chars_per_second
    num_clicks = int(duration * chars_per_second)
    
    # Create a series of short noise bursts
    # Using aevalsrc to generate impulses at regular intervals
    filter_expr = f"aevalsrc=exprs='random(0)*exp(-100*mod(t,{click_interval}))':s=48000:d={duration}"
    
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi", "-i", filter_expr,
        "-af", "volume=0.3,lowpass=f=3000,highpass=f=500",
        "-c:a", "pcm_s16le",
        output_path
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0 and os.path.exists(output_path):
        return output_path
    return None


# =============================================================================
# ADVANCED DOCUMENTARY EFFECTS - VidRush Style
# =============================================================================

def create_letterbox_scene(
    image_path: str,
    output_path: str,
    caption: str,
    duration: float = 6.0,
    audio_path: Optional[str] = None,
    effect: str = "zoom_in_center",
    fps: int = 24,
    resolution: tuple = (1920, 1080)
) -> bool:
    """
    Create a scene with letterbox framing - black bars above and below
    with caption text centered in the lower black bar.
    Like: "Führerbunker Tension, 1945"
    """
    try:
        ensure_dirs()
        w, h = resolution
        total_frames = int(duration * fps)
        
        # Image area with letterbox (16:9 content in letterbox frame)
        bar_height = int(h * 0.12)  # 12% top and bottom bars
        content_height = h - (2 * bar_height)
        
        # Ken Burns on the content area
        zoompan = build_zoompan_filter(effect, total_frames, w, content_height, fps)
        bw_filter = "hue=s=0,eq=contrast=1.15:brightness=0.02:gamma=1.05"
        
        # Escape caption text
        escaped_caption = caption.replace("'", "\\'").replace(":", "\\:")
        
        # Build filter: scale image, apply Ken Burns, add black bars, add caption
        filter_complex = f"""
[0:v]scale={w}:{content_height}:force_original_aspect_ratio=increase,crop={w}:{content_height},{zoompan},{bw_filter}[content];
color=black:s={w}x{bar_height}:d={duration}:r={fps}[topbar];
color=black:s={w}x{bar_height}:d={duration}:r={fps}[bottombar];
[topbar][content][bottombar]vstack=inputs=3[framed];
[framed]drawtext=text='{escaped_caption}':fontsize=42:fontcolor=beige:font=Serif:x=(w-text_w)/2:y=h-{bar_height//2+20}:enable='gte(t,0.5)',format=yuv420p[v]
"""
        
        if audio_path and os.path.exists(audio_path):
            audio_duration = get_audio_duration(audio_path)
            duration = max(duration, audio_duration + 0.4)
            audio_filter = f"apad=whole_dur={duration}"
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", image_path,
                "-i", audio_path,
                "-filter_complex", filter_complex.replace("\n", " "),
                "-af", audio_filter,
                "-map", "[v]", "-map", "1:a",
                "-c:v", "libx264", "-preset", "slow", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k",
                "-t", str(duration),
                output_path
            ]
        else:
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", image_path,
                "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=48000:duration={duration}",
                "-filter_complex", filter_complex.replace("\n", " "),
                "-map", "[v]", "-map", "1:a",
                "-c:v", "libx264", "-preset", "slow", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k",
                "-t", str(duration),
                output_path
            ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Letterbox error: {result.stderr[:500]}", file=sys.stderr)
        return result.returncode == 0
        
    except Exception as e:
        print(f"Error creating letterbox scene: {e}", file=sys.stderr)
        return False


def create_pip_scene(
    main_image: str,
    inset_image: str,
    output_path: str,
    duration: float = 6.0,
    audio_path: Optional[str] = None,
    inset_position: str = "bottom_right",
    inset_size: float = 0.25,
    border_color: str = "white",
    border_width: int = 4,
    fps: int = 24,
    resolution: tuple = (1920, 1080)
) -> bool:
    """
    Create picture-in-picture scene with main image and bordered inset.
    Inset can be positioned in corners with customizable border.
    """
    try:
        ensure_dirs()
        w, h = resolution
        total_frames = int(duration * fps)
        
        inset_w = int(w * inset_size)
        inset_h = int(h * inset_size)
        padding = 30
        
        # Position calculations
        positions = {
            "top_left": (padding, padding),
            "top_right": (w - inset_w - padding, padding),
            "bottom_left": (padding, h - inset_h - padding),
            "bottom_right": (w - inset_w - padding, h - inset_h - padding),
        }
        inset_x, inset_y = positions.get(inset_position, positions["bottom_right"])
        
        # Ken Burns on main image
        zoompan = build_zoompan_filter("zoom_in_center", total_frames, w, h, fps)
        bw_filter = "hue=s=0,eq=contrast=1.1:brightness=0.02"
        
        # Build filter for PIP with border
        filter_complex = f"""
[0:v]scale={w}x{h}:force_original_aspect_ratio=increase,crop={w}:{h},{zoompan},{bw_filter}[main];
[1:v]scale={inset_w-border_width*2}x{inset_h-border_width*2}:force_original_aspect_ratio=decrease,pad={inset_w}:{inset_h}:(ow-iw)/2:(oh-ih)/2:color={border_color}[inset];
[main][inset]overlay={inset_x}:{inset_y}:enable='gte(t,0.3)',format=yuv420p[v]
"""
        
        if audio_path and os.path.exists(audio_path):
            audio_duration = get_audio_duration(audio_path)
            duration = max(duration, audio_duration + 0.4)
            audio_filter = f"apad=whole_dur={duration}"
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", main_image,
                "-loop", "1", "-i", inset_image,
                "-i", audio_path,
                "-filter_complex", filter_complex.replace("\n", " "),
                "-af", audio_filter,
                "-map", "[v]", "-map", "2:a",
                "-c:v", "libx264", "-preset", "slow", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k",
                "-t", str(duration),
                output_path
            ]
        else:
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", main_image,
                "-loop", "1", "-i", inset_image,
                "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=48000:duration={duration}",
                "-filter_complex", filter_complex.replace("\n", " "),
                "-map", "[v]", "-map", "2:a",
                "-c:v", "libx264", "-preset", "slow", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k",
                "-t", str(duration),
                output_path
            ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"PIP error: {result.stderr[:500]}", file=sys.stderr)
        return result.returncode == 0
        
    except Exception as e:
        print(f"Error creating PIP scene: {e}", file=sys.stderr)
        return False


def create_quote_box_scene(
    image_path: str,
    output_path: str,
    quote_text: str,
    duration: float = 6.0,
    audio_path: Optional[str] = None,
    effect: str = "zoom_in_center",
    box_position: str = "top_left",
    typewriter: bool = True,
    fps: int = 24,
    resolution: tuple = (1920, 1080)
) -> bool:
    """
    Create scene with quote box overlay - multi-line text with 
    beige/cream semi-transparent background box.
    Like: "The war is lost—yet Hitler vows to remain in Berlin."
    """
    try:
        ensure_dirs()
        w, h = resolution
        total_frames = int(duration * fps)
        
        zoompan = build_zoompan_filter(effect, total_frames, w, h, fps)
        bw_filter = "hue=s=0,eq=contrast=1.15:brightness=0.02"
        
        # Escape and wrap text for multi-line display
        escaped_text = quote_text.replace("'", "\\'").replace(":", "\\:")
        
        # Position for quote box
        positions = {
            "top_left": (40, 60),
            "top_right": (w - 700, 60),
            "bottom_left": (40, h - 200),
            "center": ((w - 700) // 2, (h - 150) // 2),
        }
        box_x, box_y = positions.get(box_position, positions["top_left"])
        
        # Build quote box with typewriter or static text
        if typewriter:
            text_filter = build_typewriter_filter(quote_text, "quote_box", start_time=0.5, w=w, h=h, fps=fps)
        else:
            text_filter = f"drawtext=text='{escaped_text}':fontsize=38:fontcolor=white:font=Serif:x={box_x}+20:y={box_y}+20:box=1:boxcolor=#C9A67A@0.85:boxborderw=20:enable='gte(t,0.4)'"
        
        filter_complex = f"[0:v]scale={w}x{h}:force_original_aspect_ratio=increase,crop={w}:{h},{zoompan},{bw_filter},{text_filter},format=yuv420p[v]"
        
        if audio_path and os.path.exists(audio_path):
            audio_duration = get_audio_duration(audio_path)
            duration = max(duration, audio_duration + 0.4)
            audio_filter = f"apad=whole_dur={duration}"
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", image_path,
                "-i", audio_path,
                "-filter_complex", filter_complex,
                "-af", audio_filter,
                "-map", "[v]", "-map", "1:a",
                "-c:v", "libx264", "-preset", "slow", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k",
                "-t", str(duration),
                output_path
            ]
        else:
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", image_path,
                "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=48000:duration={duration}",
                "-filter_complex", filter_complex,
                "-map", "[v]", "-map", "1:a",
                "-c:v", "libx264", "-preset", "slow", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k",
                "-t", str(duration),
                output_path
            ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Quote box error: {result.stderr[:500]}", file=sys.stderr)
        return result.returncode == 0
        
    except Exception as e:
        print(f"Error creating quote box scene: {e}", file=sys.stderr)
        return False


def create_date_stamp_scene(
    image_path: str,
    output_path: str,
    date_text: str,
    duration: float = 6.0,
    audio_path: Optional[str] = None,
    effect: str = "zoom_in_center",
    fps: int = 24,
    resolution: tuple = (1920, 1080)
) -> bool:
    """
    Create scene with vintage date stamp overlay.
    Date appears in bottom-left with dark background box.
    Like: "22 April 1945"
    """
    try:
        ensure_dirs()
        w, h = resolution
        total_frames = int(duration * fps)
        
        zoompan = build_zoompan_filter(effect, total_frames, w, h, fps)
        bw_filter = "hue=s=0,eq=contrast=1.15:brightness=0.02"
        
        escaped_date = date_text.replace("'", "\\'").replace(":", "\\:")
        
        # Date stamp with dark box - bottom left position
        text_filter = f"drawtext=text='{escaped_date}':fontsize=52:fontcolor=white:font=Serif:x=50:y=h-130:box=1:boxcolor=#2C2C2C@0.9:boxborderw=18:enable='gte(t,0.4)'"
        
        filter_complex = f"[0:v]scale={w}x{h}:force_original_aspect_ratio=increase,crop={w}:{h},{zoompan},{bw_filter},{text_filter},format=yuv420p[v]"
        
        if audio_path and os.path.exists(audio_path):
            audio_duration = get_audio_duration(audio_path)
            duration = max(duration, audio_duration + 0.4)
            audio_filter = f"apad=whole_dur={duration}"
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", image_path,
                "-i", audio_path,
                "-filter_complex", filter_complex,
                "-af", audio_filter,
                "-map", "[v]", "-map", "1:a",
                "-c:v", "libx264", "-preset", "slow", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k",
                "-t", str(duration),
                output_path
            ]
        else:
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", image_path,
                "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=48000:duration={duration}",
                "-filter_complex", filter_complex,
                "-map", "[v]", "-map", "1:a",
                "-c:v", "libx264", "-preset", "slow", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k",
                "-t", str(duration),
                output_path
            ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Date stamp error: {result.stderr[:500]}", file=sys.stderr)
        return result.returncode == 0
        
    except Exception as e:
        print(f"Error creating date stamp scene: {e}", file=sys.stderr)
        return False


def create_split_screen_scene(
    left_image: str,
    right_image: str,
    output_path: str,
    duration: float = 6.0,
    audio_path: Optional[str] = None,
    gap_width: int = 4,
    fps: int = 24,
    resolution: tuple = (1920, 1080)
) -> bool:
    """
    Create side-by-side split screen comparison.
    Two images displayed with optional gap between them.
    """
    try:
        ensure_dirs()
        w, h = resolution
        total_frames = int(duration * fps)
        half_w = (w - gap_width) // 2
        
        bw_filter = "hue=s=0,eq=contrast=1.1:brightness=0.02"
        
        # Ken Burns on each half
        left_zoom = build_zoompan_filter("pan_right_zoom", total_frames, half_w, h, fps)
        right_zoom = build_zoompan_filter("pan_left_zoom", total_frames, half_w, h, fps)
        
        filter_complex = f"""
[0:v]scale={half_w}x{h}:force_original_aspect_ratio=increase,crop={half_w}:{h},{left_zoom},{bw_filter}[left];
[1:v]scale={half_w}x{h}:force_original_aspect_ratio=increase,crop={half_w}:{h},{right_zoom},{bw_filter}[right];
color=black:s={gap_width}x{h}:d={duration}:r={fps}[gap];
[left][gap][right]hstack=inputs=3,format=yuv420p[v]
"""
        
        if audio_path and os.path.exists(audio_path):
            audio_duration = get_audio_duration(audio_path)
            duration = max(duration, audio_duration + 0.4)
            audio_filter = f"apad=whole_dur={duration}"
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", left_image,
                "-loop", "1", "-i", right_image,
                "-i", audio_path,
                "-filter_complex", filter_complex.replace("\n", " "),
                "-af", audio_filter,
                "-map", "[v]", "-map", "2:a",
                "-c:v", "libx264", "-preset", "slow", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k",
                "-t", str(duration),
                output_path
            ]
        else:
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", left_image,
                "-loop", "1", "-i", right_image,
                "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=48000:duration={duration}",
                "-filter_complex", filter_complex.replace("\n", " "),
                "-map", "[v]", "-map", "2:a",
                "-c:v", "libx264", "-preset", "slow", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k",
                "-t", str(duration),
                output_path
            ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Split screen error: {result.stderr[:500]}", file=sys.stderr)
        return result.returncode == 0
        
    except Exception as e:
        print(f"Error creating split screen scene: {e}", file=sys.stderr)
        return False


def create_portrait_title_card(
    background_image: str,
    portrait_image: str,
    output_path: str,
    title: str,
    subtitle: str = "",
    duration: float = 5.0,
    audio_path: Optional[str] = None,
    border_color: str = "#C9A67A",
    fps: int = 24,
    resolution: tuple = (1920, 1080)
) -> bool:
    """
    Create title card with blurred background and gold-bordered portrait inset.
    Title and subtitle appear on the left, portrait on the right.
    Like: "STAY-PUT ORDER / Berlin – 22 April 1945" with portrait
    """
    try:
        ensure_dirs()
        w, h = resolution
        total_frames = int(duration * fps)
        
        portrait_w = int(w * 0.25)
        portrait_h = int(h * 0.55)
        portrait_x = w - portrait_w - 100
        portrait_y = (h - portrait_h) // 2
        border = 6
        
        # Escape text
        escaped_title = title.replace("'", "\\'").replace(":", "\\:")
        escaped_subtitle = subtitle.replace("'", "\\'").replace(":", "\\:")
        
        bw_filter = "hue=s=0,eq=contrast=0.8:brightness=-0.05:gamma=0.9"
        
        # Build complex filter with blurred background, portrait with border, and text
        filter_complex = f"""
[0:v]scale={w}x{h}:force_original_aspect_ratio=increase,crop={w}:{h},{bw_filter},gblur=sigma=8[bg];
[1:v]scale={portrait_w-border*2}x{portrait_h-border*2}:force_original_aspect_ratio=decrease,hue=s=0,pad={portrait_w}:{portrait_h}:(ow-iw)/2:(oh-ih)/2:color={border_color}[portrait];
[bg][portrait]overlay={portrait_x}:{portrait_y}:enable='gte(t,0.3)'[comp];
[comp]drawtext=text='{escaped_title}':fontsize=56:fontcolor=beige:font=Serif:x=80:y=(h-text_h)/2-30:enable='gte(t,0.5)',drawtext=text='{escaped_subtitle}':fontsize=32:fontcolor=beige@0.85:font=Serif:x=80:y=(h/2)+40:enable='gte(t,0.7)',format=yuv420p[v]
"""
        
        if audio_path and os.path.exists(audio_path):
            audio_duration = get_audio_duration(audio_path)
            duration = max(duration, audio_duration + 0.4)
            audio_filter = f"apad=whole_dur={duration}"
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", background_image,
                "-loop", "1", "-i", portrait_image,
                "-i", audio_path,
                "-filter_complex", filter_complex.replace("\n", " "),
                "-af", audio_filter,
                "-map", "[v]", "-map", "2:a",
                "-c:v", "libx264", "-preset", "slow", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k",
                "-t", str(duration),
                output_path
            ]
        else:
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", background_image,
                "-loop", "1", "-i", portrait_image,
                "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=48000:duration={duration}",
                "-filter_complex", filter_complex.replace("\n", " "),
                "-map", "[v]", "-map", "2:a",
                "-c:v", "libx264", "-preset", "slow", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k",
                "-t", str(duration),
                output_path
            ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Portrait title card error: {result.stderr[:500]}", file=sys.stderr)
        return result.returncode == 0
        
    except Exception as e:
        print(f"Error creating portrait title card: {e}", file=sys.stderr)
        return False


def create_title_card(
    text: str,
    output_path: str,
    style: str = "year_title",
    duration: float = 3.0,
    background_image: Optional[str] = None,
    background_color: str = "black",
    typewriter: bool = False,
    fps: int = 24,
    resolution: tuple = (1920, 1080)
) -> bool:
    """
    Create a title card with optional typewriter effect.
    Can overlay on background image or solid color.
    """
    try:
        ensure_dirs()
        w, h = resolution
        total_frames = int(duration * fps)
        
        # Build text filter
        if typewriter:
            text_filter = build_typewriter_filter(text, style, start_time=0.3, w=w, h=h, fps=fps)
        else:
            text_filter = build_simple_text_filter(text, style, start_time=0.2, fade_duration=0.4, w=w, h=h)
        
        if background_image and os.path.exists(background_image):
            # Use image as background with Ken Burns
            zoompan = build_zoompan_filter("zoom_in_center", total_frames, w, h, fps)
            bw_filter = "hue=s=0,eq=contrast=1.1:brightness=0.02"
            
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", background_image,
                "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=48000:duration={duration}",
                "-filter_complex", f"[0:v]{zoompan},{bw_filter},{text_filter},format=yuv420p[v]",
                "-map", "[v]", "-map", "1:a",
                "-c:v", "libx264", "-preset", "slow", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k",
                "-t", str(duration),
                output_path
            ]
        else:
            # Solid color background
            cmd = [
                "ffmpeg", "-y",
                "-f", "lavfi", "-i", f"color=c={background_color}:s={w}x{h}:d={duration}:r={fps}",
                "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=48000:duration={duration}",
                "-filter_complex", f"[0:v]{text_filter},format=yuv420p[v]",
                "-map", "[v]", "-map", "1:a",
                "-c:v", "libx264", "-preset", "slow", "-crf", "18",
                "-c:a", "aac", "-b:a", "192k",
                "-t", str(duration),
                output_path
            ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Title card error: {result.stderr}", file=sys.stderr)
        return result.returncode == 0
        
    except Exception as e:
        print(f"Error creating title card: {e}", file=sys.stderr)
        return False


def ensure_dirs():
    """Create necessary directories."""
    OUTPUT_DIR.mkdir(exist_ok=True)
    TEMP_DIR.mkdir(exist_ok=True)


def get_audio_duration(audio_path: str) -> float:
    """Get audio duration using ffprobe."""
    try:
        cmd = [
            "ffprobe", "-v", "quiet", "-show_entries", "format=duration",
            "-of", "json", audio_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            data = json.loads(result.stdout)
            return float(data.get("format", {}).get("duration", 5.0))
    except:
        pass
    return 5.0


def build_zoompan_filter(effect: str, total_frames: int, w: int, h: int, fps: int) -> str:
    """
    Build a professional Ken Burns zoompan filter with smooth easing.
    Uses preset-based motion for VidRush-style documentary effects.
    """
    preset = KEN_BURNS_PRESETS.get(effect, KEN_BURNS_PRESETS["zoom_in_center"])
    
    sz = preset["start_zoom"]
    ez = preset["end_zoom"]
    sx = preset["start_x"]
    ex = preset["end_x"]
    sy = preset["start_y"]
    ey = preset["end_y"]
    
    # Smooth easing using sine curve: sin((on/d)*PI/2)^2 for ease-in-out
    # t = on/{total_frames} is progress 0->1
    # ease = (1 - cos(t * PI)) / 2 gives smooth S-curve
    t = f"(on/{total_frames})"
    ease = f"((1-cos({t}*PI))/2)"
    
    # Interpolate zoom with easing
    zoom_expr = f"({sz}+({ez}-{sz})*{ease})"
    
    # Calculate pan positions (relative to image dimensions)
    # x position: start_x -> end_x (0.0-1.0 maps to image position)
    x_expr = f"(({sx}+({ex}-{sx})*{ease})*iw - iw/zoom/2)"
    y_expr = f"(({sy}+({ey}-{sy})*{ease})*ih - ih/zoom/2)"
    
    return f"zoompan=z='{zoom_expr}':x='{x_expr}':y='{y_expr}':d={total_frames}:s={w}x{h}:fps={fps}"


def create_scene_clip_ffmpeg(
    image_path: str,
    output_path: str,
    duration: float,
    audio_path: Optional[str] = None,
    effect: str = "zoom_in_center",
    fps: int = 24,
    resolution: tuple = (1920, 1080),
    quality: str = "high",
    text_overlay: Optional[Dict] = None
) -> bool:
    """
    Create a single scene clip with professional Ken Burns effect.
    Uses preset-based motion with smooth easing for VidRush-style quality.
    
    text_overlay options:
        - text: str - The text to display
        - style: str - Style preset (year_title, chapter_title, date_overlay, location_text, caption)
        - typewriter: bool - Use typewriter animation
        - start_time: float - When text appears (default 0.5)
    """
    try:
        w, h = resolution
        total_frames = int(duration * fps)
        
        # Map legacy effect names to new presets
        effect_mapping = {
            "zoom_in": "zoom_in_center",
            "zoom_out": "zoom_out_center", 
            "pan_left": "pan_left_zoom",
            "pan_right": "pan_right_zoom",
            "pan_up": "pan_up_zoom",
            "pan_down": "pan_down_zoom",
        }
        effect = effect_mapping.get(effect, effect)
        
        # Build zoompan filter with smooth easing
        zoompan = build_zoompan_filter(effect, total_frames, w, h, fps)
        
        # Professional documentary look filters
        # - Black and white with enhanced contrast
        # - Subtle film grain for cinematic feel
        # - Slight vignette for focus
        bw_filter = "hue=s=0"
        contrast_filter = "eq=contrast=1.1:brightness=0.02"
        
        # Quality settings based on mode
        if quality == "high":
            crf = "18"
            preset = "slow"
            profile = "-profile:v high -level 4.2"
        else:
            crf = "23"
            preset = "fast"
            profile = ""
        
        video_filters = f"{zoompan},{bw_filter},{contrast_filter}"
        
        # Add text overlay if specified
        if text_overlay and text_overlay.get("text"):
            overlay_text = text_overlay["text"]
            overlay_style = text_overlay.get("style", "date_overlay")
            use_typewriter = text_overlay.get("typewriter", False)
            text_start = text_overlay.get("start_time", 0.5)
            
            if use_typewriter:
                text_filter = build_typewriter_filter(
                    overlay_text, overlay_style, start_time=text_start, w=w, h=h, fps=fps
                )
            else:
                text_filter = build_simple_text_filter(
                    overlay_text, overlay_style, start_time=text_start, w=w, h=h
                )
            video_filters = f"{video_filters},{text_filter}"
        
        video_filters = f"{video_filters},format=yuv420p"
        
        if audio_path and os.path.exists(audio_path):
            # With audio - pad audio to match video duration for dramatic pause
            # Use apad to extend audio with silence, then trim to exact video duration
            audio_filter = f"apad=whole_dur={duration}"
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", image_path,
                "-i", audio_path,
                "-filter_complex", f"[0:v]{video_filters}[v];[1:a]{audio_filter}[a]",
                "-map", "[v]", "-map", "[a]",
                "-c:v", "libx264", "-preset", preset, "-crf", crf,
            ]
            if profile:
                cmd.extend(["-profile:v", "high", "-level", "4.2"])
            cmd.extend([
                "-c:a", "aac", "-b:a", "192k",
                "-t", str(duration),
                output_path
            ])
        else:
            # No audio - generate silent audio track for crossfade compatibility
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", image_path,
                "-f", "lavfi", "-i", f"anullsrc=channel_layout=stereo:sample_rate=48000:duration={duration}",
                "-filter_complex", f"[0:v]{video_filters}[v]",
                "-map", "[v]", "-map", "1:a",
                "-c:v", "libx264", "-preset", preset, "-crf", crf,
            ]
            if profile:
                cmd.extend(["-profile:v", "high", "-level", "4.2"])
            cmd.extend([
                "-c:a", "aac", "-b:a", "192k",
                "-t", str(duration),
                output_path
            ])
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            print(f"FFmpeg error: {result.stderr}", file=sys.stderr)
        return result.returncode == 0
        
    except Exception as e:
        print(f"Error creating scene clip: {e}", file=sys.stderr)
        return False


def concatenate_videos_ffmpeg(video_paths: List[str], output_path: str, use_transitions: bool = False) -> bool:
    """
    Concatenate multiple videos using FFmpeg.
    Optionally uses xfade transitions for professional documentary look.
    """
    try:
        if not video_paths:
            return False
        
        if len(video_paths) == 1:
            # Just copy if single video
            subprocess.run(["cp", video_paths[0], output_path], check=True)
            return True
        
        if use_transitions and len(video_paths) >= 2:
            return concatenate_with_crossfade(video_paths, output_path)
        
        # Simple concat for speed (no transitions)
        concat_file = TEMP_DIR / "concat_list.txt"
        with open(concat_file, "w") as f:
            for vp in video_paths:
                f.write(f"file '{os.path.abspath(vp)}'\n")
        
        cmd = [
            "ffmpeg", "-y",
            "-f", "concat", "-safe", "0",
            "-i", str(concat_file),
            "-c", "copy",
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        # Clean up concat file
        if concat_file.exists():
            concat_file.unlink()
        
        return result.returncode == 0
        
    except Exception as e:
        print(f"Error concatenating videos: {e}", file=sys.stderr)
        return False


def get_video_duration_ffprobe(video_path: str) -> float:
    """Get video duration using ffprobe."""
    try:
        cmd = [
            "ffprobe", "-v", "quiet", "-show_entries", "format=duration",
            "-of", "json", video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            data = json.loads(result.stdout)
            return float(data.get("format", {}).get("duration", 5.0))
    except:
        pass
    return 5.0


def concatenate_with_crossfade(video_paths: List[str], output_path: str, transition_duration: float = 0.75) -> bool:
    """
    Concatenate videos with professional crossfade transitions.
    Uses FFmpeg xfade filter for smooth dissolves between scenes.
    """
    try:
        if len(video_paths) < 2:
            if video_paths:
                subprocess.run(["cp", video_paths[0], output_path], check=True)
            return True
        
        # Get durations for all videos
        durations = [get_video_duration_ffprobe(vp) for vp in video_paths]
        
        # Build complex filter for xfade transitions
        # For N videos, we need N-1 xfade filters chained together
        inputs = " ".join([f"-i \"{vp}\"" for vp in video_paths])
        
        filter_parts = []
        audio_filter_parts = []
        
        # Calculate offsets for each transition
        # First video plays, then at (duration - transition_duration), we start crossfade
        cumulative_offset = 0
        
        for i in range(len(video_paths) - 1):
            offset = cumulative_offset + durations[i] - transition_duration
            
            if i == 0:
                # First transition: [0:v][1:v]
                filter_parts.append(f"[{i}:v][{i+1}:v]xfade=transition=fade:duration={transition_duration}:offset={offset}[v{i+1}]")
                audio_filter_parts.append(f"[{i}:a][{i+1}:a]acrossfade=d={transition_duration}[a{i+1}]")
            else:
                # Subsequent transitions: [prev_output][next]
                filter_parts.append(f"[v{i}][{i+1}:v]xfade=transition=fade:duration={transition_duration}:offset={offset}[v{i+1}]")
                audio_filter_parts.append(f"[a{i}][{i+1}:a]acrossfade=d={transition_duration}[a{i+1}]")
            
            cumulative_offset = offset
        
        # Final output labels
        final_video = f"v{len(video_paths)-1}"
        final_audio = f"a{len(video_paths)-1}"
        
        # Build complete filter_complex
        video_filter = ";".join(filter_parts)
        audio_filter = ";".join(audio_filter_parts)
        full_filter = f"{video_filter};{audio_filter}"
        
        # Build FFmpeg command
        cmd = ["ffmpeg", "-y"]
        for vp in video_paths:
            cmd.extend(["-i", vp])
        
        cmd.extend([
            "-filter_complex", full_filter,
            "-map", f"[{final_video}]",
            "-map", f"[{final_audio}]",
            "-c:v", "libx264", "-preset", "slow", "-crf", "18",
            "-profile:v", "high", "-level", "4.2",
            "-c:a", "aac", "-b:a", "192k",
            output_path
        ])
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            print(f"Crossfade error, falling back to simple concat: {result.stderr[:500]}", file=sys.stderr)
            # Fallback to simple concat
            return concatenate_videos_ffmpeg(video_paths, output_path, use_transitions=False)
        
        return True
        
    except Exception as e:
        print(f"Error with crossfade: {e}, falling back to simple concat", file=sys.stderr)
        return concatenate_videos_ffmpeg(video_paths, output_path, use_transitions=False)


def assemble_chapter_video_fast(
    chapter_data: Dict,
    output_path: str,
    use_transitions: bool = True,
    quality: str = "high"
) -> bool:
    """
    Professional chapter assembly using FFmpeg with VidRush-style effects.
    Features:
    - Varied Ken Burns effects with smooth easing
    - Optional crossfade transitions between scenes
    - Audio-driven timing with natural pacing
    - High-quality documentary output
    """
    try:
        ensure_dirs()
        
        scenes = chapter_data.get("scenes", [])
        if not scenes:
            print("No scenes in chapter", file=sys.stderr)
            return False
        
        scene_clips = []
        total_scenes = len(scenes)
        
        # Check for chapter title card (first scene of chapter can have title overlay)
        chapter_title = chapter_data.get("title", "")
        chapter_number = chapter_data.get("chapter_number", 0)
        
        for i, scene in enumerate(scenes):
            img_path = scene.get("image_path", "")
            audio_path = scene.get("audio_path", "")
            
            # Use varied Ken Burns effects based on scene position
            specified_effect = scene.get("ken_burns_effect", "")
            if specified_effect and specified_effect in KEN_BURNS_PRESETS:
                effect = specified_effect
            else:
                effect = get_effect_for_scene(i, total_scenes)
            
            if not img_path or not os.path.exists(img_path):
                print(f"Warning: Image not found: {img_path}", file=sys.stderr)
                continue
            
            # Get duration from audio if available
            if audio_path and os.path.exists(audio_path):
                audio_duration = get_audio_duration(audio_path)
                # Add slight padding at end for natural pacing (0.3-0.5s)
                duration = audio_duration + 0.4
            else:
                duration = scene.get("duration", 8.0)  # Default 8s for documentary pacing
            
            # Ensure minimum duration for Ken Burns effect to look smooth
            duration = max(duration, 5.0)
            
            # Build text overlay from scene metadata
            text_overlay = None
            
            # Check for explicit text overlay in scene data
            if scene.get("text_overlay"):
                text_overlay = scene.get("text_overlay")
            # Or use date_text/location_text fields
            elif scene.get("date_text"):
                text_overlay = {
                    "text": scene.get("date_text"),
                    "style": "date_overlay",
                    "typewriter": False,
                    "start_time": 0.5,
                }
            elif scene.get("location_text"):
                text_overlay = {
                    "text": scene.get("location_text"),
                    "style": "location_text",
                    "typewriter": True,
                    "start_time": 0.5,
                }
            # First scene of chapter can show chapter title
            elif i == 0 and chapter_title:
                text_overlay = {
                    "text": chapter_title,
                    "style": "chapter_title",
                    "typewriter": True,
                    "start_time": 0.5,
                }
            
            # Create temp clip for this scene
            scene_output = str(TEMP_DIR / f"scene_{i+1}.mp4")
            
            if create_scene_clip_ffmpeg(
                img_path, scene_output, duration,
                audio_path if audio_path and os.path.exists(audio_path) else None,
                effect,
                quality=quality,
                text_overlay=text_overlay
            ):
                scene_clips.append(scene_output)
                overlay_info = f" + '{text_overlay['text'][:20]}'" if text_overlay else ""
                print(f"Scene {i+1}/{total_scenes}: {effect} ({duration:.1f}s){overlay_info}", file=sys.stderr)
            else:
                print(f"Warning: Failed to create scene {i+1}", file=sys.stderr)
        
        if not scene_clips:
            print("No valid scene clips created", file=sys.stderr)
            return False
        
        # Concatenate with optional crossfade transitions
        # For many scenes, use transitions for professional look
        should_use_transitions = use_transitions and len(scene_clips) >= 2 and len(scene_clips) <= 20
        success = concatenate_videos_ffmpeg(scene_clips, output_path, use_transitions=should_use_transitions)
        
        # Clean up temp scene files
        for clip_path in scene_clips:
            if os.path.exists(clip_path):
                os.remove(clip_path)
        
        return success
        
    except Exception as e:
        print(f"Error assembling chapter video: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return False


def assemble_full_video_fast(
    project_data: Dict,
    output_path: str,
    use_transitions: bool = True,
    quality: str = "high"
) -> bool:
    """
    Professional full video assembly using FFmpeg with VidRush-style quality.
    Features:
    - Automatic year/title card generation
    - Chapter-level crossfade transitions
    - High-quality encoding
    - Optional intro/outro integration
    """
    try:
        ensure_dirs()
        
        chapters = project_data.get("chapters", [])
        if not chapters:
            print("No chapters in project", file=sys.stderr)
            return False
        
        chapter_videos = []
        total_chapters = len(chapters)
        
        # Create year/title intro card if specified
        year_title = project_data.get("year_title")  # e.g. "1945"
        project_title = project_data.get("title", "")
        first_image = None
        
        # Find first available image for title card background
        for chapter in chapters:
            for scene in chapter.get("scenes", []):
                if scene.get("image_path") and os.path.exists(scene.get("image_path", "")):
                    first_image = scene.get("image_path")
                    break
            if first_image:
                break
        
        # Generate year title card
        if year_title and first_image:
            year_card_path = str(TEMP_DIR / "year_title_card.mp4")
            print(f"Creating year title card: {year_title}", file=sys.stderr)
            if create_title_card(
                text=year_title,
                output_path=year_card_path,
                style="year_title",
                duration=3.5,
                background_image=first_image,
                typewriter=False
            ):
                chapter_videos.append(year_card_path)
        
        for i, chapter in enumerate(chapters):
            chapter_output = str(TEMP_DIR / f"chapter_{i+1}.mp4")
            print(f"Processing chapter {i+1}/{total_chapters}...", file=sys.stderr)
            
            if assemble_chapter_video_fast(chapter, chapter_output, use_transitions=use_transitions, quality=quality):
                chapter_videos.append(chapter_output)
                print(f"Chapter {i+1} complete", file=sys.stderr)
            else:
                print(f"Warning: Failed to create chapter {i+1}", file=sys.stderr)
        
        if not chapter_videos:
            print("No chapter videos created", file=sys.stderr)
            return False
        
        # Concatenate all chapters with longer transitions between chapters
        all_videos = []
        
        intro = project_data.get("intro_video")
        if intro and os.path.exists(intro):
            all_videos.append(intro)
        
        all_videos.extend(chapter_videos)
        
        outro = project_data.get("outro_video")
        if outro and os.path.exists(outro):
            all_videos.append(outro)
        
        # Use transitions between chapters for professional flow
        success = concatenate_videos_ffmpeg(all_videos, output_path, use_transitions=use_transitions)
        
        # Clean up temp chapter files
        for temp_video in chapter_videos:
            if os.path.exists(temp_video):
                os.remove(temp_video)
        
        return success
        
    except Exception as e:
        print(f"Error assembling full video: {e}", file=sys.stderr)
        return False


def get_video_info(video_path: str) -> Dict:
    """Get video metadata using FFprobe."""
    try:
        cmd = [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_format", "-show_streams",
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            return json.loads(result.stdout)
        return {}
    except Exception as e:
        print(f"Error getting video info: {e}", file=sys.stderr)
        return {}


def detect_scenes(video_path: str, threshold: float = 27.0) -> List[Dict]:
    """Detect scene changes using ffprobe."""
    try:
        cmd = [
            "ffprobe", "-v", "quiet",
            "-show_frames", "-of", "json",
            "-select_streams", "v",
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            return []
        
        # Simple scene detection based on keyframes
        data = json.loads(result.stdout)
        frames = data.get("frames", [])
        scenes = []
        scene_start = 0.0
        
        for i, frame in enumerate(frames):
            if frame.get("key_frame") == 1 and i > 0:
                pts_time = float(frame.get("pts_time", 0))
                if pts_time - scene_start > 1.0:  # Minimum scene duration
                    scenes.append({
                        "scene_number": len(scenes) + 1,
                        "start_time": scene_start,
                        "end_time": pts_time,
                        "duration": pts_time - scene_start
                    })
                    scene_start = pts_time
        
        return scenes
    except Exception as e:
        print(f"Error detecting scenes: {e}", file=sys.stderr)
        return []


def trim_video(input_path: str, output_path: str, start_time: float, end_time: float) -> bool:
    """Trim video using FFmpeg."""
    try:
        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-ss", str(start_time),
            "-to", str(end_time),
            "-c", "copy",
            output_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode == 0
    except Exception as e:
        print(f"Error trimming video: {e}", file=sys.stderr)
        return False


def images_to_video(
    image_paths: List[str],
    output_path: str,
    duration_per_image: float = 5.0,
    fps: int = 24,
    resolution: tuple = (1920, 1080),
    audio_path: Optional[str] = None,
    captions: Optional[List[Dict]] = None,
    ken_burns: bool = True
) -> bool:
    """Convert images to video using FFmpeg with Ken Burns effects."""
    try:
        ensure_dirs()
        effect_types = ["zoom_in", "zoom_out", "pan_left", "pan_right"]
        scene_clips = []
        
        for i, img_path in enumerate(image_paths):
            if not os.path.exists(img_path):
                continue
            
            effect = effect_types[i % len(effect_types)]
            scene_output = str(TEMP_DIR / f"img_scene_{i+1}.mp4")
            
            if create_scene_clip_ffmpeg(
                img_path, scene_output, duration_per_image,
                None, effect, fps, resolution
            ):
                scene_clips.append(scene_output)
        
        if not scene_clips:
            return False
        
        # Concatenate scenes
        temp_video = str(TEMP_DIR / "temp_video.mp4")
        if not concatenate_videos_ffmpeg(scene_clips, temp_video):
            return False
        
        # Add audio if provided
        if audio_path and os.path.exists(audio_path):
            cmd = [
                "ffmpeg", "-y",
                "-i", temp_video,
                "-i", audio_path,
                "-c:v", "copy",
                "-c:a", "aac", "-b:a", "192k",
                "-shortest",
                output_path
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            os.remove(temp_video)
            success = result.returncode == 0
        else:
            os.rename(temp_video, output_path)
            success = True
        
        # Clean up
        for clip in scene_clips:
            if os.path.exists(clip):
                os.remove(clip)
        
        return success
    except Exception as e:
        print(f"Error creating video from images: {e}", file=sys.stderr)
        return False


def analyze_audio(audio_path: str) -> Dict:
    """Analyze audio using FFprobe."""
    try:
        cmd = [
            "ffprobe", "-v", "quiet",
            "-print_format", "json",
            "-show_format", "-show_streams",
            audio_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            data = json.loads(result.stdout)
            duration = float(data.get("format", {}).get("duration", 0))
            return {
                "duration": duration,
                "format": data.get("format", {}),
                "streams": data.get("streams", [])
            }
        return {}
    except Exception as e:
        print(f"Error analyzing audio: {e}", file=sys.stderr)
        return {}


# Legacy function aliases for backward compatibility
def assemble_chapter_video(chapter_data: Dict, output_path: str, ken_burns: bool = True) -> bool:
    """Backward compatible wrapper - uses fast FFmpeg version."""
    return assemble_chapter_video_fast(chapter_data, output_path)


def assemble_full_video(project_data: Dict, output_path: str) -> bool:
    """Backward compatible wrapper - uses fast FFmpeg version."""
    return assemble_full_video_fast(project_data, output_path)


def merge_videos(video_paths: List[str], output_path: str, transition_duration: float = 0.5) -> bool:
    """Merge videos using FFmpeg."""
    return concatenate_videos_ffmpeg(video_paths, output_path)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python video_processor.py <command> [args...]")
        print("Commands: detect_scenes, trim, merge, images_to_video, analyze_audio, assemble_chapter, assemble_full, info, title_card, typewriter_sound")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == "detect_scenes":
        if len(sys.argv) < 3:
            print("Usage: detect_scenes <video_path> [threshold]")
            sys.exit(1)
        video_path = sys.argv[2]
        threshold = float(sys.argv[3]) if len(sys.argv) > 3 else 27.0
        scenes = detect_scenes(video_path, threshold)
        print(json.dumps(scenes, indent=2))
    
    elif command == "trim":
        if len(sys.argv) < 6:
            print("Usage: trim <input> <output> <start> <end>")
            sys.exit(1)
        success = trim_video(sys.argv[2], sys.argv[3], float(sys.argv[4]), float(sys.argv[5]))
        print(json.dumps({"success": success}))
    
    elif command == "merge":
        if len(sys.argv) < 4:
            print("Usage: merge <output> <video1> <video2> ...")
            sys.exit(1)
        success = merge_videos(sys.argv[3:], sys.argv[2])
        print(json.dumps({"success": success}))
    
    elif command == "images_to_video":
        if len(sys.argv) < 3:
            print("Usage: images_to_video <json_config>")
            sys.exit(1)
        config = json.loads(sys.argv[2])
        success = images_to_video(
            config["images"],
            config["output"],
            config.get("duration", 5.0),
            config.get("fps", 24),
            tuple(config.get("resolution", [1920, 1080])),
            config.get("audio"),
            config.get("captions")
        )
        print(json.dumps({"success": success}))
    
    elif command == "analyze_audio":
        if len(sys.argv) < 3:
            print("Usage: analyze_audio <audio_path>")
            sys.exit(1)
        result = analyze_audio(sys.argv[2])
        print(json.dumps(result, indent=2))
    
    elif command == "assemble_chapter":
        if len(sys.argv) < 3:
            print("Usage: assemble_chapter <json_config>")
            sys.exit(1)
        config = json.loads(sys.argv[2])
        chapter = config.get("chapter", config)
        output = config.get("output", "output.mp4")
        success = assemble_chapter_video_fast(chapter, output)
        print(json.dumps({"success": success}))
    
    elif command == "assemble_full":
        if len(sys.argv) < 3:
            print("Usage: assemble_full <json_config>")
            sys.exit(1)
        config = json.loads(sys.argv[2])
        project = config.get("project", config)
        output = config.get("output", "output.mp4")
        success = assemble_full_video_fast(project, output)
        print(json.dumps({"success": success}))
    
    elif command == "info":
        if len(sys.argv) < 3:
            print("Usage: info <video_path>")
            sys.exit(1)
        info = get_video_info(sys.argv[2])
        print(json.dumps(info, indent=2))
    
    elif command == "title_card":
        if len(sys.argv) < 3:
            print("Usage: title_card <json_config>")
            print("Config: {text, output, style?, duration?, background_image?, background_color?, typewriter?}")
            sys.exit(1)
        config = json.loads(sys.argv[2])
        success = create_title_card(
            text=config["text"],
            output_path=config["output"],
            style=config.get("style", "year_title"),
            duration=config.get("duration", 3.0),
            background_image=config.get("background_image"),
            background_color=config.get("background_color", "black"),
            typewriter=config.get("typewriter", False),
        )
        print(json.dumps({"success": success}))
    
    elif command == "typewriter_sound":
        if len(sys.argv) < 3:
            print("Usage: typewriter_sound <json_config>")
            print("Config: {duration, output?, chars_per_second?}")
            sys.exit(1)
        config = json.loads(sys.argv[2])
        result = generate_typewriter_sound(
            duration=config["duration"],
            chars_per_second=config.get("chars_per_second", 12.0),
            output_path=config.get("output")
        )
        print(json.dumps({"success": result is not None, "output": result}))
    
    elif command == "letterbox":
        if len(sys.argv) < 3:
            print("Usage: letterbox <json_config>")
            print("Config: {image, output, caption, duration?, audio?, effect?}")
            sys.exit(1)
        config = json.loads(sys.argv[2])
        success = create_letterbox_scene(
            image_path=config["image"],
            output_path=config["output"],
            caption=config["caption"],
            duration=config.get("duration", 6.0),
            audio_path=config.get("audio"),
            effect=config.get("effect", "zoom_in_center"),
        )
        print(json.dumps({"success": success}))
    
    elif command == "pip":
        if len(sys.argv) < 3:
            print("Usage: pip <json_config>")
            print("Config: {main_image, inset_image, output, duration?, audio?, inset_position?, inset_size?, border_color?}")
            sys.exit(1)
        config = json.loads(sys.argv[2])
        success = create_pip_scene(
            main_image=config["main_image"],
            inset_image=config["inset_image"],
            output_path=config["output"],
            duration=config.get("duration", 6.0),
            audio_path=config.get("audio"),
            inset_position=config.get("inset_position", "bottom_right"),
            inset_size=config.get("inset_size", 0.25),
            border_color=config.get("border_color", "white"),
        )
        print(json.dumps({"success": success}))
    
    elif command == "quote_box":
        if len(sys.argv) < 3:
            print("Usage: quote_box <json_config>")
            print("Config: {image, output, quote, duration?, audio?, effect?, position?, typewriter?}")
            sys.exit(1)
        config = json.loads(sys.argv[2])
        success = create_quote_box_scene(
            image_path=config["image"],
            output_path=config["output"],
            quote_text=config["quote"],
            duration=config.get("duration", 6.0),
            audio_path=config.get("audio"),
            effect=config.get("effect", "zoom_in_center"),
            box_position=config.get("position", "top_left"),
            typewriter=config.get("typewriter", True),
        )
        print(json.dumps({"success": success}))
    
    elif command == "date_stamp":
        if len(sys.argv) < 3:
            print("Usage: date_stamp <json_config>")
            print("Config: {image, output, date, duration?, audio?, effect?}")
            sys.exit(1)
        config = json.loads(sys.argv[2])
        success = create_date_stamp_scene(
            image_path=config["image"],
            output_path=config["output"],
            date_text=config["date"],
            duration=config.get("duration", 6.0),
            audio_path=config.get("audio"),
            effect=config.get("effect", "zoom_in_center"),
        )
        print(json.dumps({"success": success}))
    
    elif command == "split_screen":
        if len(sys.argv) < 3:
            print("Usage: split_screen <json_config>")
            print("Config: {left_image, right_image, output, duration?, audio?, gap_width?}")
            sys.exit(1)
        config = json.loads(sys.argv[2])
        success = create_split_screen_scene(
            left_image=config["left_image"],
            right_image=config["right_image"],
            output_path=config["output"],
            duration=config.get("duration", 6.0),
            audio_path=config.get("audio"),
            gap_width=config.get("gap_width", 4),
        )
        print(json.dumps({"success": success}))
    
    elif command == "portrait_title":
        if len(sys.argv) < 3:
            print("Usage: portrait_title <json_config>")
            print("Config: {background, portrait, output, title, subtitle?, duration?, audio?, border_color?}")
            sys.exit(1)
        config = json.loads(sys.argv[2])
        success = create_portrait_title_card(
            background_image=config["background"],
            portrait_image=config["portrait"],
            output_path=config["output"],
            title=config["title"],
            subtitle=config.get("subtitle", ""),
            duration=config.get("duration", 5.0),
            audio_path=config.get("audio"),
            border_color=config.get("border_color", "#C9A67A"),
        )
        print(json.dumps({"success": success}))
    
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
