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
    const [songTitle, setSongTitle] = useState('');
    const [genre, setGenre] = useState<Genre>('K-Pop');
    const [visibility, setVisibility] = useState<'public' | 'private'>(
        'public',
    );
    const [year, setYear] = useState('');
    const [bpm, setBpm] = useState('');
    const [mood, setMood] = useState('');
    const [language, setLanguage] = useState('');
    const [tags, setTags] = useState('');
    const [lyrics, setLyrics] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
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
        formData.append('title', songTitle || audioFile.name.split('.')[0]);
        formData.append('artist', artistName || 'Unknown Artist');
        formData.append('album', albumName || 'Unknown Album');
        formData.append('genre', genre);
        formData.append('visibility', visibility);

        // Add optional metadata fields
        if (year) formData.append('year', year);
        if (bpm) formData.append('bpm', bpm);
        if (mood) formData.append('mood', mood);
        if (language) formData.append('language', language);
        if (tags) formData.append('tags', tags);
        if (lyrics) formData.append('lyrics', lyrics);

        if (thumbnailFile) {
            formData.append('thumbnail', thumbnailFile);
        }

        try {
            setIsUploading(true);
            await apiClient.post('/api/songs', formData);
            onSongUpload();

            // Reset all inputs
            if (audioInputRef.current) audioInputRef.current.value = '';
            if (thumbnailInputRef.current) thumbnailInputRef.current.value = '';
            setSongTitle('');
            setAlbumName('');
            setArtistName('');
            setYear('');
            setBpm('');
            setMood('');
            setLanguage('');
            setTags('');
            setLyrics('');
            setVisibility('public');
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

                    {/* Song Title */}
                    <input
                        type="text"
                        placeholder="Song Title (optional)"
                        value={songTitle}
                        onChange={(e) => setSongTitle(e.target.value)}
                        style={{ marginBottom: '10px' }}
                        disabled={isUploading}
                    />

                    {/* Album Name with suggestions */}
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

                    {/* Artist Name with suggestions */}
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

                    {/* Genre Select */}
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

                    {/* Visibility Select */}
                    <select
                        value={visibility}
                        onChange={(e) =>
                            setVisibility(
                                e.target.value as 'public' | 'private',
                            )
                        }
                        style={{ marginBottom: '10px' }}
                        disabled={isUploading}
                        className="visibility-select"
                    >
                        <option value="public">Public</option>
                        <option value="private">Private</option>
                    </select>

                    {/* Advanced Options Toggle */}
                    <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        style={{ marginBottom: '10px' }}
                        className="advanced-toggle"
                        disabled={isUploading}
                    >
                        {showAdvanced
                            ? '▼ Hide Advanced Options'
                            : '▶ Show Advanced Options'}
                    </button>

                    {/* Advanced Options */}
                    {showAdvanced && (
                        <div className="advanced-options">
                            <input
                                type="number"
                                placeholder="Year (e.g., 2023)"
                                value={year}
                                onChange={(e) => setYear(e.target.value)}
                                style={{ marginBottom: '10px' }}
                                disabled={isUploading}
                                min="1900"
                                max="2100"
                            />

                            <input
                                type="number"
                                placeholder="BPM (e.g., 120)"
                                value={bpm}
                                onChange={(e) => setBpm(e.target.value)}
                                style={{ marginBottom: '10px' }}
                                disabled={isUploading}
                                min="1"
                                max="300"
                            />

                            <input
                                type="text"
                                placeholder="Mood (e.g., energetic, chill)"
                                value={mood}
                                onChange={(e) => setMood(e.target.value)}
                                style={{ marginBottom: '10px' }}
                                disabled={isUploading}
                            />

                            <input
                                type="text"
                                placeholder="Language (e.g., en, ja, ko)"
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                style={{ marginBottom: '10px' }}
                                disabled={isUploading}
                                maxLength={10}
                            />

                            <input
                                type="text"
                                placeholder="Tags (comma-separated: pop, dance, upbeat)"
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                                style={{ marginBottom: '10px' }}
                                disabled={isUploading}
                            />

                            <textarea
                                placeholder="Lyrics (optional)"
                                value={lyrics}
                                onChange={(e) => setLyrics(e.target.value)}
                                style={{
                                    marginBottom: '10px',
                                    minHeight: '80px',
                                }}
                                disabled={isUploading}
                            />
                        </div>
                    )}

                    <button type="submit" disabled={isUploading}>
                        {isUploading ? 'Uploading...' : 'Upload'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Sidebar;
