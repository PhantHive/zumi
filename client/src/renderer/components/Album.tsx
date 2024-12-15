import React, { useEffect, useState } from 'react';
import { Album as AlbumType, Song } from '../../../../shared/types/common';
import '../styles/album.css';
import { apiClient } from '../utils/apiClient';
import {getAssetPath} from "../utils/assetPath";

interface AlbumProps {
  album: AlbumType;
  onSongSelect: (song: Song) => void;
  currentSong: Song | null;
}

const Album: React.FC<AlbumProps> = ({ album, onSongSelect, currentSong }) => {
  const [thumbnailUrls, setThumbnailUrls] = useState<Record<string, string>>({});

  useEffect(() => {
  const cleanupFunctions: (() => void)[] = [];

  const loadThumbnails = async () => {
    const urls: Record<string, string> = {};
    for (const song of album.songs) {
      if (song.thumbnailUrl) {
        try {
          const { url, cleanup } = await apiClient.getStream(`/api/songs/thumbnails/${song.thumbnailUrl}`);
          urls[song.id] = url;
          cleanupFunctions.push(cleanup);
        } catch (error) {
          console.error(`Failed to load thumbnail for song ${song.id}:`, error);
          urls[song.id] = getAssetPath('images/placeholder.jpg');
        }
      } else {
        urls[song.id] = getAssetPath('images/placeholder.jpg');
      }
    }
    setThumbnailUrls(urls);
  };

  loadThumbnails();

  // Cleanup function
  return () => {
    cleanupFunctions.forEach(cleanup => cleanup());
  };
}, [album.songs]);

  return (
    <div className="album-container">
      <div className="album-header">
        <img
          src={album.songs[0] ? thumbnailUrls[album.songs[0].id] : getAssetPath('images/placeholder.jpg')}
          alt={album.name}
          className="album-cover"
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            img.src = getAssetPath('images/placeholder.jpg');
          }}
        />
        <div className="album-info">
          <h2>{album.name}</h2>
          <p>{album.songs.length} songs</p>
        </div>
      </div>

      <div className="songs-grid">
        {album.songs.map((song) => (
          <div
            key={song.id}
            className={`song-card ${currentSong?.id === song.id ? 'active' : ''}`}
            onClick={() => onSongSelect(song)}
          >
            <img
              src={thumbnailUrls[song.id] || getAssetPath('images/placeholder.jpg')}
              alt={song.title}
              className="song-thumbnail"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.src = getAssetPath('images/placeholder.jpg');
              }}
            />
            <div className="song-title">{song.title}</div>
            <div className="song-artist">{song.artist}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Album;