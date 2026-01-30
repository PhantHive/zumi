// client/src/renderer/components/PinLockScreen.tsx
import React, { useState, useEffect, useMemo } from 'react';
import '../styles/pinLock.css';
import { ipcRenderer } from 'electron';

// Emoji symbols for PIN
const SYMBOLS = [
    { id: 0, emoji: '🦋', name: 'Butterfly' },
    { id: 1, emoji: '🐍', name: 'Snake' },
    { id: 2, emoji: '🌸', name: 'Flower' },
    { id: 3, emoji: '🦊', name: 'Fox' },
    { id: 4, emoji: '🐝', name: 'Bee' },
    { id: 5, emoji: '🌺', name: 'Hibiscus' },
    { id: 6, emoji: '🦅', name: 'Eagle' },
    { id: 7, emoji: '🢢', name: 'Turtle' },
    { id: 8, emoji: '🌻', name: 'Sunflower' },
];

interface PinLockScreenProps {
    onUnlock: () => void;
    onSetPin?: (pinHash: string) => Promise<void>;
    isSettingPin?: boolean;
    title?: string;
}

// Simple SHA-256 hash function for browser
async function hashString(str: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const PinLockScreen: React.FC<PinLockScreenProps> = ({
                                                         onUnlock,
                                                         onSetPin,
                                                         isSettingPin = false,
                                                         title,
                                                     }) => {
    const [pin, setPin] = useState<number[]>([]);
    const [confirmPin, setConfirmPin] = useState<number[]>([]);
    const [isConfirming, setIsConfirming] = useState(false);
    const [error, setError] = useState<string>('');
    const [shake, setShake] = useState(false);

    // Randomize symbol positions on mount and after errors
    const shuffledSymbols = useMemo(() => {
        return [...SYMBOLS].sort(() => Math.random() - 0.5);
    }, [error, isConfirming]);

    const handleSymbolPress = (symbolId: number) => {
        if (error) setError('');

        const currentPin = isConfirming ? confirmPin : pin;
        if (currentPin.length < 4) {
            const newPin = [...currentPin, symbolId];

            if (isConfirming) {
                setConfirmPin(newPin);
                if (newPin.length === 4) {
                    validateConfirmPin(newPin);
                }
            } else {
                setPin(newPin);
                if (newPin.length === 4) {
                    if (isSettingPin) {
                        setIsConfirming(true);
                    } else {
                        validatePin(newPin);
                    }
                }
            }
        }
    };

    const handleDelete = () => {
        if (error) setError('');

        if (isConfirming) {
            setConfirmPin(confirmPin.slice(0, -1));
        } else {
            setPin(pin.slice(0, -1));
        }
    };

    const validatePin = async (enteredPin: number[]) => {
        try {
            const pinString = enteredPin.join(',');
            const hashedEnteredPin = await hashString(pinString);

            // Verify PIN with main process
            const result = await ipcRenderer.invoke('pin:verify', hashedEnteredPin);

            if (result.valid) {
                onUnlock();
            } else {
                showError('Incorrect PIN');
                setPin([]);
            }
        } catch (error) {
            console.error('Error validating PIN:', error);
            showError('Error validating PIN');
            setPin([]);
        }
    };

    const validateConfirmPin = async (enteredPin: number[]) => {
        if (JSON.stringify(enteredPin) === JSON.stringify(pin)) {
            const pinString = enteredPin.join(',');
            const hashedPin = await hashString(pinString);

            try {
                if (onSetPin) {
                    await onSetPin(hashedPin);
                }
                setPin([]);
                setConfirmPin([]);
                setIsConfirming(false);
            } catch (error) {
                showError('Failed to set PIN');
                setConfirmPin([]);
            }
        } else {
            showError('PINs do not match');
            setConfirmPin([]);
        }
    };

    const showError = (message: string) => {
        setError(message);
        setShake(true);
        setTimeout(() => setShake(false), 500);
    };

    const currentPin = isConfirming ? confirmPin : pin;

    const getTitle = () => {
        if (title) return title;
        if (isSettingPin) {
            return isConfirming ? 'Confirm your PIN' : 'Create a PIN';
        }
        return 'Enter your PIN';
    };

    const getSubtitle = () => {
        if (isSettingPin && !isConfirming) {
            return 'Choose 4 symbols for your PIN';
        }
        if (isConfirming) {
            return 'Re-enter your symbol PIN';
        }
        return 'Enter your 4-symbol PIN';
    };

    return (
        <div className="pin-lock-overlay">
            <div className="pin-lock-container">
                <div className="pin-lock-content">
                    <div className="pin-lock-header">
                        <div className="pin-lock-icon">🔒</div>
                        <h2 className="pin-lock-title">{getTitle()}</h2>
                        {error ? (
                            <p className="pin-lock-error">{error}</p>
                        ) : (
                            <p className="pin-lock-subtitle">{getSubtitle()}</p>
                        )}
                    </div>

                    <div className={`pin-dots-container ${shake ? 'shake' : ''}`}>
                        {[0, 1, 2, 3].map((index) => (
                            <div key={index} className="pin-dot-wrapper">
                                {currentPin.length > index ? (
                                    <span className="pin-symbol">
                                        {SYMBOLS[currentPin[index]].emoji}
                                    </span>
                                ) : (
                                    <div className={`pin-dot ${error ? 'error' : ''}`} />
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="pin-keypad">
                        {shuffledSymbols.map((symbol) => (
                            <button
                                key={symbol.id}
                                className="pin-key"
                                onClick={() => handleSymbolPress(symbol.id)}
                                type="button"
                            >
                                <span className="pin-key-emoji">{symbol.emoji}</span>
                                <span className="pin-key-name">{symbol.name}</span>
                            </button>
                        ))}
                        <button
                            className="pin-key pin-key-delete"
                            onClick={handleDelete}
                            type="button"
                        >
                            <span className="pin-key-emoji">⌫</span>
                            <span className="pin-key-name">Delete</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PinLockScreen;