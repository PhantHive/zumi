import React, { useState, useEffect } from 'react';
import { ipcRenderer } from 'electron';
import '../styles/titlebar.css';
import { API_URL } from "../../config";

const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const checkMaximized = async () => {
      const maximized = await ipcRenderer.invoke('window-is-maximized');
      setIsMaximized(maximized);
    };

    checkMaximized();
    window.addEventListener('resize', checkMaximized);

    return () => {
      window.removeEventListener('resize', checkMaximized);
    };
  }, []);

  const handleMinimize = () => {
    ipcRenderer.send('window-minimize');
  };

  const handleMaximize = () => {
    ipcRenderer.send('window-maximize');
    setIsMaximized(!isMaximized);
  };

  const handleClose = () => {
    ipcRenderer.send('window-close');
  };

  return (
    <div className="titlebar">
      <div className="titlebar-left">
        <img
          src={`${API_URL}/images/mascot.png`}
          alt="Waifu Mascot"
          className="titlebar-mascot"
        />
        <span className="titlebar-text">ZUMI</span>
      </div>
      <div className="titlebar-buttons">
        <button className="min-btn" onClick={handleMinimize}>–</button>
        <button className="max-btn" onClick={handleMaximize}>
          {isMaximized ? '❐' : '□'}
        </button>
        <button className="close-btn" onClick={handleClose}>×</button>
      </div>
    </div>
  );
};

export default TitleBar;