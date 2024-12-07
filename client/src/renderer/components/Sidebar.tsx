import React, { useRef, useState } from 'react';
import {API_URL} from "../../config";

interface SidebarProps {
  onSongUpload: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onSongUpload }) => {
  const audioInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const [albumName, setAlbumName] = useState('');
  const [artistName, setArtistName] = useState('');

  const handleUpload = async () => {
    const audioFile = audioInputRef.current?.files?.[0];
    const thumbnailFile = thumbnailInputRef.current?.files?.[0];

    if (!audioFile) return;

    const formData = new FormData();
    formData.append('audio', audioFile);
    formData.append('title', audioFile.name.split('.')[0]);
    formData.append('artist', artistName || 'Unknown Artist');
    formData.append('album', albumName || 'Unknown Album');

    if (thumbnailFile) {
      formData.append('thumbnail', thumbnailFile);
    }

    try {
      const response = await fetch(`${API_URL}/api/songs`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        console.error('Upload failed:', await response.text());
        return;
      }

      onSongUpload();

      // Reset inputs
      if (audioInputRef.current) audioInputRef.current.value = '';
      if (thumbnailInputRef.current) thumbnailInputRef.current.value = '';
      setAlbumName('');
      setArtistName('');
    } catch (error) {
      console.error('Upload error:', error);
    }
  };

  return (
    <div className="sidebar">
      <h2>Waifu Music</h2>
      <div className="upload-section">
        <input
          ref={audioInputRef}
          type="file"
          id="file-upload-audio"
          accept="audio/*"
          style={{ marginBottom: '10px' }}
        />
        <input
          ref={thumbnailInputRef}
          id="file-upload-thumbnail"
          type="file"
          accept="image/*"
          style={{ marginBottom: '10px' }}
        />
        <label htmlFor="file-upload-audio">Choose audio file</label>
        <label htmlFor="file-upload-thumbnail">Choose thumbnail</label>
        <input
          type="text"
          placeholder="Album Name"
          value={albumName}
          onChange={(e) => setAlbumName(e.target.value)}
          style={{ marginBottom: '10px' }}
        />
        <input
          type="text"
          placeholder="Artist Name"
          value={artistName}
          onChange={(e) => setArtistName(e.target.value)}
          style={{ marginBottom: '10px' }}
        />
        <button onClick={handleUpload}>Upload</button>
      </div>
    </div>
  );
};

export default Sidebar;