#!/usr/bin/env python3
import sys
import json
import os
import yt_dlp

# Read JSON input from stdin
# Expected: { "urls": ["..."], "output_audio_dir": "...", "output_thumbnail_dir": "..." }

def safe_mkdir(p):
    try:
        os.makedirs(p, exist_ok=True)
    except Exception as e:
        print(f"__ERROR_MKDIR__:{e}", file=sys.stderr)


def find_thumbnail(output_dir, video_id):
    for ext in ['jpg', 'jpeg', 'webp', 'png']:
        candidate = os.path.join(output_dir, f"{video_id}.{ext}")
        if os.path.exists(candidate):
            return candidate
    return None


def main():
    try:
        raw = sys.stdin.read()
        if not raw:
            print(json.dumps({"error": "no input"}))
            return
        payload = json.loads(raw)
        urls = payload.get('urls') or []
        output_audio_dir = payload.get('output_audio_dir') or '.'
        output_thumbnail_dir = payload.get('output_thumbnail_dir') or output_audio_dir

        safe_mkdir(output_audio_dir)
        safe_mkdir(output_thumbnail_dir)

        results = []

        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': os.path.join(output_audio_dir, '%(id)s.%(ext)s'),
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'writethumbnail': True,
            'noplaylist': True,
            'quiet': True,
            'no_warnings': True,
        }

        for url in urls:
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=True)

                    video_id = info.get('id')
                    title = info.get('title')
                    uploader = info.get('uploader') or info.get('uploader_id')
                    duration = info.get('duration')
                    webpage_url = info.get('webpage_url') or url

                    # After download, audio will be at {id}.mp3
                    audio_file = os.path.join(output_audio_dir, f"{video_id}.mp3")

                    # Thumbnail may have been written in output_audio_dir with id.ext, or ytdlp may have saved to same dir
                    thumbnail = find_thumbnail(output_audio_dir, video_id)
                    if not thumbnail and output_thumbnail_dir != output_audio_dir:
                        thumbnail = find_thumbnail(output_thumbnail_dir, video_id)

                    # If thumbnail exists but is not in the dedicated thumbnails dir, try to copy it
                    final_thumbnail = None
                    if thumbnail:
                        try:
                            base_ext = os.path.splitext(thumbnail)[1]
                            final_thumbnail = os.path.join(output_thumbnail_dir, f"{video_id}{base_ext}")
                            if os.path.abspath(thumbnail) != os.path.abspath(final_thumbnail):
                                import shutil
                                shutil.copyfile(thumbnail, final_thumbnail)
                        except Exception as e:
                            final_thumbnail = thumbnail

                    results.append({
                        'id': video_id,
                        'title': title,
                        'uploader': uploader,
                        'duration': duration,
                        'audio_file': audio_file,
                        'thumbnail_file': final_thumbnail,
                        'video_url': webpage_url,
                    })
            except Exception as e:
                results.append({'error': str(e), 'url': url})

        sys.stdout.write(json.dumps(results))
    except Exception as e:
        sys.stdout.write(json.dumps({'error': str(e)}))


if __name__ == '__main__':
    main()
