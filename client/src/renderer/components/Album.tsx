import React from 'react';
import { Album as AlbumType, Song } from '../../../../shared/types/common';
import '../styles/album.css';

interface AlbumProps {
  album: AlbumType;
  onSongSelect: (song: Song) => void;
  currentSong: Song | null;
}

const Album: React.FC<AlbumProps> = ({ album, onSongSelect, currentSong }) => {
  const getImageUrl = (song: Song) => {
  console.log('Song thumbnail:', song.thumbnailUrl); // Debug log
  if (!song.thumbnailUrl) return 'http://localhost:3000/images/placeholder.jpg';
  return `http://localhost:3000${song.thumbnailUrl}`;
};

  return (
    <div className="album-container">
      <div className="album-header">
        <img
          src={album.songs[0] ? getImageUrl(album.songs[0]) : 'http://localhost:3000/images/placeholder.jpg'}
          alt={album.name}
          className="album-cover"
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            img.src = 'http://localhost:3000/images/placeholder.jpg';
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
              src={getImageUrl(song)}
              alt={song.title}
              className="song-thumbnail"
              onError={(e) => {
                const img = e.target as HTMLImageElement;
                img.src = '/placeholder.jpg';
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