import React, { useState, useEffect, useRef } from 'react';
import '../styles/loading.css';
import {API_URL} from "../../urlConfig";
import {getAssetPath} from "../utils/assetPath";

function Loading() {
  const [voice, setVoice] = useState<HTMLAudioElement | null>(null);
  const [greeting, setGreeting] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number>(0);

  const greetings = [
    'Konnichiwa! Loading your music...',
    'Preparing your playlist...',
    'Just a moment, senpai!'
  ];

  const centerImage = {
 x: 200,
 y: 200,
 radius: 140 // Half of waifu image width
};

const visualizerSettings = {
 radius: 150, // Slightly larger than image radius
 bars: 180,
 barWidth: 2,
 barMaxHeight: 30,
 color: 'rgba(147, 51, 234, 0.6)' // Semi-transparent purple
};



  useEffect(() => {
    const voiceNumber = Math.floor(Math.random() * 3) + 1;
    const audio = new Audio(getAssetPath(`voices/zumi-${voiceNumber}.mp3`));

    setVoice(audio);
    setGreeting(greetings[Math.floor(Math.random() * greetings.length)]);

    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const source = audioContext.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log('Audio played');
        })
        .catch((error) => {
          console.error('Audio play error:', error);
        });
    }

   const animate = () => {
 const canvas = canvasRef.current;
 if (!canvas || !analyser) return;

 const ctx = canvas.getContext('2d');
 if (!ctx) return;

 const dataArray = new Uint8Array(analyser.frequencyBinCount);
 analyser.getByteFrequencyData(dataArray);

 ctx.clearRect(0, 0, canvas.width, canvas.height);
 ctx.lineWidth = visualizerSettings.barWidth;
 ctx.strokeStyle = visualizerSettings.color;

 for (let i = 0; i < visualizerSettings.bars; i++) {
   const angle = (i * 2 * Math.PI) / visualizerSettings.bars;
   const value = dataArray[i] || 0;
   const barHeight = (value / 255) * visualizerSettings.barMaxHeight;

   const x1 = centerImage.x + visualizerSettings.radius * Math.cos(angle);
   const y1 = centerImage.y + visualizerSettings.radius * Math.sin(angle);
   const x2 = centerImage.x + (visualizerSettings.radius + barHeight) * Math.cos(angle);
   const y2 = centerImage.y + (visualizerSettings.radius + barHeight) * Math.sin(angle);

   ctx.beginPath();
   ctx.moveTo(x1, y1);
   ctx.lineTo(x2, y2);
   ctx.stroke();
 }

 animationRef.current = requestAnimationFrame(animate);
};
    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      audio.pause();
      audio.currentTime = 0;
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

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
           src={process.env.NODE_ENV === 'development'
             ? './public/images/zumi.png'
             : `${API_URL}/images/zumi.png`}
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
}

      export default Loading;