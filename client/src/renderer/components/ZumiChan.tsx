// client/src/renderer/components/ZumiChan.tsx
import React, { useState } from 'react';
import '../styles/zumiChan.css';
import { getAssetPath } from '../utils/assetPath';
import { Album, Song } from '../../../../shared/types/common';

interface ZumiChanProps {
    onContinue: () => void;
    albums: Album[];
    setCurrentSong: (song: Song) => void;
}

const ZumiChan: React.FC<ZumiChanProps> = ({
    onContinue,
    albums,
    setCurrentSong,
}) => {
    const [isOpen, setIsOpen] = useState(true); // Set initial state to true

    const playRandomSong = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (albums.length === 0) return;

        const randomAlbum = albums[Math.floor(Math.random() * albums.length)];
        const randomSong =
            randomAlbum.songs[
                Math.floor(Math.random() * randomAlbum.songs.length)
            ];
        setCurrentSong(randomSong);
        togglePannel();
    };

    const onKonichiwaZumi = (event: React.MouseEvent<HTMLButtonElement>) => {
        event.stopPropagation();
        if (!isOpen) {
            togglePannel();
        }

        const randomHi = Math.floor(Math.random() * 3) + 1;
        const videoPath = `images/zumi-interactions/zumi-hi-${randomHi}.mp4`;
        // change the video source to the random hi video
        const video = document.querySelector(
            '.zumi-chan-video',
        ) as HTMLVideoElement;
        video.src = getAssetPath(videoPath);
        video.loop = false;

        // also play the mp3: voices/zumi-hi.mp3
        const audio = new Audio(getAssetPath('voices/zumi-hi.mp3'));
        const hiZumiVoice = audio.play();
        const hiVideo = video.play();

        hiZumiVoice.then(() => {
            hiVideo.then(() => {
                // hide the video after it finishes playing
                video.onended = () => {
                    video.src = getAssetPath(
                        'images/zumi-interactions/zumi-wave.mp4',
                    );
                    video.loop = true;
                    togglePannel();
                    onContinue();
                };
            });
        });
    };

    const togglePannel = () => {
        setIsOpen(!isOpen);
    };

    return (
        <div
            className={`zumi-chan-container ${isOpen ? 'open' : ''}`}
            onClick={togglePannel}
        >
            <video className="zumi-chan-video" autoPlay muted loop>
                <source
                    src={getAssetPath('images/zumi-interactions/zumi-wave.mp4')}
                    type="video/mp4"
                />
                Your browser does not support the video tag.
            </video>
            <button className="zumi-chan-button" onClick={onKonichiwaZumi}>
                Hi Zumi!
            </button>
            <button
                className="zumi-chan-button zumi-chan-choose-random"
                onClick={playRandomSong}
            >
                Choose a song for me
            </button>
        </div>
    );
};

export default ZumiChan;
