import React, { useState, useRef, useEffect } from 'react';
import { Song } from '../../../../shared/types/common';
import '../styles/player.css';
import VolumeControl from './VolumeControl';
import { ipcRenderer } from 'electron';
import { apiClient } from '../utils/apiClient';
import KawaiiPlayButton from './PlayButton';

interface PlayerProps {
    currentSong: Song | null;
    onNext: () => void;
    onPrevious: () => void;
}

interface Color {
    r: number;
    g: number;
    b: number;
    a: number;
}

interface Colors {
    color1: string;
    color2: string;
}

const Player: React.FC<PlayerProps> = ({ currentSong, onNext, onPrevious }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [streamUrl, setStreamUrl] = useState<string>('');
    const [thumbnailUrl, setThumbnailUrl] = useState<string>('');
    const audioRef = useRef<HTMLAudioElement>(null);

    const extractColors = async (url: string): Promise<Colors> => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = url;

        return new Promise((resolve) => {
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);

                    const sampleColors = (x: number, y: number): Color => {
                        const data = ctx.getImageData(x, y, 1, 1).data;
                        return {
                            r: data[0],
                            g: data[1],
                            b: data[2],
                            a: data[3],
                        };
                    };

                    const isBright = (color: {
                        r: number;
                        g: number;
                        b: number;
                        a: number;
                    }) => {
                        if (color.a === 0) return false; // Skip fully transparent pixels
                        const brightness =
                            (color.r * 299 + color.g * 587 + color.b * 114) /
                            1000;
                        return brightness > 100; // Adjust threshold as needed
                    };

                    const colors = [
                        sampleColors(0, 0),
                        sampleColors(img.width - 1, 0),
                        sampleColors(0, img.height - 1),
                        sampleColors(img.width - 1, img.height - 1),
                        sampleColors(
                            Math.floor(img.width / 2),
                            Math.floor(img.height / 2),
                        ),
                    ];

                    const brightColors = colors.filter(isBright);
                    const chosenColors =
                        brightColors.length > 0
                            ? brightColors
                            : colors.filter((color) => color.a !== 0);

                    const brightenColor = (color: {
                        r: number;
                        g: number;
                        b: number;
                        a: number;
                    }) => {
                        const factor = 1.5; // Increase brightness by 50%
                        return `rgba(${Math.min(color.r * factor, 255)}, ${Math.min(color.g * factor, 255)}, ${Math.min(color.b * factor, 255)}, 0.8)`;
                    };

                    if (chosenColors.length >= 2) {
                        resolve({
                            color1: brightenColor(chosenColors[0]),
                            color2: brightenColor(chosenColors[1]),
                        });
                    } else {
                        resolve({
                            color1: 'rgba(255, 255, 255, 0.8)', // Default to white if no valid colors found
                            color2: 'rgba(255, 255, 255, 0.8)',
                        });
                    }
                }
            };
        });
    };

    useEffect(() => {
        let cleanup: (() => void) | undefined;

        const loadMedia = async () => {
            if (currentSong) {
                try {
                    const streamData = await apiClient.getStream(
                        `/api/songs/${currentSong.id}/stream`,
                    );
                    setStreamUrl(streamData.url);
                    cleanup = streamData.cleanup;

                    if (currentSong.thumbnailUrl) {
                        const thumbnailData = await apiClient.getStream(
                            `/api/songs/thumbnails/${currentSong.thumbnailUrl}`,
                        );
                        setThumbnailUrl(thumbnailData.url);
                        const prevCleanup = cleanup;
                        cleanup = () => {
                            prevCleanup?.();
                            thumbnailData.cleanup();
                        };
                    }
                } catch (error) {
                    console.error('Error loading media:', error);
                }
            }
        };

        loadMedia();

        return () => {
            cleanup?.();
        };
    }, [currentSong]);

    useEffect(() => {
        if (currentSong && isPlaying) {
            ipcRenderer.send('update-presence', {
                title: currentSong.title,
                artist: currentSong.artist,
                duration: currentSong.duration,
                startTime: Date.now(),
                albumId: currentSong.albumId,
                thumbnailUrl: currentSong.thumbnailUrl,
            });
        } else {
            ipcRenderer.send('clear-presence');
        }
    }, [currentSong, isPlaying]);

    useEffect(() => {
        const playNewSong = async () => {
            if (currentSong && audioRef.current) {
                try {
                    // Pause the audio and wait for it to complete
                    await audioRef.current.pause();
                    audioRef.current.currentTime = 0;

                    const streamData = await apiClient.getStream(
                        `/api/songs/${currentSong.id}/stream`,
                    );
                    setStreamUrl(streamData.url);

                    // Ensure the audio element's src is updated before calling play()
                    audioRef.current.src = streamData.url;

                    // Ensure pause() has completed before calling play()
                    await new Promise((resolve) => setTimeout(resolve, 100));

                    const isCurrentlyPlaying =
                        audioRef.current.currentTime > 0 &&
                        !audioRef.current.paused &&
                        !audioRef.current.ended &&
                        audioRef.current.readyState >
                            audioRef.current.HAVE_CURRENT_DATA;

                    if (!isCurrentlyPlaying) {
                        const playPromise = audioRef.current.play();
                        if (playPromise !== undefined) {
                            await playPromise; // Wait for play to complete
                            setIsPlaying(true); // Update the state after successful play
                        }
                    }
                } catch (error) {
                    console.error('Error starting playback:', error);
                    setIsPlaying(false);
                }
            } else {
                setIsPlaying(false);
                if (currentSong) {
                    // We'll explicitly set isPlaying to true before calling playNewSong
                    setIsPlaying(true); // Set this first
                    setTimeout(playNewSong, 100);
                }
            }
        };

        const playPromise = playNewSong();
        return () => {
            if (playPromise) {
                playPromise.then(() => {
                    setIsPlaying(false);
                });
            }
        };
    }, [currentSong]);

    useEffect(() => {
        if (thumbnailUrl) {
            extractColors(thumbnailUrl).then((colors) => {
                document.documentElement.style.setProperty(
                    '--thumbnail-color-1',
                    colors.color1,
                );
                document.documentElement.style.setProperty(
                    '--thumbnail-color-2',
                    colors.color2,
                );
            });
        }
    }, [thumbnailUrl]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handlePlayClick = async () => {
        if (!audioRef.current) return;

        try {
            if (isPlaying) {
                audioRef.current.pause();
                setIsPlaying(false);
            } else {
                const playPromise = audioRef.current.play();
                if (playPromise !== undefined) {
                    await playPromise;
                    setIsPlaying(true);
                }
            }
        } catch (error) {
            console.error('Playback control error:', error);
            setIsPlaying(false);
        }
    };

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const bar = e.currentTarget;
        const clickPosition =
            (e.clientX - bar.getBoundingClientRect().left) / bar.offsetWidth;
        if (audioRef.current) {
            audioRef.current.currentTime =
                clickPosition * (audioRef.current.duration || 0);
        }
    };

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            const progress =
                (audioRef.current.currentTime / audioRef.current.duration) *
                100;
            setProgress(progress);
            setCurrentTime(audioRef.current.currentTime);
        }
    };

    const handleCoverClick = async () => {
        if (audioRef.current) {
            try {
                const streamData = await apiClient.getStream(
                    `/api/songs/${currentSong?.id}/stream`,
                );
                setStreamUrl(streamData.url);

                // Ensure the audio element's src is updated before calling play()
                audioRef.current.src = streamData.url;

                // Set playing state before starting playback
                setIsPlaying(true);

                const playPromise = audioRef.current.play();
                if (playPromise !== undefined) {
                    await playPromise;
                }
            } catch (error) {
                console.error('Playback failed:', error);
                setIsPlaying(false);
            }
        }
    };

    useEffect(() => {
        const thumbnailElement = document.querySelector('.album-cover');
        thumbnailElement?.addEventListener('click', handleCoverClick);

        return () => {
            thumbnailElement?.removeEventListener('click', handleCoverClick);
        };
    }, [thumbnailUrl]);

    return (
        <div className="player-container">
            <div className="progress-section">
                <div className="progress-wrapper">
                    <div className="progress-bar" onClick={handleProgressClick}>
                        <div
                            className="progress-current"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="time-display">
                        {formatTime(currentTime)} /{' '}
                        {formatTime(audioRef.current?.duration || 0)}
                    </div>
                </div>
            </div>

            <div className="player-content">
                {currentSong?.thumbnailUrl && thumbnailUrl && (
                    <img
                        src={thumbnailUrl}
                        alt="Album art"
                        className="thumbnail"
                    />
                )}
                <div className="player-controls">
                    <KawaiiPlayButton
                        isPlaying={isPlaying}
                        onClick={handlePlayClick}
                        onNext={onNext}
                        onPrevious={onPrevious}
                    />
                    <VolumeControl audioRef={audioRef} />
                </div>
            </div>

            <div className="spectrum-container">
                <div className="wave"></div>
                <div className="wave"></div>
                <div className="wave"></div>
            </div>

            {currentSong && streamUrl && (
                <audio
                    ref={audioRef}
                    src={streamUrl}
                    onEnded={onNext}
                    onTimeUpdate={handleTimeUpdate}
                />
            )}
        </div>
    );
};

export default Player;
