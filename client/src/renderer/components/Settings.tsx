// client/src/renderer/components/Settings.tsx
import React, { useState, useEffect } from 'react';
import { ipcRenderer } from 'electron';
import PinLock from './PinLock';
import '../styles/settings.css';

const Settings: React.FC = () => {
    const [isPinEnabled, setIsPinEnabled] = useState(false);
    const [isSettingPin, setIsSettingPin] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        checkPinStatus();
    }, []);

    const checkPinStatus = async () => {
        try {
            const response = await ipcRenderer.invoke('pin:has-pin');
            setIsPinEnabled(response?.hasPinSet || false);
        } catch (error) {
            console.error('Error checking PIN status:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handlePinToggle = async () => {
        if (isPinEnabled) {
            // Disable PIN - delete it
            if (confirm('Are you sure you want to remove PIN protection?')) {
                try {
                    await ipcRenderer.invoke('pin:delete');
                    setIsPinEnabled(false);
                    showSuccessMessage('PIN protection disabled');
                } catch (error) {
                    console.error('Error deleting PIN:', error);
                    alert('Failed to disable PIN protection');
                }
            }
        } else {
            // Enable PIN - show creation screen
            setIsSettingPin(true);
        }
    };

    const handleSetPin = async (pinHash: string) => {
        try {
            const result = await ipcRenderer.invoke('pin:set', pinHash);
            if (result.success) {
                setIsPinEnabled(true);
                setIsSettingPin(false);
                showSuccessMessage('PIN protection enabled');
            } else {
                throw new Error('Failed to set PIN');
            }
        } catch (error) {
            console.error('Error setting PIN:', error);
            alert('Failed to enable PIN protection');
            throw error;
        }
    };

    const showSuccessMessage = (message: string) => {
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
    };

    if (isSettingPin) {
        return (
            <PinLock
                onUnlock={() => {
                    // Not used in create mode, but required by component
                }}
                onSetPin={handleSetPin}
                isSettingPin={true}
                title="Create Your PIN"
            />
        );
    }

    return (
        <div className="settings-container">
            <div className="settings-header">
                <h1>Settings</h1>
            </div>

            <div className="settings-content">
                <div className="settings-section">
                    <h2>Security</h2>

                    <div className="setting-item">
                        <div className="setting-info">
                            <h3>PIN Lock</h3>
                            <p>Require a PIN to unlock the app on startup</p>
                        </div>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={isPinEnabled}
                                onChange={handlePinToggle}
                                disabled={isLoading}
                            />
                            <span className="toggle-slider"></span>
                        </label>
                    </div>

                    {isPinEnabled && (
                        <div className="setting-item">
                            <div className="setting-info">
                                <h3>Change PIN</h3>
                                <p>Update your current PIN</p>
                            </div>
                            <button
                                className="settings-button"
                                onClick={() => setIsSettingPin(true)}
                            >
                                Change
                            </button>
                        </div>
                    )}
                </div>

                {showSuccess && (
                    <div className="success-message">
                        Settings saved successfully!
                    </div>
                )}
            </div>
        </div>
    );
};

export default Settings;