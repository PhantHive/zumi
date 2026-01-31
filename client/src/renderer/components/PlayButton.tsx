import React from 'react';
import { Play, Pause, SkipBack, SkipForward, Loader2 } from 'lucide-react';
import '../styles/kawaiiPlayButton.scss';

interface KawaiiPlayButtonProps {
    isPlaying: boolean;
    isLoading?: boolean;
    onClick: () => void;
    onNext: () => void;
    onPrevious: () => void;
}

const KawaiiPlayButton: React.FC<KawaiiPlayButtonProps> = ({
    isPlaying,
    isLoading = false,
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
                className={`kawaii-play-button ${isPlaying ? 'kawaii-play-button--playing' : ''} ${isLoading ? 'kawaii-play-button--loading' : ''}`}
                onClick={onClick}
            >
                {isLoading ? (
                    <Loader2 className="loading-icon" />
                ) : (
                    <>
                        <Play className="play-icon" />
                        <Pause className="pause-icon" />
                    </>
                )}
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
