import React, { useRef, useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';
import { GENRES, Genre } from '../../../../shared/types/common';
import '../styles/sidebar.css';
import BurgerButton from './BurgerButton';

interface SidebarProps {
    onSongUpload: () => void;
}

interface Suggestions {
    albums: string[];
    artists: string[];
}

interface UserProfile {
    name: string;
}

const Sidebar: React.FC<SidebarProps> = ({ onSongUpload }) => {
    const [isOpen, setIsOpen] = useState(false);
    const audioInputRef = useRef<HTMLInputElement>(null);
    const thumbnailInputRef = useRef<HTMLInputElement>(null);
    const [albumName, setAlbumName] = useState('');
    const [artistName, setArtistName] = useState('');
    const [genre, setGenre] = useState<Genre>('K-Pop');
    const [isUploading, setIsUploading] = useState(false);
    const [suggestions, setSuggestions] = useState<Suggestions>({
        albums: [],
        artists: [],
    });
    const [showAlbumSuggestions, setShowAlbumSuggestions] = useState(false);
    const [showArtistSuggestions, setShowArtistSuggestions] = useState(false);
    const [userName, setUserName] = useState('');

    useEffect(() => {
        const fetchSuggestions = async () => {
            try {
                const [albumsRes, artistsRes] = await Promise.all([
                    apiClient.get<{ data: string[] }>('/api/songs/albums'),
                    apiClient.get<{ data: string[] }>('/api/songs/artists'),
                ]);
                setSuggestions({
                    albums: albumsRes.data,
                    artists: artistsRes.data,
                });
            } catch (error) {
                console.error('Failed to fetch suggestions:', error);
            }
        };

        fetchSuggestions();
    }, []);

    const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const audioFile = audioInputRef.current?.files?.[0];
        const thumbnailFile = thumbnailInputRef.current?.files?.[0];

        if (!audioFile) return;

        const formData = new FormData();
        formData.append('audio', audioFile);
        formData.append('title', audioFile.name.split('.')[0]);
        formData.append('artist', artistName || 'Unknown Artist');
        formData.append('album', albumName || 'Unknown Album');
        formData.append('genre', genre);

        if (thumbnailFile) {
            formData.append('thumbnail', thumbnailFile);
        }

        try {
            setIsUploading(true);
            await apiClient.post('/api/songs', formData);
            onSongUpload();

            // Reset inputs
            if (audioInputRef.current) audioInputRef.current.value = '';
            if (thumbnailInputRef.current) thumbnailInputRef.current.value = '';
            setAlbumName('');
            setArtistName('');
        } catch (error) {
            console.error('Upload error:', error);
        } finally {
            setIsUploading(false);
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (
                !target.closest('.sidebar') &&
                !target.closest('.burger-button')
            ) {
                setShowAlbumSuggestions(false);
                setShowArtistSuggestions(false);
                setIsOpen(false);
            }
        };

        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    useEffect(() => {
        const fetchUserInfo = async () => {
            try {
                const response = await apiClient.get<{ data: UserProfile }>(
                    '/api/auth/profile',
                );
                if (response) {
                    const { data } = response;
                    if (data.name) {
                        setUserName(data.name);
                    }
                }
            } catch (error) {
                console.error('Failed to fetch user info:', error);
            }
        };

        fetchUserInfo();
    }, []);

    useEffect(() => {
        // Add or remove the sidebar-open class from main-content
        const mainContent = document.querySelector('.main-content');
        if (mainContent) {
            if (isOpen) {
                mainContent.classList.add('sidebar-open');
            } else {
                mainContent.classList.remove('sidebar-open');
            }
        }
    }, [isOpen]);

    return (
        <div className="sidebar-container">
            <BurgerButton isOpen={isOpen} onClick={() => setIsOpen(!isOpen)} />

            <div className={`sidebar ${isOpen ? 'open' : ''}`}>
                <h2>Konichiwa, {userName}!</h2>
                <form onSubmit={handleUpload} className="upload-section">
                    <input
                        ref={audioInputRef}
                        type="file"
                        id="file-upload-audio"
                        accept="audio/*"
                        style={{ marginBottom: '10px' }}
                        disabled={isUploading}
                    />
                    <input
                        ref={thumbnailInputRef}
                        id="file-upload-thumbnail"
                        type="file"
                        accept="image/*"
                        style={{ marginBottom: '10px' }}
                        disabled={isUploading}
                    />
                    <label htmlFor="file-upload-audio">Choose audio file</label>
                    <label htmlFor="file-upload-thumbnail">
                        Choose thumbnail
                    </label>

                    <div
                        className="input-container"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <input
                            type="text"
                            placeholder="Album Name"
                            value={albumName}
                            onChange={(e) => setAlbumName(e.target.value)}
                            onFocus={() => setShowAlbumSuggestions(true)}
                            style={{ marginBottom: '10px' }}
                            disabled={isUploading}
                        />
                        {showAlbumSuggestions &&
                            suggestions.albums.length > 0 && (
                                <div className="suggestions">
                                    {suggestions.albums
                                        .filter((album) =>
                                            album
                                                .toLowerCase()
                                                .includes(
                                                    albumName.toLowerCase(),
                                                ),
                                        )
                                        .map((album) => (
                                            <div
                                                key={album}
                                                onClick={() => {
                                                    setAlbumName(album);
                                                    setShowAlbumSuggestions(
                                                        false,
                                                    );
                                                }}
                                                className="suggestion-item"
                                            >
                                                {album}
                                            </div>
                                        ))}
                                </div>
                            )}
                    </div>

                    <div
                        className="input-container"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <input
                            type="text"
                            placeholder="Artist Name"
                            value={artistName}
                            onChange={(e) => setArtistName(e.target.value)}
                            onFocus={() => setShowArtistSuggestions(true)}
                            style={{ marginBottom: '10px' }}
                            disabled={isUploading}
                        />
                        {showArtistSuggestions &&
                            suggestions.artists.length > 0 && (
                                <div className="suggestions">
                                    {suggestions.artists
                                        .filter((artist) =>
                                            artist
                                                .toLowerCase()
                                                .includes(
                                                    artistName.toLowerCase(),
                                                ),
                                        )
                                        .map((artist) => (
                                            <div
                                                key={artist}
                                                onClick={() => {
                                                    setArtistName(artist);
                                                    setShowArtistSuggestions(
                                                        false,
                                                    );
                                                }}
                                                className="suggestion-item"
                                            >
                                                {artist}
                                            </div>
                                        ))}
                                </div>
                            )}
                    </div>

                    <select
                        value={genre}
                        onChange={(e) => setGenre(e.target.value as Genre)}
                        style={{ marginBottom: '10px' }}
                        disabled={isUploading}
                        className="genre-select"
                    >
                        {GENRES.map((g) => (
                            <option key={g} value={g}>
                                {g}
                            </option>
                        ))}
                    </select>

                    <button type="submit" disabled={isUploading}>
                        {isUploading ? 'Uploading...' : 'Upload'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Sidebar;
