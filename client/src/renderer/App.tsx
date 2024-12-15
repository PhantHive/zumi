// client/src/renderer/App.tsx
import React, { useState, useEffect } from 'react';
import { Song, Album } from '../../../shared/types/common';
import Player from './components/Player';
import Sidebar from './components/Sidebar';
import AlbumView from './components/Album';
import './styles/global.css';
import { apiClient } from './utils/apiClient';
import ZumiChan from './components/ZumiChan';

interface SongsResponse {
    data: Song[];
}

const App: React.FC = () => {
    const [currentSong, setCurrentSong] = useState<Song | null>(null);
    const [albums, setAlbums] = useState<Album[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [showZumiChan] = useState(true);
    const [isZumiChanOpen, setIsZumiChanOpen] = useState(false);

    useEffect(() => {
        fetchSongs();
    }, []);

    const handleZumiWave = () => {
        setIsZumiChanOpen(!isZumiChanOpen);
    };

    const fetchSongs = async () => {
        try {
            const response = await apiClient.get<SongsResponse>('/api/songs');
            const songs = response.data || [];

            // Group songs by albumId
            const albumMap: { [key: string]: Album } = {};
            songs.forEach((song) => {
                if (!albumMap[song.albumId]) {
                    albumMap[song.albumId] = {
                        id: song.albumId,
                        name: song.albumId, // Assuming album name is the same as albumId
                        songs: [],
                    };
                }
                albumMap[song.albumId].songs.push(song);
            });

            setAlbums(Object.values(albumMap));
            setError(null);
        } catch (error) {
            console.error('Failed to fetch songs:', error);
            setError('Failed to load songs. Please try again.');
        }
    };

    const handleSongSelect = (song: Song) => {
        setCurrentSong(song);
    };

    const handleRandomSong = () => {
        if (albums.length > 0) {
            const randomAlbum =
                albums[Math.floor(Math.random() * albums.length)];
            if (randomAlbum.songs.length > 0) {
                const randomSong =
                    randomAlbum.songs[
                        Math.floor(Math.random() * randomAlbum.songs.length)
                    ];
                setCurrentSong(randomSong);
            }
        }
    };

    return (
        <>
            <div className="app-container">
                <Sidebar onSongUpload={fetchSongs} />
                <div className="main-content">
                    {showZumiChan && (
                        <ZumiChan
                            onContinue={handleZumiWave}
                            albums={albums}
                            setCurrentSong={setCurrentSong}
                        />
                    )}
                    {error && <div className="error-message">{error}</div>}
                    {albums.map((album) => (
                        <AlbumView
                            key={album.id}
                            album={album}
                            currentSong={currentSong}
                            onSongSelect={handleSongSelect}
                        />
                    ))}
                </div>
                <Player
                    currentSong={currentSong}
                    onNext={() => {
                        const currentAlbum = albums.find((album) =>
                            album.songs.some((s) => s.id === currentSong?.id),
                        );
                        if (currentAlbum) {
                            const currentIndex = currentAlbum.songs.findIndex(
                                (s) => s.id === currentSong?.id,
                            );
                            const nextSong =
                                currentAlbum.songs[
                                    (currentIndex + 1) %
                                        currentAlbum.songs.length
                                ];
                            setCurrentSong(nextSong);
                        }
                    }}
                    onPrevious={() => {
                        const currentAlbum = albums.find((album) =>
                            album.songs.some((s) => s.id === currentSong?.id),
                        );
                        if (currentAlbum) {
                            const currentIndex = currentAlbum.songs.findIndex(
                                (s) => s.id === currentSong?.id,
                            );
                            const prevSong =
                                currentAlbum.songs[
                                    (currentIndex -
                                        1 +
                                        currentAlbum.songs.length) %
                                        currentAlbum.songs.length
                                ];
                            setCurrentSong(prevSong);
                        }
                    }}
                    onRandomSong={handleRandomSong} // Add this prop
                />
            </div>
        </>
    );
};

export default App;
