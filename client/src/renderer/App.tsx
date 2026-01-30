// client/src/renderer/App.tsx
import React, { useState, useEffect } from 'react';
import { Song, Album } from '../../../shared/types/common';
import Player from './components/Player';
import Sidebar from './components/Sidebar';
import AlbumView from './components/Album';
import PinLock from './components/PinLock';
import './styles/global.css';
import { apiClient } from './utils/apiClient';
import ZumiChan from './components/ZumiChan';
import { ipcRenderer } from 'electron';

interface SongsResponse {
    data: Song[];
}

const App: React.FC = () => {
    const [currentSong, setCurrentSong] = useState<Song | null>(null);
    const [albums, setAlbums] = useState<Album[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [showZumiChan] = useState(true);
    const [isZumiChanOpen, setIsZumiChanOpen] = useState(false);

    // PIN lock states
    const [hasPin, setHasPin] = useState<boolean>(false);
    const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
    const [isCheckingPin, setIsCheckingPin] = useState<boolean>(true);

    useEffect(() => {
        // Wait for main-ready with a timeout before running checks
        const waitForMainReady = async () => {
            try {
                await new Promise<void>((resolve) => {
                    const timeout = setTimeout(() => resolve(), 2000);
                    try {
                        ipcRenderer.once('main-ready', (_event, data) => {
                            clearTimeout(timeout);
                            if (data && data.apiPort) (window as any).__API_PORT__ = data.apiPort;
                            resolve();
                        });
                    } catch (err) {
                        clearTimeout(timeout);
                        resolve();
                    }
                });
            } catch (err) {
                // ignore
            }

            // Check if PIN is set
            const checkPin = async () => {
                try {
                    const hasPinSet = await ipcRenderer.invoke('pin:has-pin');
                    setHasPin(hasPinSet);
                    setIsUnlocked(!hasPinSet); // If no PIN, unlock automatically
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    if (
                        msg.includes('No handler registered') ||
                        msg.includes('ipcRenderer is not defined') ||
                        msg.includes('not implemented') ||
                        msg.includes('invoke')
                    ) {
                        console.warn('IPC not available; keeping UI locked for safety');
                        setHasPin(false);
                        setIsUnlocked(false);
                    } else {
                        console.error('Error checking PIN:', error);
                        setIsUnlocked(false);
                    }
                } finally {
                    setIsCheckingPin(false);
                }
            };

            checkPin();
        };

        waitForMainReady();
    }, []);

    useEffect(() => {
        if (isUnlocked) {
            fetchSongs();
        }
    }, [isUnlocked]);

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
                        name: song.albumId,
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

    const handleUnlock = () => {
        setIsUnlocked(true);
    };

    // Show loading while checking PIN
    if (isCheckingPin) {
        return (
            <div className="loading-container">
                <div className="loading-text">Loading...</div>
            </div>
        );
    }

    // Show PIN lock if PIN is set and not unlocked
    if (hasPin && !isUnlocked) {
        return <PinLock onUnlock={handleUnlock} />;
    }

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
                    onRandomSong={handleRandomSong}
                />
            </div>
        </>
    );
};

export default App;

