import React from 'react';
import { Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import '../styles/kawaiiPlayButton.scss';

interface KawaiiPlayButtonProps {
    isPlaying: boolean;
    onClick: () => void;
    onNext: () => void;
    onPrevious: () => void;
}

const KawaiiPlayButton: React.FC<KawaiiPlayButtonProps> = ({
    isPlaying,
    onClick,
    onNext,
    onPrevious,
}) => {
    return (
        <div className="playback-controls">
            <button
                className="control-button previous-button"
                onClick={onPrevious}
                aria-label="Previous track"
            >
                <SkipBack className="control-icon" />
                <div className="ambient-glow" />
            </button>

            <div
                className={`kawaii-play-button ${isPlaying ? 'kawaii-play-button--playing' : ''}`}
                onClick={onClick}
            >
                <Play className="play-icon" />
                <Pause className="pause-icon" />
                <div className="ambient-glow" />
            </div>

            <button
                className="control-button next-button"
                onClick={onNext}
                aria-label="Next track"
            >
                <SkipForward className="control-icon" />
                <div className="ambient-glow" />
            </button>
        </div>
    );
};

export default KawaiiPlayButton;
