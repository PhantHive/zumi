// BurgerButton.tsx
import React from 'react';
import '../styles/burgerIcon.css';

interface BurgerButtonProps {
    isOpen: boolean;
    onClick: () => void;
}

const BurgerButton: React.FC<BurgerButtonProps> = ({ isOpen, onClick }) => {
    return (
        <button
            className={`burger-button ${isOpen ? 'open' : ''}`}
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
        >
            <div className={`menu-icon ${isOpen ? 'open' : ''}`}>
                <span></span>
                <span></span>
                <span></span>
            </div>
        </button>
    );
};

export default BurgerButton;
