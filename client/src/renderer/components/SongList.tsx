import React from 'react';
import { Song } from '../../../../shared/types/common';

interface SongListProps {
    songs: Song[];
    onSongSelect: (song: Song) => void;
    currentSong: Song | null;
}

const SongList: React.FC<SongListProps> = ({
    songs,
    onSongSelect,
    currentSong,
}) => {
    return (
        <ul className="song-list">
            {songs.map((song) => (
                <li
                    key={song.id}
                    className={`song-item ${currentSong?.id === song.id ? 'active' : ''}`}
                    onClick={() => onSongSelect(song)}
                >
                    <div className="song-info">
                        <span className="song-title">{song.title}</span>
                        <span className="song-artist">{song.artist}</span>
                    </div>
                </li>
            ))}
        </ul>
    );
};

export default SongList;
