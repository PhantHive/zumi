// client/src/renderer/components/VideoPlayer.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Maximize2, Minimize2, Volume2, VolumeX, Loader } from 'lucide-react';
import '../styles/videoPlayer.css';

interface VideoPlayerProps {
    videoUrl: string | null;
    songTitle?: string;
    artistName?: string;
    videoRef?: React.RefObject<HTMLVideoElement | null>;
    onVideoReady?: (ref: HTMLVideoElement) => void;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
                                                     videoUrl,
                                                     songTitle,
                                                     artistName,
                                                     videoRef: externalVideoRef,
                                                     onVideoReady,
                                                 }) => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const internalVideoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Use external ref if provided, otherwise internal
    const videoRef = externalVideoRef || internalVideoRef;

    // Reset loading state when video URL changes
    useEffect(() => {
        if (videoUrl) {
            setIsLoading(true);
        }
    }, [videoUrl]);

    // Handle video ready state
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const handleCanPlay = () => {
            console.log('Video ready to play');
            setIsLoading(false);
            if (onVideoReady) {
                onVideoReady(video);
            }
            // Auto-play the video when ready
            video.play().catch(error => {
                console.error('Auto-play failed:', error);
            });
        };

        const handleLoadedData = () => {
            console.log('Video data loaded');
            // Set loading to false earlier when data is loaded
            setIsLoading(false);
        };

        const handleLoadStart = () => {
            console.log('Video loading started');
            setIsLoading(true);
        };

        const handleError = (e: Event) => {
            console.error('Video error:', e);
            setIsLoading(false);
        };

        const handlePlaying = () => {
            console.log('Video is playing');
        };

        video.addEventListener('loadeddata', handleLoadedData);
        video.addEventListener('canplay', handleCanPlay);
        video.addEventListener('loadstart', handleLoadStart);
        video.addEventListener('error', handleError);
        video.addEventListener('playing', handlePlaying);

        return () => {
            video.removeEventListener('loadeddata', handleLoadedData);
            video.removeEventListener('canplay', handleCanPlay);
            video.removeEventListener('loadstart', handleLoadStart);
            video.removeEventListener('error', handleError);
            video.removeEventListener('playing', handlePlaying);
        };
    }, [videoUrl, videoRef, onVideoReady]);

    const toggleFullscreen = async () => {
        if (!containerRef.current) return;

        try {
            if (!isFullscreen) {
                if (containerRef.current.requestFullscreen) {
                    await containerRef.current.requestFullscreen();
                }
                setIsFullscreen(true);
            } else {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                }
                setIsFullscreen(false);
            }
        } catch (error) {
            console.error('Fullscreen error:', error);
        }
    };

    const toggleMute = () => {
        if (videoRef.current) {
            videoRef.current.muted = !isMuted;
            setIsMuted(!isMuted);
        }
    };

    if (!videoUrl) return null;

    return (
        <div
            ref={containerRef}
            className={`video-player-split ${isFullscreen ? 'fullscreen' : ''}`}
        >
            <div className="video-split-container">
                {/* Video Frame */}
                <div className="video-split-frame">
                    <video
                        ref={videoRef as React.RefObject<HTMLVideoElement>}
                        src={videoUrl}
                        loop
                        autoPlay
                        muted={isMuted}
                        className="video-split-element"
                        playsInline
                    />

                    {isLoading && (
                        <div className="video-loading-overlay">
                            <Loader className="loading-spinner" size={48} />
                            <p className="loading-text">Loading video...</p>
                        </div>
                    )}
                </div>

                {/* Info Overlay */}
                <div className="video-split-info">
                    <div className="info-content">
                        <h3 className="info-title">{songTitle}</h3>
                        <p className="info-artist">{artistName}</p>
                    </div>
                </div>

                {/* Controls Overlay */}
                <div className="video-split-controls">
                    <button
                        className="split-control-btn"
                        onClick={toggleMute}
                        title={isMuted ? 'Unmute' : 'Mute'}
                        disabled={isLoading}
                    >
                        {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                    </button>

                    <button
                        className="split-control-btn"
                        onClick={toggleFullscreen}
                        title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
                    >
                        {isFullscreen ? <Minimize2 size={20} /> : <Maximize2 size={20} />}
                    </button>
                </div>

                {/* Decorative elements */}
                <div className="split-glow-top"></div>
                <div className="split-glow-bottom"></div>
                <div className="split-border-accent"></div>
            </div>
        </div>
    );
};

export default VideoPlayer;