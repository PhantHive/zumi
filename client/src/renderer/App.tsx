// client/src/renderer/App.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Song, Album } from '../../../shared/types/common';
import Player from './components/Player';
import Sidebar from './components/Sidebar';
import AlbumView from './components/Album';
import PinLock from './components/PinLock';
import Settings from './components/Settings';
import VideoPlayer from './components/VideoPlayer';
import ZumiAssistant from './components/ZumiAssistant';
import './styles/global.css';
import { apiClient } from './utils/apiClient';
import { ipcRenderer } from 'electron';

interface SongsResponse {
    data: Song[];
}

type View = 'music' | 'settings';

const App: React.FC = () => {
    const [currentSong, setCurrentSong] = useState<Song | null>(null);
    const [albums, setAlbums] = useState<Album[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [currentView, setCurrentView] = useState<View>('music');
    const [videoUrl, setVideoUrl] = useState<string>('');
    const [isPlaying, setIsPlaying] = useState(false);
    const videoRef = useRef<HTMLVideoElement | null>(null);

    // PIN lock states
    const [hasPin, setHasPin] = useState<boolean>(false);
    const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
    const [isCheckingPin, setIsCheckingPin] = useState<boolean>(true);

    useEffect(() => {
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

            const checkPin = async () => {
                try {
                    const response = await ipcRenderer.invoke('pin:has-pin');
                    console.log('PIN check response:', response);

                    const hasPinSet = response?.hasPinSet || false;
                    setHasPin(hasPinSet);
                    setIsUnlocked(!hasPinSet);
                } catch (error) {
                    const msg = error instanceof Error ? error.message : String(error);
                    if (
                        msg.includes('No handler registered') ||
                        msg.includes('ipcRenderer is not defined') ||
                        msg.includes('not implemented') ||
                        msg.includes('invoke')
                    ) {
                        console.warn('IPC not available; unlocking anyway (dev mode)');
                        setHasPin(false);
                        setIsUnlocked(true);
                    } else {
                        console.error('Error checking PIN:', error);
                        setHasPin(false);
                        setIsUnlocked(true);
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
        if (isUnlocked && currentView === 'music') {
            fetchSongs();
        }
    }, [isUnlocked, currentView]);

    const fetchSongs = async () => {
        try {
            const response = await apiClient.get<SongsResponse>('/api/songs');
            const songs = response.data || [];

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
            const randomAlbum = albums[Math.floor(Math.random() * albums.length)];
            if (randomAlbum.songs.length > 0) {
                const randomSong =
                    randomAlbum.songs[Math.floor(Math.random() * randomAlbum.songs.length)];
                setCurrentSong(randomSong);
            }
        }
    };

    const handleUnlock = () => {
        setIsUnlocked(true);
    };

    const handleNavigate = (view: View) => {
        setCurrentView(view);
    };

    const handlePlayStateChange = (playing: boolean) => {
        setIsPlaying(playing);
    };

    const handleVideoUrlChange = (url: string) => {
        setVideoUrl(url);
    };

    const handleVideoRefReady = (ref: React.RefObject<HTMLVideoElement | null>) => {
        videoRef.current = ref.current;
    };

    if (isCheckingPin) {
        return (
            <div className="loading-container">
                <div className="loading-text">Loading...</div>
            </div>
        );
    }

    if (hasPin && !isUnlocked) {
        return <PinLock onUnlock={handleUnlock} />;
    }

    if (currentView === 'settings') {
        return (
            <div className="app-wrapper">
                <Sidebar
                    onSongUpload={fetchSongs}
                    currentView={currentView}
                    onNavigate={handleNavigate}
                />
                <div className="content-wrapper">
                    <div className="main-content">
                        <Settings />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="app-wrapper">
            <Sidebar
                onSongUpload={fetchSongs}
                currentView={currentView}
                onNavigate={handleNavigate}
            />
            <div className="content-wrapper">
                {/* Main Layout Area - Split Screen */}
                <div className="main-layout-area">
                    {/* Albums Container - Left Side */}
                    <div className="albums-container">
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

                    {/* Right Panel - Zumi Assistant OR Video */}
                    <div className="right-panel">
                        {videoUrl ? (
                            <VideoPlayer
                                videoUrl={videoUrl}
                                songTitle={currentSong?.title}
                                artistName={currentSong?.artist}
                                videoRef={videoRef}
                            />
                        ) : (
                            <ZumiAssistant
                                isPlaying={isPlaying}
                                albums={albums}
                                setCurrentSong={setCurrentSong}
                            />
                        )}
                    </div>
                </div>

                {/* Player - Bottom Fixed */}
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
                                currentAlbum.songs[(currentIndex + 1) % currentAlbum.songs.length];
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
                                (currentIndex - 1 + currentAlbum.songs.length) %
                                currentAlbum.songs.length
                                    ];
                            setCurrentSong(prevSong);
                        }
                    }}
                    onRandomSong={handleRandomSong}
                    onPlayStateChange={handlePlayStateChange}
                    onVideoUrlChange={handleVideoUrlChange}
                    onVideoRefReady={handleVideoRefReady}
                />
            </div>
        </div>
    );
};

export default App;