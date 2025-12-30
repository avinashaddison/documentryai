#!/usr/bin/env python3
"""
AI Video Generation - Video Processing Module
Handles video trimming, merging, scene detection, and automated assembly.
"""

import os
import sys
import json
import subprocess
from pathlib import Path
from typing import List, Dict, Optional, Tuple
import numpy as np

try:
    from moviepy import VideoFileClip, AudioFileClip, ImageClip, CompositeVideoClip, concatenate_videoclips, TextClip
    from moviepy.video.fx import CrossFadeIn, CrossFadeOut, FadeIn, FadeOut
except ImportError:
    from moviepy.editor import VideoFileClip, AudioFileClip, ImageClip, CompositeVideoClip, concatenate_videoclips, TextClip
    from moviepy.video.fx.all import crossfadein, crossfadeout, fadein, fadeout

from scenedetect import detect, ContentDetector, AdaptiveDetector
from PIL import Image

OUTPUT_DIR = Path("./generated_videos")
TEMP_DIR = Path("./temp_processing")


def ensure_dirs():
    """Create necessary directories."""
    OUTPUT_DIR.mkdir(exist_ok=True)
    TEMP_DIR.mkdir(exist_ok=True)


def detect_scenes(video_path: str, threshold: float = 27.0) -> List[Dict]:
    """
    Detect scene changes in a video using PySceneDetect.
    Returns list of scene boundaries with timestamps.
    """
    scene_list = detect(video_path, ContentDetector(threshold=threshold))
    
    scenes = []
    for i, scene in enumerate(scene_list):
        scenes.append({
            "scene_number": i + 1,
            "start_time": scene[0].get_seconds(),
            "end_time": scene[1].get_seconds(),
            "start_frame": scene[0].get_frames(),
            "end_frame": scene[1].get_frames(),
            "duration": scene[1].get_seconds() - scene[0].get_seconds()
        })
    
    return scenes


def trim_video(input_path: str, output_path: str, start_time: float, end_time: float) -> bool:
    """
    Trim a video between start and end times.
    """
    try:
        clip = VideoFileClip(input_path).subclipped(start_time, end_time)
        clip.write_videofile(output_path, codec='libx264', audio_codec='aac', logger=None)
        clip.close()
        return True
    except Exception as e:
        print(f"Error trimming video: {e}", file=sys.stderr)
        return False


def merge_videos(video_paths: List[str], output_path: str, transition_duration: float = 0.5) -> bool:
    """
    Merge multiple videos with crossfade transitions.
    """
    try:
        clips = []
        for path in video_paths:
            if os.path.exists(path):
                clips.append(VideoFileClip(path))
        
        if not clips:
            return False
        
        final_clip = concatenate_videoclips(clips, method="compose")
        final_clip.write_videofile(output_path, codec='libx264', audio_codec='aac', logger=None)
        
        for clip in clips:
            clip.close()
        final_clip.close()
        
        return True
    except Exception as e:
        print(f"Error merging videos: {e}", file=sys.stderr)
        return False


def apply_ken_burns_effect(
    img_array: np.ndarray,
    duration: float,
    fps: int = 30,
    effect_type: str = "zoom_in"
) -> ImageClip:
    """
    Apply Ken Burns effect (zoom/pan) to an image for cinematic feel.
    
    effect_type: "zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"
    """
    h, w = img_array.shape[:2]
    
    def make_frame(t):
        progress = t / duration
        
        if effect_type == "zoom_in":
            scale = 1.0 + 0.15 * progress
            new_w, new_h = int(w / scale), int(h / scale)
            x1 = (w - new_w) // 2
            y1 = (h - new_h) // 2
            crop = img_array[y1:y1+new_h, x1:x1+new_w]
            
        elif effect_type == "zoom_out":
            scale = 1.15 - 0.15 * progress
            new_w, new_h = int(w / scale), int(h / scale)
            x1 = (w - new_w) // 2
            y1 = (h - new_h) // 2
            crop = img_array[y1:y1+new_h, x1:x1+new_w]
            
        elif effect_type == "pan_left":
            offset = int(w * 0.1 * (1 - progress))
            crop = img_array[:, offset:offset + int(w * 0.9)]
            
        elif effect_type == "pan_right":
            offset = int(w * 0.1 * progress)
            crop = img_array[:, offset:offset + int(w * 0.9)]
            
        elif effect_type == "pan_up":
            offset = int(h * 0.1 * (1 - progress))
            crop = img_array[offset:offset + int(h * 0.9), :]
            
        elif effect_type == "pan_down":
            offset = int(h * 0.1 * progress)
            crop = img_array[offset:offset + int(h * 0.9), :]
        else:
            crop = img_array
        
        resized = Image.fromarray(crop).resize((w, h), Image.Resampling.LANCZOS)
        return np.array(resized)
    
    from moviepy import VideoClip
    clip = VideoClip(make_frame, duration=duration)
    clip = clip.with_fps(fps)
    return clip


