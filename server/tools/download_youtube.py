#!/usr/bin/env python3
import sys
import json
import subprocess
import os
import re

def sanitize_filename(filename):
    """Remove special characters from filename"""
    # Remove or replace invalid characters
    filename = re.sub(r'[<>:"/\\|?*]', '', filename)
    # Replace spaces with underscores
    filename = filename.replace(' ', '_')
    # Limit length
    if len(filename) > 200:
        filename = filename[:200]
    return filename

def download_video(url, output_audio_dir, output_thumbnail_dir):
    """Download a YouTube video using yt-dlp binary"""
    try:
        # First, get video info
        info_result = subprocess.run(
            ['yt-dlp', '--dump-json', '--no-warnings', url],
            capture_output=True,
            text=True,
            timeout=30
        )

        if info_result.returncode != 0:
            return {
                'error': f'Failed to get video info: {info_result.stderr}',
                'url': url
            }

        # Parse video info
        try:
            info = json.loads(info_result.stdout.strip().split('\n')[0])
        except (json.JSONDecodeError, IndexError) as e:
            return {
                'error': f'Failed to parse video info: {str(e)}',
                'url': url
            }

        video_id = info.get('id', 'unknown')
        title = info.get('title', 'Unknown')
        uploader = info.get('uploader', info.get('channel', 'Unknown'))
        duration = info.get('duration', 0)
        thumbnail_url = info.get('thumbnail', '')

        # Sanitize title for filename
        safe_title = sanitize_filename(title)

        # Download audio
        audio_filename = f"{video_id}_{safe_title}.mp3"
        audio_path = os.path.join(output_audio_dir, audio_filename)

        download_result = subprocess.run(
            [
                'yt-dlp',
                '--extract-audio',
                '--audio-format', 'mp3',
                '--audio-quality', '0',
                '--output', audio_path.replace('.mp3', '.%(ext)s'),
                '--no-warnings',
                '--no-playlist',
                url
            ],
            capture_output=True,
            text=True,
            timeout=300  # 5 minutes timeout for download
        )

        if download_result.returncode != 0:
            return {
                'error': f'Download failed: {download_result.stderr}',
                'url': url
            }

        # Download thumbnail if available
        thumbnail_file = None
        if thumbnail_url:
            thumbnail_filename = f"{video_id}.jpg"
            thumbnail_path = os.path.join(output_thumbnail_dir, thumbnail_filename)

            try:
                thumb_result = subprocess.run(
                    ['curl', '-L', '-o', thumbnail_path, thumbnail_url],
                    capture_output=True,
                    timeout=30
                )
                if thumb_result.returncode == 0:
                    thumbnail_file = thumbnail_path
            except Exception as e:
                print(f"Warning: Failed to download thumbnail: {str(e)}", file=sys.stderr)

        return {
            'id': video_id,
            'title': title,
            'uploader': uploader,
            'duration': duration,
            'audio_file': audio_path,
            'thumbnail_file': thumbnail_file,
            'video_url': url
        }

    except subprocess.TimeoutExpired:
        return {
            'error': 'Download timeout',
            'url': url
        }
    except Exception as e:
        return {
            'error': str(e),
            'url': url
        }

if __name__ == '__main__':
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())
        urls = input_data.get('urls', [])
        output_audio_dir = input_data.get('output_audio_dir', '/app/data')
        output_thumbnail_dir = input_data.get('output_thumbnail_dir', '/app/uploads/thumbnails')

        if not urls:
            print(json.dumps([{'error': 'No URLs provided'}]))
            sys.exit(1)

        # Ensure output directories exist
        os.makedirs(output_audio_dir, exist_ok=True)
        os.makedirs(output_thumbnail_dir, exist_ok=True)

        # Download each video
        results = []
        for url in urls:
            result = download_video(url, output_audio_dir, output_thumbnail_dir)
            results.append(result)

        # Return results as JSON
        print(json.dumps(results))

    except json.JSONDecodeError as e:
        print(json.dumps([{'error': f'Invalid JSON input: {str(e)}'}]))
        sys.exit(1)
    except Exception as e:
        print(json.dumps([{'error': str(e)}]))
        sys.exit(1)