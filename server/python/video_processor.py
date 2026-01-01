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
    quality: str = "high"
) -> bool:
    """
    Create a single scene clip with professional Ken Burns effect.
    Uses preset-based motion with smooth easing for VidRush-style quality.
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
        
        video_filters = f"{zoompan},{bw_filter},{contrast_filter},format=yuv420p"
        
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
            
            # Create temp clip for this scene
            scene_output = str(TEMP_DIR / f"scene_{i+1}.mp4")
            
            if create_scene_clip_ffmpeg(
                img_path, scene_output, duration,
                audio_path if audio_path and os.path.exists(audio_path) else None,
                effect,
                quality=quality
            ):
                scene_clips.append(scene_output)
                print(f"Scene {i+1}/{total_scenes}: {effect} ({duration:.1f}s)", file=sys.stderr)
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
        print("Commands: detect_scenes, trim, merge, images_to_video, analyze_audio, assemble_chapter, assemble_full, info")
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
    
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