def images_to_video(
    image_paths: List[str],
    output_path: str,
    duration_per_image: float = 5.0,
    fps: int = 30,
    resolution: Tuple[int, int] = (1920, 1080),
    audio_path: Optional[str] = None,
    captions: Optional[List[Dict]] = None,
    ken_burns: bool = True
) -> bool:
    """
    Convert a sequence of images to video with optional audio and captions.
    Applies Ken Burns effect (zoom/pan) for cinematic feel.
    """
    try:
        ensure_dirs()
        clips = []
        
        effect_types = ["zoom_in", "zoom_out", "pan_left", "pan_right"]
        
        for i, img_path in enumerate(image_paths):
            if not os.path.exists(img_path):
                continue
            
            img = Image.open(img_path)
            img = img.resize(resolution, Image.Resampling.LANCZOS)
            img_array = np.array(img)
            
            if ken_burns:
                effect = effect_types[i % len(effect_types)]
                clip = apply_ken_burns_effect(img_array, duration_per_image, fps, effect)
            else:
                clip = ImageClip(img_array, duration=duration_per_image)
            
            clips.append(clip)
        
        if not clips:
            return False
        
        final_clip = concatenate_videoclips(clips, method="compose")
        
        if audio_path and os.path.exists(audio_path):
            audio = AudioFileClip(audio_path)
            if audio.duration < final_clip.duration:
                from moviepy.audio.fx import AudioLoop
                audio = audio.with_effects([AudioLoop(duration=final_clip.duration)])
            else:
                audio = audio.subclipped(0, final_clip.duration)
            final_clip = final_clip.with_audio(audio)
        
        final_clip.write_videofile(
            output_path,
            fps=fps,
            codec='libx264',
            audio_codec='aac',
            logger=None
        )
        
        final_clip.close()
        return True
        
    except Exception as e:
        print(f"Error creating video from images: {e}", file=sys.stderr)
        return False


def add_captions_to_video(
    video_path: str,
    output_path: str,
    captions: List[Dict],
    font_size: int = 40,
    font_color: str = "white",
    bg_color: str = "black"
) -> bool:
    """
    Add word-level captions/subtitles to a video.
    Captions format: [{"text": "word", "start": 0.0, "end": 1.0}, ...]
    """
    try:
        video = VideoFileClip(video_path)
        
        caption_clips = []
        for cap in captions:
            txt_clip = TextClip(
                text=cap["text"],
                font_size=font_size,
                color=font_color,
                bg_color=bg_color,
                font="Arial"
            )
            txt_clip = txt_clip.with_position(("center", "bottom"))
            txt_clip = txt_clip.with_start(cap["start"])
            txt_clip = txt_clip.with_duration(cap["end"] - cap["start"])
            caption_clips.append(txt_clip)
        
        final = CompositeVideoClip([video] + caption_clips)
        final.write_videofile(output_path, codec='libx264', audio_codec='aac', logger=None)
        
        video.close()
        final.close()
        return True
        
    except Exception as e:
        print(f"Error adding captions: {e}", file=sys.stderr)
        return False


def analyze_audio_energy(audio_path: str, chunk_duration: float = 0.5) -> List[Dict]:
    """
    Analyze audio energy levels for automated cutting decisions.
    Returns energy levels per time chunk.
    """
    try:
        audio = AudioFileClip(audio_path)
        
        chunks = []
        current_time = 0
        
        while current_time < audio.duration:
            end_time = min(current_time + chunk_duration, audio.duration)
            
            chunk_audio = audio.subclipped(current_time, end_time)
            frames = list(chunk_audio.iter_frames())
            
            if frames:
                energy = np.mean(np.abs(np.array(frames)))
            else:
                energy = 0
            
            chunks.append({
                "start": current_time,
                "end": end_time,
                "energy": float(energy),
                "is_silence": energy < 0.01
            })
            
            current_time = end_time
        
        audio.close()
        return chunks
        
    except Exception as e:
        print(f"Error analyzing audio: {e}", file=sys.stderr)
        return []


def auto_cut_on_beats(
    video_path: str,
    audio_path: str,
    output_path: str,
    energy_threshold: float = 0.1
) -> bool:
    """
    Automatically cut video based on audio energy/beats.
    """
    try:
        energy_data = analyze_audio_energy(audio_path)
        
        cut_points = [0.0]
        for chunk in energy_data:
            if chunk["energy"] > energy_threshold and not chunk["is_silence"]:
                if cut_points[-1] + 2.0 < chunk["start"]:
                    cut_points.append(chunk["start"])
        
        video = VideoFileClip(video_path)
        cut_points.append(video.duration)
        
        clips = []
        for i in range(len(cut_points) - 1):
            clip = video.subclipped(cut_points[i], cut_points[i + 1])
            clips.append(clip)
        
        final = concatenate_videoclips(clips)
        final.write_videofile(output_path, codec='libx264', audio_codec='aac', logger=None)
        
        video.close()
        final.close()
        return True
        
    except Exception as e:
        print(f"Error auto-cutting video: {e}", file=sys.stderr)
        return False


