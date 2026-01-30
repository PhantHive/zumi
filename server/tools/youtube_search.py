#!/usr/bin/env python3
import sys
import json
import subprocess

def parse_duration(duration_str):
    """Parse duration string to seconds"""
    if not duration_str or duration_str == "N/A":
        return 0

    try:
        parts = str(duration_str).split(':')
        if len(parts) == 2:  # MM:SS
            return int(parts[0]) * 60 + int(parts[1])
        elif len(parts) == 3:  # HH:MM:SS
            return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    except (ValueError, IndexError):
        pass
    return 0

def search_youtube(query, limit=10):
    """Search YouTube using yt-dlp binary and return results"""
    try:
        # Use yt-dlp binary to search
        search_query = f"ytsearch{limit}:{query}"

        # Run yt-dlp command
        result = subprocess.run(
            ['yt-dlp', '--dump-json', '--flat-playlist', '--no-warnings', search_query],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode != 0:
            return {
                'error': f'yt-dlp error: {result.stderr}',
                'results': [],
                'count': 0,
                'query': query
            }

        # Parse JSON output (one JSON object per line)
        results = []
        for line in result.stdout.strip().split('\n'):
            if not line:
                continue
            try:
                entry = json.loads(line)
                results.append({
                    'id': entry.get('id', ''),
                    'title': entry.get('title', 'Unknown'),
                    'uploader': entry.get('uploader', entry.get('channel', 'Unknown')),
                    'thumbnail': entry.get('thumbnail', ''),
                    'durationSeconds': parse_duration(entry.get('duration', 0)),
                    'url': f"https://www.youtube.com/watch?v={entry.get('id', '')}"
                })
            except json.JSONDecodeError:
                continue

        return {
            'results': results,
            'count': len(results),
            'query': query
        }
    except subprocess.TimeoutExpired:
        return {
            'error': 'Search timeout',
            'results': [],
            'count': 0,
            'query': query
        }
    except Exception as e:
        return {
            'error': str(e),
            'results': [],
            'count': 0,
            'query': query
        }

if __name__ == '__main__':
    try:
        # Read input from stdin
        input_data = json.loads(sys.stdin.read())
        query = input_data.get('query', '')
        limit = input_data.get('limit', 10)

        if not query:
            print(json.dumps({'error': 'Query is required', 'results': [], 'count': 0}))
            sys.exit(1)

        # Search and return results
        result = search_youtube(query, limit)
        print(json.dumps(result))

    except json.JSONDecodeError as e:
        print(json.dumps({'error': f'Invalid JSON input: {str(e)}', 'results': [], 'count': 0}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({'error': str(e), 'results': [], 'count': 0}))
        sys.exit(1)