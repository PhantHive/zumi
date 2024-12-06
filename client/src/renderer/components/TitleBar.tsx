import React from 'react';
import { getCurrentWindow } from '@electron/remote';
import '../styles/titlebar.css';

const TitleBar: React.FC = () => {
  const win = getCurrentWindow();

  return (
    <div className="titlebar">
      <div className="titlebar-left">
        <img src="http://localhost:3000/images/mascot.png" alt="Waifu Mascot" className="titlebar-mascot" />
        <span className="titlebar-text">ZUMI</span>
      </div>
      <div className="titlebar-buttons">
        <button className="min-btn" onClick={() => win.minimize()}>–</button>
        <button className="max-btn" onClick={() => win.isMaximized() ? win.unmaximize() : win.maximize()}>□</button>
        <button className="close-btn" onClick={() => win.close()}>×</button>
      </div>
    </div>
  );
};

export default TitleBar;