import React, { useState, useRef } from 'react';
import { Song } from '../../../../shared/types/common';

interface PlayerProps {
  currentSong: Song | null;
  onNext: () => void;
  onPrevious: () => void;
}

const Player: React.FC<PlayerProps> = ({ currentSong, onNext, onPrevious }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
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

  return (
    <div className="player-container">
      <div className="player-controls">
        <button onClick={onPrevious}>Previous</button>
        <button onClick={togglePlay} className="toggle-play-pause">
          <svg id="play" viewBox="0 0 163 163" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlnsXlink="http://www.w3.org/1999/xlink">
            <g fill="none">
              <g transform="translate(2.000000, 2.000000)" strokeWidth="4">
                <path d="M10,80 C10,118.107648 40.8923523,149 79,149 L79,149 C117.107648,149 148,118.107648 148,80 C148,41.8923523 117.107648,11 79,11" id="lineOne" stroke="#EE80D8"></path>
                <path d="M105.9,74.4158594 L67.2,44.2158594 C63.5,41.3158594 58,43.9158594 58,48.7158594 L58,109.015859 C58,113.715859 63.4,116.415859 67.2,113.515859 L105.9,83.3158594 C108.8,81.1158594 108.8,76.6158594 105.9,74.4158594 L105.9,74.4158594 Z" id="triangle" stroke="#EE80D8"></path>
                <path d="M159,79.5 C159,35.5933624 123.406638,0 79.5,0 C35.5933624,0 0,35.5933624 0,79.5 C0,123.406638 35.5933624,159 79.5,159 L79.5,159" id="lineTwo" stroke="#EE80D8"></path>
              </g>
            </g>
          </svg>
        </button>
        <button onClick={onNext}>Next</button>
      </div>
      {currentSong && (
        <audio
          ref={audioRef}
          src={`http://localhost:3000/api/songs/${currentSong.id}/stream`}
          onEnded={onNext}
        />
      )}
    </div>
  );
};

export default Player;