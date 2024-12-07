import React, { useState, useEffect } from 'react';
import { Song, Album } from '../../../shared/types/common';
import Player from './components/Player';
import Sidebar from './components/Sidebar';
import AlbumView from './components/Album';
import './styles/global.css';
import TitleBar from "./components/TitleBar";
import {API_URL} from "../config";

const App: React.FC = () => {
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);

  useEffect(() => {
    fetchSongs();
  }, []);

  const fetchSongs = async () => {
    try {
      const response = await fetch(`${API_URL}/api/songs`);
      const data = await response.json();
      const songs: Song[] = data.data || [];

      // Group songs by albumId
      const albumMap: { [key: string]: Album } = {};
      songs.forEach(song => {
        if (!albumMap[song.albumId]) {
          albumMap[song.albumId] = {
            id: song.albumId,
            name: song.albumId, // Assuming album name is the same as albumId
            songs: []
          };
        }
        albumMap[song.albumId].songs.push(song);
      });

      setAlbums(Object.values(albumMap));
    } catch (error) {
      console.error('Failed to fetch songs:', error);
    }
  };

  const handleSongSelect = (song: Song) => {
    setCurrentSong(song);
  };

  return (
    <>
      <TitleBar />
      <div className="app-container">
        <Sidebar onSongUpload={fetchSongs} />
        <div className="main-content">
          {albums.map(album => (
            <AlbumView
              key={album.id}
              album={album}
              currentSong={currentSong}
              onSongSelect={handleSongSelect}
            />
          ))}
        </div>
        <Player
          currentSong={currentSong}
          onNext={() => {
            const currentAlbum = albums.find(album => album.songs.some(s => s.id === currentSong?.id));
            if (currentAlbum) {
              const currentIndex = currentAlbum.songs.findIndex(s => s.id === currentSong?.id);
              const nextSong = currentAlbum.songs[(currentIndex + 1) % currentAlbum.songs.length];
              setCurrentSong(nextSong);
            }
          }}
          onPrevious={() => {
            const currentAlbum = albums.find(album => album.songs.some(s => s.id === currentSong?.id));
            if (currentAlbum) {
              const currentIndex = currentAlbum.songs.findIndex(s => s.id === currentSong?.id);
              const prevSong = currentAlbum.songs[(currentIndex - 1 + currentAlbum.songs.length) % currentAlbum.songs.length];
              setCurrentSong(prevSong);
            }
          }}
        />
      </div>
    </>
  );
};

export default App;