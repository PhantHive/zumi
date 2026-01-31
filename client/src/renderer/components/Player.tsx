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
    onRandomSong: () => void;
    onPlayStateChange?: (isPlaying: boolean) => void;
    onVideoUrlChange?: (url: string) => void;
    onVideoRefReady?: (ref: React.RefObject<HTMLVideoElement | null>) => void;
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

const Player: React.FC<PlayerProps> = ({
                                           currentSong,
                                           onNext,
                                           onPrevious,
                                           onRandomSong,
                                           onPlayStateChange,
                                           onVideoUrlChange,
                                           onVideoRefReady,
                                       }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [streamUrl, setStreamUrl] = useState<string>('');
    const [thumbnailUrl, setThumbnailUrl] = useState<string>('');
    const [hasVideo, setHasVideo] = useState(false);
    const audioRef = useRef<HTMLAudioElement>(null);
    const videoRefExternal = useRef<HTMLVideoElement | null>(null);

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
                        if (color.a === 0) return false;
                        const brightness =
                            (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
                        return brightness > 100;
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
                        const factor = 1.5;
                        return `rgba(${Math.min(color.r * factor, 255)}, ${Math.min(color.g * factor, 255)}, ${Math.min(color.b * factor, 255)}, 0.8)`;
                    };

                    if (chosenColors.length >= 2) {
                        resolve({
                            color1: brightenColor(chosenColors[0]),
                            color2: brightenColor(chosenColors[1]),
                        });
                    } else {
                        resolve({
                            color1: 'rgba(255, 255, 255, 0.8)',
                            color2: 'rgba(255, 255, 255, 0.8)',
                        });
                    }
                }
            };
        });
    };

    // Notify parent of play state changes
    useEffect(() => {
        if (onPlayStateChange) {
            onPlayStateChange(isPlaying);
        }
        ipcRenderer.send('thumbnail-update-state', isPlaying);
    }, [isPlaying, onPlayStateChange]);

    // Handle play/pause for both audio and video
    const handlePlayClick = async () => {
        try {
            if (hasVideo && videoRefExternal.current) {
                // Use video for playback
                if (isPlaying) {
                    videoRefExternal.current.pause();
                    setIsPlaying(false);
                } else {
                    await videoRefExternal.current.play();
                    setIsPlaying(true);
                }
            } else if (audioRef.current) {
                // Use audio for playback
                if (isPlaying) {
                    audioRef.current.pause();
                    setIsPlaying(false);
                } else {
                    await audioRef.current.play();
                    setIsPlaying(true);
                }
            }
        } catch (error) {
            console.error('Playback control error:', error);
            setIsPlaying(false);
        }
    };

    useEffect(() => {
        const handleThumbnailPrevious = () => onPrevious();
        const handleThumbnailNext = () => onNext();
        const handleThumbnailPlayPause = () => handlePlayClick();
        const handleThumbnailRandom = () => onRandomSong();

        ipcRenderer.on('thumbnail-previous', handleThumbnailPrevious);
        ipcRenderer.on('thumbnail-next', handleThumbnailNext);
        ipcRenderer.on('thumbnail-playpause', handleThumbnailPlayPause);
        ipcRenderer.on('thumbnail-random', handleThumbnailRandom);

        return () => {
            ipcRenderer.removeListener('thumbnail-previous', handleThumbnailPrevious);
            ipcRenderer.removeListener('thumbnail-next', handleThumbnailNext);
            ipcRenderer.removeListener('thumbnail-playpause', handleThumbnailPlayPause);
            ipcRenderer.removeListener('thumbnail-random', handleThumbnailRandom);
        };
    }, [onPrevious, onNext, handlePlayClick, onRandomSong]);

    useEffect(() => {
        if (currentSong) {
            ipcRenderer.send('update-thumbnail-info', {
                title: currentSong.title,
                artist: currentSong.artist,
            });
        }
    }, [currentSong]);

    // Load audio, thumbnail, and video when song changes
    useEffect(() => {
        let cleanupFunctions: (() => void)[] = [];

        const loadMedia = async () => {
            if (currentSong) {
                try {
                    // Load audio stream
                    const streamData = await apiClient.getStream(
                        `/api/songs/${currentSong.id}/stream`,
                    );
                    setStreamUrl(streamData.url);
                    cleanupFunctions.push(streamData.cleanup);

                    // Load thumbnail
                    if (currentSong.thumbnailUrl) {
                        const thumbnailData = await apiClient.getStream(
                            `/api/songs/thumbnails/${currentSong.thumbnailUrl}`,
                        );
                        setThumbnailUrl(thumbnailData.url);
                        cleanupFunctions.push(thumbnailData.cleanup);
                    }

                    // Load video if available
                    if (currentSong.id && onVideoUrlChange) {
                        try {
                            const videoData = await apiClient.getStream(
                                `/api/songs/${currentSong.id}/stream-video`,
                            );
                            onVideoUrlChange(videoData.url);
                            setHasVideo(true);
                            cleanupFunctions.push(videoData.cleanup);
                            console.log('Video loaded successfully');
                        } catch (videoError) {
                            console.log('No video available for this song');
                            onVideoUrlChange('');
                            setHasVideo(false);
                        }
                    }
                } catch (error) {
                    console.error('Error loading media:', error);
                }
            } else {
                if (onVideoUrlChange) {
                    onVideoUrlChange('');
                }
                setHasVideo(false);
            }
        };

        loadMedia();

        return () => {
            cleanupFunctions.forEach((cleanup) => cleanup());
        };
    }, [currentSong, onVideoUrlChange]);

    // Pass video ref to parent when ready
    useEffect(() => {
        if (onVideoRefReady) {
            onVideoRefReady(videoRefExternal);
        }
    }, [onVideoRefReady]);

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
            if (currentSong && audioRef.current && !hasVideo) {
                try {
                    await audioRef.current.pause();
                    audioRef.current.currentTime = 0;

                    const streamData = await apiClient.getStream(
                        `/api/songs/${currentSong.id}/stream`,
                    );
                    setStreamUrl(streamData.url);

                    audioRef.current.src = streamData.url;

                    await new Promise((resolve) => setTimeout(resolve, 100));

                    const playPromise = audioRef.current.play();
                    if (playPromise !== undefined) {
                        await playPromise;
                        setIsPlaying(true);
                    }
                } catch (error) {
                    console.error('Error starting playback:', error);
                    setIsPlaying(false);
                }
            }
        };

        playNewSong();
    }, [currentSong, hasVideo]);

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

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const bar = e.currentTarget;
        const clickPosition =
            (e.clientX - bar.getBoundingClientRect().left) / bar.offsetWidth;

        if (hasVideo && videoRefExternal.current) {
            videoRefExternal.current.currentTime = clickPosition * (videoRefExternal.current.duration || 0);
        } else if (audioRef.current) {
            audioRef.current.currentTime = clickPosition * (audioRef.current.duration || 0);
        }
    };

    const handleTimeUpdate = () => {
        let currentProgress = 0;
        let currentDuration = 0;
        let current = 0;

        if (hasVideo && videoRefExternal.current) {
            current = videoRefExternal.current.currentTime;
            currentDuration = videoRefExternal.current.duration || 0;
        } else if (audioRef.current) {
            current = audioRef.current.currentTime;
            currentDuration = audioRef.current.duration || 0;
        }

        currentProgress = (current / currentDuration) * 100;
        setProgress(currentProgress);
        setCurrentTime(current);
        setDuration(currentDuration);
    };

    // Sync audio element's time update with video if video exists
    useEffect(() => {
        if (hasVideo && videoRefExternal.current) {
            const video = videoRefExternal.current;
            video.addEventListener('timeupdate', handleTimeUpdate);
            video.addEventListener('ended', onNext);

            return () => {
                video.removeEventListener('timeupdate', handleTimeUpdate);
                video.removeEventListener('ended', onNext);
            };
        }
    }, [hasVideo, onNext]);

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
                        {formatTime(currentTime)} / {formatTime(duration)}
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
                    <VolumeControl
                        audioRef={hasVideo ? videoRefExternal : audioRef}
                    />
                </div>
            </div>

            <div className="spectrum-container">
                <div className="wave"></div>
                <div className="wave"></div>
                <div className="wave"></div>
            </div>

            {/* Audio element - muted if video exists */}
            {currentSong && streamUrl && !hasVideo && (
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