import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface ActionModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'primary' | 'neutral';
    onConfirm: () => void;
    onCancel: () => void;
}

export const ActionModal: React.FC<ActionModalProps> = ({
    isOpen,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    type = 'primary',
    onConfirm,
    onCancel
}) => {
    if (!isOpen) return null;

    const confirmColors = {
        danger: 'bg-red-600 hover:bg-red-700 text-white',
        primary: 'bg-primary hover:bg-primary-dark text-white',
        neutral: 'bg-slate-200 hover:bg-slate-300 text-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-white'
    };

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
                    <h3 className="font-semibold text-lg text-slate-900 dark:text-white">{title}</h3>
                    <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4">
                    <p className="text-slate-600 dark:text-slate-300 leading-relaxed">{message}</p>
                </div>

                <div className="flex items-center justify-end gap-3 p-4 bg-slate-50 dark:bg-slate-800/50">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${confirmColors[type]}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