def assemble_chapter_video(
    chapter_data: Dict,
    output_path: str,
    ken_burns: bool = True
) -> bool:
    """
    Assemble a complete chapter video from scenes with Ken Burns effects.
    
    chapter_data format:
    {
        "chapter_number": 1,
        "scenes": [
            {"image_path": "...", "duration": 5.0, "prompt": "..."},
            ...
        ],
        "audio_path": "...",
        "captions": [...]
    }
    """
    try:
        ensure_dirs()
        
        image_paths = [s["image_path"] for s in chapter_data.get("scenes", [])]
        durations = [s.get("duration", 5.0) for s in chapter_data.get("scenes", [])]
        audio_path = chapter_data.get("audio_path")
        captions = chapter_data.get("captions", [])
        
        effect_types = ["zoom_in", "zoom_out", "pan_left", "pan_right", "pan_up", "pan_down"]
        clips = []
        
        for i, (img_path, duration) in enumerate(zip(image_paths, durations)):
            if not os.path.exists(img_path):
                continue
            
            img = Image.open(img_path)
            img = img.resize((1920, 1080), Image.Resampling.LANCZOS)
            img_array = np.array(img)
            
            if ken_burns:
                effect = effect_types[i % len(effect_types)]
                clip = apply_ken_burns_effect(img_array, duration, 30, effect)
            else:
                clip = ImageClip(img_array, duration=duration)
            
            clips.append(clip)
        
        if not clips:
            return False
        
        video = concatenate_videoclips(clips, method="compose")
        
        if audio_path and os.path.exists(audio_path):
            audio = AudioFileClip(audio_path)
            if audio.duration != video.duration:
                audio = audio.subclipped(0, min(audio.duration, video.duration))
            video = video.with_audio(audio)
        
        video.write_videofile(
            output_path,
            fps=30,
            codec='libx264',
            audio_codec='aac',
            logger=None
        )
        
        video.close()
        return True
        
    except Exception as e:
        print(f"Error assembling chapter video: {e}", file=sys.stderr)
        return False


def assemble_full_video(
    project_data: Dict,
    output_path: str
) -> bool:
    """
    Assemble the complete video from all chapters.
    
    project_data format:
    {
        "title": "...",
        "chapters": [chapter_data, ...],
        "intro_video": "...",
        "outro_video": "...",
        "background_music": "..."
    }
    """
    try:
        ensure_dirs()
        
        chapter_videos = []
        for i, chapter in enumerate(project_data.get("chapters", [])):
            chapter_output = str(TEMP_DIR / f"chapter_{i+1}.mp4")
            if assemble_chapter_video(chapter, chapter_output):
                chapter_videos.append(chapter_output)
        
        if not chapter_videos:
            return False
        
        all_videos = []
        
        intro = project_data.get("intro_video")
        if intro and os.path.exists(intro):
            all_videos.append(intro)
        
        all_videos.extend(chapter_videos)
        
        outro = project_data.get("outro_video")
        if outro and os.path.exists(outro):
            all_videos.append(outro)
        
        result = merge_videos(all_videos, output_path)
        
        for temp_video in chapter_videos:
            if os.path.exists(temp_video):
                os.remove(temp_video)
        
        return result
        
    except Exception as e:
        print(f"Error assembling full video: {e}", file=sys.stderr)
        return False


def get_video_info(video_path: str) -> Dict:
    """
    Get video metadata using FFprobe.
    """
    try:
        cmd = [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            video_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            return json.loads(result.stdout)
        return {}
        
    except Exception as e:
        print(f"Error getting video info: {e}", file=sys.stderr)
        return {}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python video_processor.py <command> [args...]")
        print("Commands: detect_scenes, trim, merge, images_to_video, add_captions, analyze_audio, auto_cut, assemble_chapter, assemble_full, info")
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
            config.get("fps", 30),
            tuple(config.get("resolution", [1920, 1080])),
            config.get("audio"),
            config.get("captions")
        )
        print(json.dumps({"success": success}))
    
    elif command == "info":
        if len(sys.argv) < 3:
            print("Usage: info <video_path>")
            sys.exit(1)
        info = get_video_info(sys.argv[2])
        print(json.dumps(info, indent=2))
    
    elif command == "analyze_audio":
        if len(sys.argv) < 3:
            print("Usage: analyze_audio <audio_path>")
            sys.exit(1)
        energy = analyze_audio_energy(sys.argv[2])
        print(json.dumps(energy, indent=2))
    
    elif command == "assemble_chapter":
        if len(sys.argv) < 3:
            print("Usage: assemble_chapter <json_config>")
            sys.exit(1)
        config = json.loads(sys.argv[2])
        success = assemble_chapter_video(config["chapter"], config["output"])
        print(json.dumps({"success": success}))
    
    elif command == "assemble_full":
        if len(sys.argv) < 3:
            print("Usage: assemble_full <json_config>")
            sys.exit(1)
        config = json.loads(sys.argv[2])
        success = assemble_full_video(config["project"], config["output"])
        print(json.dumps({"success": success}))
    
    else:
        print(f"Unknown command: {command}")
        sys.exit(1)
