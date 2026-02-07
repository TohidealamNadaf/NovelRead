import React, { useState, useEffect } from 'react';
import { Play, Pause, BookOpen, X } from 'lucide-react';
import { audioService } from '../services/audio.service';

export const MiniPlayer = () => {
    const [track, setTrack] = useState<any>(null);

    // Auto-update track state

    useEffect(() => {
        const unsubscribe = audioService.subscribe((state) => {
            setTrack(state.currentTrack);
        });
        return unsubscribe;
    }, []);

    if (!track) return null;

    const togglePlayback = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (track.type === 'tts') {
            if (track.isPlaying) audioService.pauseSpeaking();
            else audioService.resumeSpeaking();
        } else {
            if (track.isPlaying) audioService.stopBGM();
        }
    };

    const handleClose = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (track.type === 'tts') audioService.stopSpeaking();
        else audioService.stopBGM();
    };

    return (
        <div className="fixed bottom-24 left-4 right-4 z-50 animate-in slide-in-from-bottom duration-300 pointer-events-auto">
            <div className="flex items-center gap-3 bg-white/95 dark:bg-[#2b2839]/95 backdrop-blur-lg border border-slate-200 dark:border-white/10 rounded-xl p-2 shadow-2xl">
                <div className="size-10 rounded-lg overflow-hidden bg-cover bg-center shrink-0 bg-slate-200 dark:bg-slate-700"
                    style={{ backgroundImage: track.coverUrl ? `url('${track.coverUrl}')` : undefined }}>
                    {!track.coverUrl && <div className="w-full h-full flex items-center justify-center"><BookOpen size={16} /></div>}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate dark:text-white">{track.title}</p>
                    <p className="text-[10px] text-primary font-medium flex items-center gap-1 truncate">
                        {track.isPlaying && <span className="animate-pulse">●</span>}
                        {track.subtitle}
                    </p>
                </div>
                <div className="flex items-center gap-1 pr-1">
                    <button
                        onClick={togglePlayback}
                        className="size-9 flex items-center justify-center rounded-full bg-primary text-white shadow-md hover:scale-105 transition-transform active:scale-95"
                    >
                        {track.isPlaying ? <Pause size={20} className="fill-current" /> : <Play size={20} className="ml-0.5 fill-current" />}
                    </button>

                    <button
                        onClick={handleClose}
                        className="size-8 flex items-center justify-center rounded-full hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors ml-1"
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
};
