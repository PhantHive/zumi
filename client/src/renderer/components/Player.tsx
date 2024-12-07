import React, { useState, useRef, useEffect } from 'react';
import { Song } from '../../../../shared/types/common';
import '../styles/player.css';
import VolumeControl from "./VolumeControl";
import {ipcRenderer} from "electron";
import {API_URL} from "../../config";

interface PlayerProps {
  currentSong: Song | null;
  onNext: () => void;
  onPrevious: () => void;
}

const Player: React.FC<PlayerProps> = ({ currentSong, onNext, onPrevious }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const extractColors = async (url: string) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = `${API_URL}${url}`;

    return new Promise((resolve) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const topLeft = ctx.getImageData(0, 0, 1, 1).data;
          const bottomRight = ctx.getImageData(img.width - 1, img.height - 1, 1, 1).data;

          resolve({
            color1: `rgba(${topLeft[0]}, ${topLeft[1]}, ${topLeft[2]}, 0.8)`,
            color2: `rgba(${bottomRight[0]}, ${bottomRight[1]}, ${bottomRight[2]}, 0.8)`
          });
        }
      };
    });
  };

  useEffect(() => {
    if (currentSong && isPlaying) {
      ipcRenderer.send('update-presence', {
        title: currentSong.title,
        artist: currentSong.artist,
        duration: currentSong.duration,
        startTime: Date.now(),
        albumId: currentSong.albumId,
        thumbnailUrl: currentSong.thumbnailUrl
      });
    } else {
      ipcRenderer.send('clear-presence');
    }
  }, [currentSong, isPlaying]);

  useEffect(() => {
    if (currentSong) {
      setIsPlaying(true);
      audioRef.current?.play();
    }
  }, [currentSong]);

  useEffect(() => {
    if (currentSong?.thumbnailUrl) {
      extractColors(currentSong.thumbnailUrl).then((colors: any) => {
        document.documentElement.style.setProperty('--thumbnail-color-1', colors.color1);
        document.documentElement.style.setProperty('--thumbnail-color-2', colors.color2);
      });
    }
  }, [currentSong?.thumbnailUrl]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayClick = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        document.querySelector('.toggle-play-pause')?.classList.remove('play');
        document.querySelector('#play')?.classList.remove('animate');
      } else {
        audioRef.current.play();
        document.querySelector('.toggle-play-pause')?.classList.add('play');
        document.querySelector('#play')?.classList.add('animate');
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const bar = e.currentTarget;
    const clickPosition = (e.clientX - bar.getBoundingClientRect().left) / bar.offsetWidth;
    if (audioRef.current) {
      audioRef.current.currentTime = clickPosition * (audioRef.current.duration || 0);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const progress = (audioRef.current.currentTime / audioRef.current.duration) * 100;
      setProgress(progress);
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleThumbnailClick = () => {
  document.querySelector('.thumbnail')?.classList.toggle('active');
};

  return (
    <div className="player-container">
      <div className="progress-section">
        <div className="progress-wrapper">
          <div className="progress-bar" onClick={handleProgressClick}>
            <div className="progress-current" style={{ width: `${progress}%` }} />
          </div>
          <div className="time-display">
            {formatTime(currentTime)} / {formatTime(audioRef.current?.duration || 0)}
          </div>
        </div>
      </div>

      <div className="player-content">
        {currentSong?.thumbnailUrl && (
          <img
              onClick={handleThumbnailClick}
            src={`${API_URL}${currentSong.thumbnailUrl}`}
            alt="Album art"
            className="thumbnail"
          />
        )}
        <div className="player-controls">
          <button onClick={onPrevious}>Previous</button>
          <button
            onClick={handlePlayClick}
            className={`toggle-play-pause ${isPlaying ? 'play' : ''}`}
          >
            <svg id="play" className={isPlaying ? 'animate' : ''} viewBox="0 0 163 163" version="1.1" xmlns="http://www.w3.org/2000/svg">
              <g fill="none">
                <g transform="translate(2.000000, 2.000000)" strokeWidth="4">
                  <path d="M10,80 C10,118.107648 40.8923523,149 79,149 L79,149 C117.107648,149 148,118.107648 148,80 C148,41.8923523 117.107648,11 79,11" id="lineOne" stroke="#EE80D8"/>
                  <path d="M105.9,74.4158594 L67.2,44.2158594 C63.5,41.3158594 58,43.9158594 58,48.7158594 L58,109.015859 C58,113.715859 63.4,116.415859 67.2,113.515859 L105.9,83.3158594 C108.8,81.1158594 108.8,76.6158594 105.9,74.4158594 L105.9,74.4158594 Z" id="triangle" stroke="#EE80D8"/>
                  <path d="M159,79.5 C159,35.5933624 123.406638,0 79.5,0 C35.5933624,0 0,35.5933624 0,79.5 C0,123.406638 35.5933624,159 79.5,159 L79.5,159" id="lineTwo" stroke="#EE80D8"/>
                </g>
              </g>
            </svg>
          </button>
          <button onClick={onNext}>Next</button>
          <VolumeControl audioRef={audioRef} />
        </div>
      </div>

      <div className="spectrum-container">
        <div className="wave"></div>
        <div className="wave"></div>
        <div className="wave"></div>
      </div>

      {currentSong && (
        <audio
          ref={audioRef}
          src={`${API_URL}/api/songs/${currentSong.id}/stream`}
          onEnded={onNext}
          onTimeUpdate={handleTimeUpdate}
        />
      )}
    </div>
  );
};

export default Player;