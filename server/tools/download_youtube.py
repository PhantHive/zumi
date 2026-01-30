#!/usr/bin/env python3
"""
YouTube Search Script using yt-dlp
Reads JSON from stdin: { "query": "search query", "limit": 10 }
Outputs JSON with search results
"""

import sys
import json
import yt_dlp


def search_youtube(query, limit=10):
    """Search YouTube and return video information"""
    results = []

    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,  # Don't download, just get metadata
            'skip_download': True,
            'playlistend': limit,  # Limit results
        }

        # Use ytsearch: prefix to search YouTube
        search_query = f"ytsearch{limit}:{query}"

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(search_query, download=False)

            if not info or 'entries' not in info:
                return []

            for entry in info['entries']:
                if not entry:
                    continue

                video_id = entry.get('id')
                if not video_id:
                    continue

                # Extract thumbnail - get best quality available
                thumbnail = None
                thumbnails = entry.get('thumbnails', [])
                if thumbnails:
                    # Try to get medium or high quality thumbnail
                    for thumb in reversed(thumbnails):
                        if thumb.get('url'):
                            thumbnail = thumb['url']
                            break

                # Parse duration
                duration = entry.get('duration')
                if duration is None:
                    # Try to get from duration_string
                    duration_string = entry.get('duration_string', '')
                    if duration_string:
                        try:
                            # Parse duration like "3:45" or "1:23:45"
                            parts = duration_string.split(':')
                            if len(parts) == 2:  # MM:SS
                                duration = int(parts[0]) * 60 + int(parts[1])
                            elif len(parts) == 3:  # HH:MM:SS
                                duration = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                        except:
                            duration = None

                result = {
                    'id': video_id,
                    'title': entry.get('title', ''),
                    'uploader': entry.get('uploader') or entry.get('channel', ''),
                    'thumbnail': thumbnail or f"https://img.youtube.com/vi/{video_id}/mqdefault.jpg",
                    'durationSeconds': duration,
                    'url': f"https://www.youtube.com/watch?v={video_id}",
                    'channelTitle': entry.get('channel') or entry.get('uploader', ''),
                }

                results.append(result)

        return results

    except Exception as e:
        # Return error in a structured way
        print(json.dumps({'error': str(e)}), file=sys.stderr)
        return []


def main():
    try:
        # Read JSON input from stdin
        raw = sys.stdin.read()

        if not raw or not raw.strip():
            output = {'error': 'No input provided'}
            print(json.dumps(output))
            sys.exit(1)

        payload = json.loads(raw)
        query = payload.get('query', '').strip()
        limit = int(payload.get('limit', 10))

        if not query:
            output = {'error': 'Query is required'}
            print(json.dumps(output))
            sys.exit(1)

        # Perform search
        results = search_youtube(query, limit)

        # Output results as JSON
        output = {
            'results': results,
            'count': len(results),
            'query': query
        }

        print(json.dumps(output))
        sys.exit(0)

    except json.JSONDecodeError as e:
        output = {'error': f'Invalid JSON input: {str(e)}'}
        print(json.dumps(output))
        sys.exit(1)

    except Exception as e:
        output = {'error': str(e)}
        print(json.dumps(output))
        sys.exit(1)


if __name__ == '__main__':
    main()