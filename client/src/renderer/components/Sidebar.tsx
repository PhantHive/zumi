import React, { useRef, useState, useEffect } from 'react';
import { apiClient } from '../utils/apiClient';
import { GENRES } from '../../../../shared/types/common';
import '../styles/sidebar.css';
import BurgerButton from './BurgerButton';
import jsmediatags from 'jsmediatags';

interface SidebarProps {
    onSongUpload: () => void;
    currentView?: 'music' | 'settings';
    onNavigate?: (view: 'music' | 'settings') => void;
}

interface Suggestions {
    albums: string[];
    artists: string[];
}

interface UserProfile {
    name: string;
}

const Sidebar: React.FC<SidebarProps> = ({ onSongUpload, currentView = 'music', onNavigate }) => {
    const [isOpen, setIsOpen] = useState(false);
    const audioInputRef = useRef<HTMLInputElement>(null);
    const thumbnailInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const [albumName, setAlbumName] = useState('');
    const [artistName, setArtistName] = useState('');
    const [songTitle, setSongTitle] = useState('');
    const [genre, setGenre] = useState<string>('K-Pop');
    const [topGenres, setTopGenres] = useState<string[]>(Array.from(GENRES));
    const [visibility, setVisibility] = useState<'public' | 'private'>('public');
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
    const [extractedThumbnail, setExtractedThumbnail] = useState<File | null>(null);

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

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const res = await apiClient.get<{ data: { genre: string; count: number }[] }>('/api/songs/genres');
                if (!mounted) return;
                const list = (res.data || []).map((g) => g.genre).filter(Boolean);
                if (list.length) setTopGenres(list);
            } catch (err) {
                console.debug('Failed to load top genres:', err);
            }
        })();
        return () => { mounted = false; };
    }, []);

    const handleAudioFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        jsmediatags.read(file, {
            onSuccess: (tag) => {
                const { tags } = tag;

                if (tags.title && !songTitle) {
                    setSongTitle(tags.title);
                }
                if (tags.artist && !artistName) {
                    setArtistName(tags.artist);
                }
                if (tags.album && !albumName) {
                    setAlbumName(tags.album);
                }
                if (tags.year && !year) {
                    setYear(tags.year.toString());
                }
                if (tags.genre && !genre) {
                    const fileGenre = tags.genre;
                    const matchedGenre = Array.from(GENRES).find(
                        (g) => g.toLowerCase() === String(fileGenre).toLowerCase(),
                    );
                    setGenre(matchedGenre || String(fileGenre));
                }
                if (tags.lyrics && !lyrics) {
                    const lyricsText =
                        typeof tags.lyrics === 'string'
                            ? tags.lyrics
                            : tags.lyrics.lyrics;
                    setLyrics(String(lyricsText));
                }

                if (tags.picture) {
                    const picture = tags.picture;
                    const { data, format } = picture;
                    const byteArray = new Uint8Array(data);
                    const blob = new Blob([byteArray], { type: format });
                    const imageFile = new File([blob], 'cover.jpg', { type: format });
                    setExtractedThumbnail(imageFile);

                    if (!thumbnailInputRef.current?.files?.[0]) {
                        const dataTransfer = new DataTransfer();
                        dataTransfer.items.add(imageFile);
                        if (thumbnailInputRef.current) {
                            thumbnailInputRef.current.files = dataTransfer.files;
                        }
                    }
                }
            },
            onError: (error) => {
                console.error('Error reading audio metadata:', error);
                if (!songTitle) {
                    setSongTitle(file.name.replace(/\.[^/.]+$/, ''));
                }
            },
        });
    };

    const handleUpload = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const audioFile = audioInputRef.current?.files?.[0];
        const thumbnailFile = thumbnailInputRef.current?.files?.[0] || extractedThumbnail;
        const videoFile = videoInputRef.current?.files?.[0];

        if (!audioFile) return;

        const formData = new FormData();
        formData.append('audio', audioFile);
        formData.append('title', songTitle || audioFile.name.split('.')[0]);
        formData.append('artist', artistName || 'Unknown Artist');
        formData.append('album', albumName || 'Unknown Album');
        formData.append('genre', genre);
        formData.append('visibility', visibility);

        if (year) formData.append('year', year);
        if (bpm) formData.append('bpm', bpm);
        if (mood) formData.append('mood', mood);
        if (language) formData.append('language', language);
        if (tags) formData.append('tags', tags);
        if (lyrics) formData.append('lyrics', lyrics);

        if (thumbnailFile) {
            formData.append('thumbnail', thumbnailFile);
        }

        if (videoFile) {
            formData.append('video', videoFile);
        }

        try {
            setIsUploading(true);
            await apiClient.post('/api/songs', formData);
            onSongUpload();

            // Reset all inputs
            if (audioInputRef.current) audioInputRef.current.value = '';
            if (thumbnailInputRef.current) thumbnailInputRef.current.value = '';
            if (videoInputRef.current) videoInputRef.current.value = '';
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
            setExtractedThumbnail(null);
            setShowAdvanced(false);
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
        <div className={`sidebar-container ${isOpen ? 'open' : ''}`}>
            <BurgerButton isOpen={isOpen} onClick={() => setIsOpen(!isOpen)} />

            <div className={`sidebar ${isOpen ? 'open' : ''}`}>
                <div className="sidebar-header">
                    <h2>Hey, {userName}!</h2>
                    <button
                        className="sidebar-close-button"
                        onClick={() => setIsOpen(false)}
                        type="button"
                        aria-label="Close sidebar"
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="sidebar-navigation">
                    <button
                        className={`nav-button ${currentView === 'music' ? 'active' : ''}`}
                        onClick={() => onNavigate?.('music')}
                    >
                        <span className="nav-icon">🎵</span>
                        <span>Music</span>
                    </button>

                    <button
                        className={`nav-button ${currentView === 'settings' ? 'active' : ''}`}
                        onClick={() => onNavigate?.('settings')}
                    >
                        <span className="nav-icon">⚙️</span>
                        <span>Settings</span>
                    </button>
                </div>

                <form onSubmit={handleUpload} className="upload-section">
                    <div className="form-group">
                        <input
                            ref={audioInputRef}
                            type="file"
                            id="file-upload-audio"
                            accept="audio/*"
                            disabled={isUploading}
                            onChange={handleAudioFileChange}
                        />
                        <input
                            ref={thumbnailInputRef}
                            id="file-upload-thumbnail"
                            type="file"
                            accept="image/*"
                            disabled={isUploading}
                        />
                        <input
                            ref={videoInputRef}
                            id="file-upload-video"
                            type="file"
                            accept="video/*"
                            disabled={isUploading}
                        />
                        <label htmlFor="file-upload-audio">
                            {audioInputRef.current?.files?.[0]?.name || 'Choose Audio File'}
                        </label>
                        <label htmlFor="file-upload-thumbnail">
                            {thumbnailInputRef.current?.files?.[0]?.name ||
                                (extractedThumbnail ? 'Cover Art (Auto-detected)' : 'Choose Cover Art')}
                        </label>
                        <label htmlFor="file-upload-video">
                            {videoInputRef.current?.files?.[0]?.name || 'Choose Video (Optional)'}
                        </label>
                    </div>

                    <div className="section-header">
                        <h3>Track Information</h3>
                    </div>

                    <div className="form-group">
                        <input
                            type="text"
                            placeholder="Track Title"
                            value={songTitle}
                            onChange={(e) => setSongTitle(e.target.value)}
                            disabled={isUploading}
                        />

                        <div className="input-container" onClick={(e) => e.stopPropagation()}>
                            <input
                                type="text"
                                placeholder="Artist Name"
                                value={artistName}
                                onChange={(e) => setArtistName(e.target.value)}
                                onFocus={() => setShowArtistSuggestions(true)}
                                disabled={isUploading}
                            />
                            {showArtistSuggestions && suggestions.artists.length > 0 && (
                                <div className="suggestions">
                                    {suggestions.artists
                                        .filter((artist) =>
                                            artist.toLowerCase().includes(artistName.toLowerCase()),
                                        )
                                        .map((artist) => (
                                            <div
                                                key={artist}
                                                onClick={() => {
                                                    setArtistName(artist);
                                                    setShowArtistSuggestions(false);
                                                }}
                                                className="suggestion-item"
                                            >
                                                {artist}
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>

                        <div className="input-container" onClick={(e) => e.stopPropagation()}>
                            <input
                                type="text"
                                placeholder="Album Name"
                                value={albumName}
                                onChange={(e) => setAlbumName(e.target.value)}
                                onFocus={() => setShowAlbumSuggestions(true)}
                                disabled={isUploading}
                            />
                            {showAlbumSuggestions && suggestions.albums.length > 0 && (
                                <div className="suggestions">
                                    {suggestions.albums
                                        .filter((album) =>
                                            album.toLowerCase().includes(albumName.toLowerCase()),
                                        )
                                        .map((album) => (
                                            <div
                                                key={album}
                                                onClick={() => {
                                                    setAlbumName(album);
                                                    setShowAlbumSuggestions(false);
                                                }}
                                                className="suggestion-item"
                                            >
                                                {album}
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>

                        <input
                            list="genre-suggestions"
                            value={genre}
                            onChange={(e) => setGenre(e.target.value)}
                            placeholder="Genre"
                            disabled={isUploading}
                            className="genre-input"
                        />
                        <datalist id="genre-suggestions">
                            {(topGenres.length ? topGenres : Array.from(GENRES)).map((g) => (
                                <option key={g} value={g} />
                            ))}
                        </datalist>

                        <div className="visibility-container">
                            <label className="visibility-label">
                                <span className="visibility-icon-text">
                                    <span>{visibility === 'public' ? '🌍' : '🔒'}</span>
                                    <span>{visibility === 'public' ? 'Public' : 'Private'}</span>
                                </span>
                                <select
                                    value={visibility}
                                    onChange={(e) => setVisibility(e.target.value as 'public' | 'private')}
                                    disabled={isUploading}
                                    className="visibility-select"
                                >
                                    <option value="public">Public</option>
                                    <option value="private">Private</option>
                                </select>
                            </label>
                            <p className="visibility-description">
                                {visibility === 'public' ? 'Visible to all users' : 'Only visible to you'}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className={`advanced-toggle ${showAdvanced ? 'open' : ''}`}
                        disabled={isUploading}
                    >
                        Additional Metadata
                    </button>

                    {showAdvanced && (
                        <div className="advanced-options">
                            <div className="section-header">
                                <h3>Extended Details</h3>
                            </div>

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <input
                                    type="number"
                                    placeholder="Year"
                                    value={year}
                                    onChange={(e) => setYear(e.target.value)}
                                    disabled={isUploading}
                                    min="1900"
                                    max="2100"
                                />

                                <input
                                    type="number"
                                    placeholder="BPM"
                                    value={bpm}
                                    onChange={(e) => setBpm(e.target.value)}
                                    disabled={isUploading}
                                    min="1"
                                    max="300"
                                />
                            </div>

                            <input
                                type="text"
                                placeholder="Mood"
                                value={mood}
                                onChange={(e) => setMood(e.target.value)}
                                disabled={isUploading}
                            />

                            <input
                                type="text"
                                placeholder="Language"
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                disabled={isUploading}
                                maxLength={10}
                            />

                            <input
                                type="text"
                                placeholder="Tags (comma-separated)"
                                value={tags}
                                onChange={(e) => setTags(e.target.value)}
                                disabled={isUploading}
                            />

                            <textarea
                                placeholder="Lyrics"
                                value={lyrics}
                                onChange={(e) => setLyrics(e.target.value)}
                                disabled={isUploading}
                            />
                        </div>
                    )}

                    <button type="submit" disabled={isUploading}>
                        {isUploading ? 'Uploading' : 'Upload Track'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Sidebar;