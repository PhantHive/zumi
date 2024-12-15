import React, { useState, useRef, useEffect } from 'react';
import { Song } from '../../../../shared/types/common';
import '../styles/player.css';
import VolumeControl from "./VolumeControl";
import { ipcRenderer } from "electron";
import { apiClient } from '../utils/apiClient';

interface PlayerProps {
  currentSong: Song | null;
  onNext: () => void;
  onPrevious: () => void;
}

const Player: React.FC<PlayerProps> = ({ currentSong, onNext, onPrevious }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [streamUrl, setStreamUrl] = useState<string>('');
  const [streamHeaders, setStreamHeaders] = useState<Record<string, string>>({});
  const [thumbnailUrl, setThumbnailUrl] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement>(null);

const extractColors = async (url: string) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;

  return new Promise((resolve) => {
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        const sampleColors = (x: number, y: number) => {
          const data = ctx.getImageData(x, y, 1, 1).data;
          return { r: data[0], g: data[1], b: data[2], a: data[3] };
        };

        const isBright = (color: { r: number, g: number, b: number, a: number }) => {
          if (color.a === 0) return false; // Skip fully transparent pixels
          const brightness = (color.r * 299 + color.g * 587 + color.b * 114) / 1000;
          return brightness > 100; // Adjust threshold as needed
        };

        const colors = [
          sampleColors(0, 0),
          sampleColors(img.width - 1, 0),
          sampleColors(0, img.height - 1),
          sampleColors(img.width - 1, img.height - 1),
          sampleColors(Math.floor(img.width / 2), Math.floor(img.height / 2))
        ];

        const brightColors = colors.filter(isBright);
        const chosenColors = brightColors.length > 0 ? brightColors : colors.filter(color => color.a !== 0);

        const brightenColor = (color: { r: number, g: number, b: number, a: number }) => {
          const factor = 1.5; // Increase brightness by 50%
          return `rgba(${Math.min(color.r * factor, 255)}, ${Math.min(color.g * factor, 255)}, ${Math.min(color.b * factor, 255)}, 0.8)`;
        };

        if (chosenColors.length >= 2) {
          resolve({
            color1: brightenColor(chosenColors[0]),
            color2: brightenColor(chosenColors[1])
          });
        } else {
          resolve({
            color1: 'rgba(255, 255, 255, 0.8)', // Default to white if no valid colors found
            color2: 'rgba(255, 255, 255, 0.8)'
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
          const streamData = await apiClient.getStream(`/api/songs/${currentSong.id}/stream`);
          setStreamUrl(streamData.url);
          cleanup = streamData.cleanup;

          if (currentSong.thumbnailUrl) {
            const thumbnailData = await apiClient.getStream(`/api/songs/thumbnails/${currentSong.thumbnailUrl}`);
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
        thumbnailUrl: currentSong.thumbnailUrl
      });
    } else {
      ipcRenderer.send('clear-presence');
    }
  }, [currentSong, isPlaying]);

useEffect(() => {
  const playNewSong = async () => {
    if (currentSong && audioRef.current) {
      setIsPlaying(true);
      try {
        // Pause the audio and wait for it to complete
        await audioRef.current.pause();
        audioRef.current.currentTime = 0;

        const streamData = await apiClient.getStream(`/api/songs/${currentSong.id}/stream`);
        setStreamUrl(streamData.url);

        // Ensure the audio element's src is updated before calling play()
        audioRef.current.src = streamData.url;

        // Ensure pause() has completed before calling play()
        await new Promise((resolve) => setTimeout(resolve, 100));

        const isPlaying = audioRef.current.currentTime > 0 && !audioRef.current.paused && !audioRef.current.ended && audioRef.current.readyState > audioRef.current.HAVE_CURRENT_DATA;
        if (!isPlaying) {
          const playPromise = audioRef.current.play();
          if (playPromise !== undefined) {
            playPromise.catch((error) => {
              console.error('Playback failed:', error);
              setIsPlaying(false);
            });
          }
        }

        document.querySelector('.toggle-play-pause')?.classList.add('play');
        document.querySelector('#play')?.classList.add('animate');
      } catch (error) {
        console.error('Error starting playback:', error);
        setIsPlaying(false);
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
      extractColors(thumbnailUrl).then((colors: any) => {
        document.documentElement.style.setProperty('--thumbnail-color-1', colors.color1);
        document.documentElement.style.setProperty('--thumbnail-color-2', colors.color2);
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
        document.querySelector('.toggle-play-pause')?.classList.remove('play');
        document.querySelector('#play')?.classList.remove('animate');
        setIsPlaying(false);
      } else {
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          await playPromise;
          document.querySelector('.toggle-play-pause')?.classList.add('play');
          document.querySelector('#play')?.classList.add('animate');
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

  const handleCoverClick = async () => {
  if (audioRef.current) {
    try {
      const streamData = await apiClient.getStream(`/api/songs/${currentSong?.id}/stream`);
      setStreamUrl(streamData.url);

      // Ensure the audio element's src is updated before calling play()
      audioRef.current.src = streamData.url;

      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        await playPromise;
        setIsPlaying(true);
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
            <div className="progress-current" style={{ width: `${progress}%` }} />
          </div>
          <div className="time-display">
            {formatTime(currentTime)} / {formatTime(audioRef.current?.duration || 0)}
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