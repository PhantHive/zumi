// client/src/renderer/components/ZumiHologram.tsx
import React, { useState, useEffect, useRef } from 'react';
import '../styles/zumiHologram.css';
import { getAssetPath } from '../utils/assetPath';

interface ZumiHologramProps {
    isPlaying: boolean;
    hasVideo?: boolean;
    onGreet?: () => void;
}

type AnimationState = 'idle' | 'greeting' | 'enjoying-music' | 'enjoying-music-loop';

const ZumiHologram: React.FC<ZumiHologramProps> = ({ isPlaying, hasVideo, onGreet }) => {
    const [animationState, setAnimationState] = useState<AnimationState>('idle');
    const [isExpanded, setIsExpanded] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    // Handle animation transitions
    useEffect(() => {
        if (isPlaying && animationState !== 'enjoying-music' && animationState !== 'enjoying-music-loop') {
            // Music started - play enjoy music animation once
            setAnimationState('enjoying-music');
            setIsExpanded(true);
        } else if (!isPlaying && (animationState === 'enjoying-music' || animationState === 'enjoying-music-loop')) {
            // Music stopped - return to idle
            setAnimationState('idle');
            setIsExpanded(false);
        }
    }, [isPlaying]);

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
            // Transition to looping version
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

            if (onGreet) {
                onGreet();
            }
        }
    };

    return (
        <div className={`hologram-container ${isExpanded ? 'expanded' : 'compact'} ${hasVideo ? 'with-video' : ''}`}>
            {/* Hologram Device Frame */}
            <div className="hologram-device">
                {/* Top Cap */}
                <div className="device-cap top">
                    <div className="cap-ring"></div>
                    <div className="cap-glow"></div>
                </div>

                {/* Main Cylinder */}
                <div className="device-cylinder">
                    {/* Glass effect layers */}
                    <div className="glass-layer"></div>
                    <div className="glass-reflection"></div>

                    {/* Hologram content */}
                    <div className="hologram-content">
                        <video
                            ref={videoRef}
                            className="hologram-video"
                            autoPlay
                            muted
                            playsInline
                            preload="auto"
                            onEnded={handleVideoEnd}
                        />

                        {/* Hologram effects */}
                        <div className="hologram-scanlines"></div>
                        <div className="hologram-flicker"></div>
                        <div className="hologram-glow"></div>
                    </div>

                    {/* Cylinder bands */}
                    <div className="cylinder-band top"></div>
                    <div className="cylinder-band bottom"></div>
                </div>

                {/* Bottom Base */}
                <div className="device-base">
                    <div className="base-platform">
                        <div className="base-ring"></div>
                        <div className="base-glow"></div>
                        <div className="base-indicator"></div>
                    </div>
                    <div className="base-label">ZUMI v1.0</div>
                </div>

                {/* Interaction button */}
                <button
                    className="hologram-interact-btn"
                    onClick={handleGreeting}
                    disabled={animationState !== 'idle'}
                >
                    <span className="btn-icon">👋</span>
                    <span className="btn-text">Say Hi!</span>
                </button>
            </div>

            {/* Ambient lighting */}
            <div className="ambient-light"></div>
        </div>
    );
};

export default ZumiHologram;