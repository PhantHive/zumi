// client/src/renderer/components/ZumiAssistant.tsx
import React, { useState, useEffect, useRef } from 'react';
import '../styles/zumiAssistant.css';
import { getAssetPath } from '../utils/assetPath';
import { Album, Song } from '../../../../shared/types/common';

interface ZumiAssistantProps {
    isPlaying: boolean;
    albums: Album[];
    setCurrentSong: (song: Song) => void;
}

type AnimationState = 'idle' | 'greeting' | 'enjoying-music' | 'enjoying-music-loop';

const ZumiAssistant: React.FC<ZumiAssistantProps> = ({ isPlaying, albums, setCurrentSong }) => {
    const [animationState, setAnimationState] = useState<AnimationState>('idle');
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Handle animation transitions based on music state
    useEffect(() => {
        if (isPlaying && animationState !== 'enjoying-music' && animationState !== 'enjoying-music-loop') {
            setAnimationState('enjoying-music');
        } else if (!isPlaying && (animationState === 'enjoying-music' || animationState === 'enjoying-music-loop')) {
            setAnimationState('idle');
        }
    }, [isPlaying, animationState]);

    // Update video source when animation state changes
    useEffect(() => {
        if (!videoRef.current) return;

        let videoPath = '';
        let shouldLoop = true;

        switch (animationState) {
            case 'greeting':
                videoPath = 'images/zumi-interactions/zumi-greet.mp4';
                shouldLoop = false;
                break;
            case 'enjoying-music':
                videoPath = 'images/zumi-interactions/zumi-enjoy-music.mp4';
                shouldLoop = false;
                break;
            case 'enjoying-music-loop':
                videoPath = 'images/zumi-interactions/zumi-enjoy-music-loop.mp4';
                shouldLoop = true;
                break;
            case 'idle':
            default:
                videoPath = 'images/zumi-interactions/zumi-idle.mp4';
                shouldLoop = true;
                break;
        }

        videoRef.current.src = getAssetPath(videoPath);
        videoRef.current.loop = shouldLoop;
        videoRef.current.play().catch(console.error);
    }, [animationState]);

    // Handle video end for non-looping animations
    const handleVideoEnd = () => {
        if (animationState === 'greeting') {
            setAnimationState('idle');
        } else if (animationState === 'enjoying-music') {
            setAnimationState('enjoying-music-loop');
        }
    };

    // Handle greeting interaction
    const handleGreeting = () => {
        if (animationState === 'idle') {
            setAnimationState('greeting');

            // Play random greeting voice
            const voiceNumber = Math.floor(Math.random() * 5) + 1;
            const audioPath = getAssetPath(`voices/zumi-${voiceNumber}.mp3`);

            if (audioRef.current) {
                audioRef.current.pause();
            }

            audioRef.current = new Audio(audioPath);
            audioRef.current.play().catch(console.error);
        }
    };

    // Play random song
    const playRandomSong = () => {
        if (albums.length === 0) return;

        const randomAlbum = albums[Math.floor(Math.random() * albums.length)];
        const randomSong = randomAlbum.songs[Math.floor(Math.random() * randomAlbum.songs.length)];
        setCurrentSong(randomSong);
    };

    return (
        <div className="zumi-assistant-container">
            {/* Video Frame */}
            <div className="assistant-frame">
                <div className="frame-border"></div>
                <video
                    ref={videoRef}
                    className="assistant-video"
                    autoPlay
                    muted
                    playsInline
                    preload="auto"
                    onEnded={handleVideoEnd}
                />
                <div className="frame-glow"></div>
            </div>

            {/* Assistant Info */}
            <div className="assistant-info">
                <h3 className="assistant-name">Zumi Assistant</h3>
                <p className="assistant-status">
                    {isPlaying ? '♪ Enjoying the music' : '● Ready to assist'}
                </p>
            </div>

            {/* Action Buttons */}
            <div className="assistant-actions">
                <button
                    className="assistant-btn greet-btn"
                    onClick={handleGreeting}
                    disabled={animationState !== 'idle'}
                    title="Greet Zumi"
                >
                    <span className="btn-icon">👋</span>
                    <span className="btn-label">Say Hi</span>
                </button>
                <button
                    className="assistant-btn random-btn"
                    onClick={playRandomSong}
                    title="Play random song"
                >
                    <span className="btn-icon">🎲</span>
                    <span className="btn-label">Surprise Me</span>
                </button>
            </div>
        </div>
    );
};

export default ZumiAssistant;
