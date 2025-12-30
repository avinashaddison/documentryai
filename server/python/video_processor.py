#!/usr/bin/env python3
"""
AI Video Generation - Fast Video Processing Module
Uses FFmpeg native filters for 10-20x faster rendering.
"""

import os
import sys
import json
import subprocess
import tempfile
from pathlib import Path
from typing import List, Dict, Optional

OUTPUT_DIR = Path("./generated_videos")
TEMP_DIR = Path("./temp_processing")


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


def create_scene_clip_ffmpeg(
    image_path: str,
    output_path: str,
    duration: float,
    audio_path: Optional[str] = None,
    effect: str = "zoom_in",
    fps: int = 24,
    resolution: tuple = (1920, 1080)
) -> bool:
    """
    Create a single scene clip with Ken Burns effect using FFmpeg zoompan filter.
    This is 10-20x faster than MoviePy frame-by-frame rendering.
    """
    try:
        w, h = resolution
        total_frames = int(duration * fps)
        
        # Ken Burns effect parameters for zoompan filter
        # zoompan: z=zoom, x=pan_x, y=pan_y, d=duration_frames, s=output_size, fps=fps
        if effect == "zoom_in":
            # Start at 1.0x, end at 1.15x zoom, centered
            zoompan = f"zoompan=z='1+0.15*on/{total_frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={total_frames}:s={w}x{h}:fps={fps}"
        elif effect == "zoom_out":
            # Start at 1.15x, end at 1.0x zoom, centered
            zoompan = f"zoompan=z='1.15-0.15*on/{total_frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={total_frames}:s={w}x{h}:fps={fps}"
        elif effect == "pan_left":
            # Pan from right to left
            zoompan = f"zoompan=z='1.1':x='iw*0.1*(1-on/{total_frames})':y='ih/2-(ih/zoom/2)':d={total_frames}:s={w}x{h}:fps={fps}"
        elif effect == "pan_right":
            # Pan from left to right
            zoompan = f"zoompan=z='1.1':x='iw*0.1*on/{total_frames}':y='ih/2-(ih/zoom/2)':d={total_frames}:s={w}x{h}:fps={fps}"
        elif effect == "pan_up":
            # Pan from bottom to top
            zoompan = f"zoompan=z='1.1':x='iw/2-(iw/zoom/2)':y='ih*0.1*(1-on/{total_frames})':d={total_frames}:s={w}x{h}:fps={fps}"
        elif effect == "pan_down":
            # Pan from top to bottom
            zoompan = f"zoompan=z='1.1':x='iw/2-(iw/zoom/2)':y='ih*0.1*on/{total_frames}':d={total_frames}:s={w}x{h}:fps={fps}"
        else:
            # Default: gentle zoom in
            zoompan = f"zoompan=z='1+0.1*on/{total_frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={total_frames}:s={w}x{h}:fps={fps}"
        
        # Build FFmpeg command
        if audio_path and os.path.exists(audio_path):
            # With audio
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", image_path,
                "-i", audio_path,
                "-filter_complex", f"[0:v]{zoompan},format=yuv420p[v]",
                "-map", "[v]", "-map", "1:a",
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-c:a", "aac", "-b:a", "192k",
                "-t", str(duration),
                "-shortest",
                output_path
            ]
        else:
            # No audio
            cmd = [
                "ffmpeg", "-y",
                "-loop", "1", "-i", image_path,
                "-vf", f"{zoompan},format=yuv420p",
                "-c:v", "libx264", "-preset", "fast", "-crf", "23",
                "-t", str(duration),
                output_path
            ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        return result.returncode == 0
        
    except Exception as e:
        print(f"Error creating scene clip: {e}", file=sys.stderr)
        return False


def concatenate_videos_ffmpeg(video_paths: List[str], output_path: str) -> bool:
    """
    Concatenate multiple videos using FFmpeg concat demuxer.
    Much faster than MoviePy concatenation.
    """
    try:
        if not video_paths:
            return False
        
        if len(video_paths) == 1:
            # Just copy if single video
            subprocess.run(["cp", video_paths[0], output_path], check=True)
            return True
        
        # Create concat file
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


def assemble_chapter_video_fast(
    chapter_data: Dict,
    output_path: str
) -> bool:
    """
    Fast chapter assembly using FFmpeg native filters.
    10-20x faster than MoviePy version.
    """
    try:
        ensure_dirs()
        
        scenes = chapter_data.get("scenes", [])
        if not scenes:
            print("No scenes in chapter", file=sys.stderr)
            return False
        
        effect_types = ["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"]
        scene_clips = []
        
        for i, scene in enumerate(scenes):
            img_path = scene.get("image_path", "")
            audio_path = scene.get("audio_path", "")
            effect = scene.get("ken_burns_effect", effect_types[i % len(effect_types)])
            
            if not img_path or not os.path.exists(img_path):
                print(f"Warning: Image not found: {img_path}", file=sys.stderr)
                continue
            
            # Get duration from audio if available, otherwise use default
            if audio_path and os.path.exists(audio_path):
                duration = get_audio_duration(audio_path)
            else:
                duration = scene.get("duration", 5.0)
            
            # Create temp clip for this scene
            scene_output = str(TEMP_DIR / f"scene_{i+1}.mp4")
            
            if create_scene_clip_ffmpeg(
                img_path, scene_output, duration,
                audio_path if os.path.exists(audio_path) else None,
                effect
            ):
                scene_clips.append(scene_output)
                print(f"Scene {i+1} rendered in ~{duration:.1f}s", file=sys.stderr)
            else:
                print(f"Warning: Failed to create scene {i+1}", file=sys.stderr)
        
        if not scene_clips:
            print("No valid scene clips created", file=sys.stderr)
            return False
        
        # Concatenate all scene clips
        success = concatenate_videos_ffmpeg(scene_clips, output_path)
        
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
    output_path: str
) -> bool:
    """
    Fast full video assembly using FFmpeg.
    """
    try:
        ensure_dirs()
        
        chapters = project_data.get("chapters", [])
        if not chapters:
            print("No chapters in project", file=sys.stderr)
            return False
        
        chapter_videos = []
        
        for i, chapter in enumerate(chapters):
            chapter_output = str(TEMP_DIR / f"chapter_{i+1}.mp4")
            print(f"Processing chapter {i+1}...", file=sys.stderr)
            
            if assemble_chapter_video_fast(chapter, chapter_output):
                chapter_videos.append(chapter_output)
                print(f"Chapter {i+1} complete", file=sys.stderr)
            else:
                print(f"Warning: Failed to create chapter {i+1}", file=sys.stderr)
        
        if not chapter_videos:
            print("No chapter videos created", file=sys.stderr)
            return False
        
        # Concatenate all chapters
        all_videos = []
        
        intro = project_data.get("intro_video")
        if intro and os.path.exists(intro):
            all_videos.append(intro)
        
        all_videos.extend(chapter_videos)
        
        outro = project_data.get("outro_video")
        if outro and os.path.exists(outro):
            all_videos.append(outro)
        
        success = concatenate_videos_ffmpeg(all_videos, output_path)
        
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
