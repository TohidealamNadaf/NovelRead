import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface ToastProps {
    message: string;
    type?: 'info' | 'success' | 'error' | 'warning';
    duration?: number;
    onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, type = 'info', duration = 3000, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, duration);

        return () => clearTimeout(timer);
    }, [duration, onClose]);

    const bgColors = {
        info: 'bg-slate-800 dark:bg-slate-700',
        success: 'bg-green-600',
        error: 'bg-red-600',
        warning: 'bg-yellow-600'
    };

    return createPortal(
        <div className={`fixed bottom-20 left-1/2 transform -translate-x-1/2 z-[100] flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-white ${bgColors[type]} min-w-[300px] max-w-[90vw] animate-in slide-in-from-bottom-5 fade-in duration-300`}>
            <span className="flex-1 text-sm font-medium">{message}</span>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
                <X size={16} />
            </button>
        </div>,
        document.body
    );
};
