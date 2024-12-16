import React, { useState, useEffect, useRef } from 'react';
import '../styles/loading.css';
import { getAssetPath } from '../utils/assetPath';
import { AudioManager } from '../utils/audioManager';

const Loading: React.FC = React.memo(() => {
    Loading.displayName = 'Loading';
    const [greeting, setGreeting] = useState('');
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationRef = useRef<number>(0);
    const mountCountRef = useRef(0);

    const greetings = [
        'Konnichiwa! Loading your music...',
        'Preparing your playlist...',
        'Just a moment, senpai!',
    ];

    const centerImage = {
        x: 200,
        y: 200,
        radius: 140,
    };

    const visualizerSettings = {
        radius: 150,
        bars: 180,
        barWidth: 2,
        barMaxHeight: 30,
        color: 'rgba(147, 51, 234, 0.6)',
    };

    useEffect(() => {
        mountCountRef.current += 1;
        const mountId = mountCountRef.current;
        console.log(`Loading component mount #${mountId}`);

        const voiceNumber = Math.floor(Math.random() * 3) + 1;
        const audioPath = getAssetPath(`voices/zumi-${voiceNumber}.mp3`);

        const initializeAudio = async () => {
            const result = await AudioManager.initialize(
                voiceNumber,
                audioPath,
            );
            if (result) {
                audioContextRef.current = result.audioContext;
                analyserRef.current = result.analyser;
            }
        };

        setGreeting(greetings[Math.floor(Math.random() * greetings.length)]);
        initializeAudio();
        setupVisualizer();

        return () => {
            console.log(`Cleaning up Loading component mount #${mountId}`);
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = 0;
            }
        };
    }, []);

    const setupVisualizer = () => {
        const animate = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            const dataArray = AudioManager.getAnalyserData();
            if (!dataArray) return;

            analyserRef.current?.getByteFrequencyData(dataArray);

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.lineWidth = visualizerSettings.barWidth;
            ctx.strokeStyle = visualizerSettings.color;

            for (let i = 0; i < visualizerSettings.bars; i++) {
                const angle = (i * 2 * Math.PI) / visualizerSettings.bars;
                const value = dataArray[i] || 0;
                const barHeight =
                    (value / 255) * visualizerSettings.barMaxHeight;

                const x1 =
                    centerImage.x + visualizerSettings.radius * Math.cos(angle);
                const y1 =
                    centerImage.y + visualizerSettings.radius * Math.sin(angle);
                const x2 =
                    centerImage.x +
                    (visualizerSettings.radius + barHeight) * Math.cos(angle);
                const y2 =
                    centerImage.y +
                    (visualizerSettings.radius + barHeight) * Math.sin(angle);

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }

            animationRef.current = requestAnimationFrame(animate);
        };
        animate();
    };

    return (
        <div className="loading-container">
            <div className="waifu-container">
                <h1 className="kawaii-text">Zumi Music</h1>
                <div className="avatar-container">
                    <canvas
                        ref={canvasRef}
                        width="400"
                        height="400"
                        className="spectrum-canvas"
                    />
                    <img
                        src={getAssetPath('images/zumi.png')}
                        alt="Zumi"
                        className="waifu-image"
                    />
                </div>
                <div className="loading-dots">
                    <div className="dot"></div>
                    <div className="dot"></div>
                    <div className="dot"></div>
                </div>
                <p className="loading-text">{greeting}</p>
            </div>
        </div>
    );
});

export default Loading;
