import { memo } from 'react';
import { RefreshCcw } from 'lucide-react';

interface DiscoverSyncModalProps {
    showSyncModal: boolean;
    syncProgress: { task: string; current: number; total: number };
}

export const DiscoverSyncModal = memo(({ showSyncModal, syncProgress }: DiscoverSyncModalProps) => {
    if (!showSyncModal) return null;

    const progressPercentage = syncProgress.total > 0 ? (syncProgress.current / syncProgress.total) * 100 : 0;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white dark:bg-[#1c1c1e] w-full max-w-sm rounded-[32px] p-8 shadow-2xl border border-slate-200 dark:border-white/10 flex flex-col items-center text-center scale-100 animate-in zoom-in-95 duration-300">
                <div className="size-20 bg-primary/10 rounded-full flex items-center justify-center mb-6 relative">
                    <RefreshCcw size={32} className="text-primary animate-spin" />
                    <div className="absolute inset-0 border-4 border-primary/20 rounded-full"></div>
                </div>
                <h3 className="text-xl font-bold mb-2">Syncing Discover</h3>
                <p className="text-slate-500 dark:text-[#a19db9] text-sm mb-6 leading-relaxed">
                    Updating all categories from NovelFire. This may take a few seconds.
                </p>

                <div className="w-full space-y-4">
                    <div className="flex justify-between items-center text-[10px] uppercase tracking-widest font-bold text-primary">
                        <span>{syncProgress.task}</span>
                        <span>{syncProgress.current}/{syncProgress.total}</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all duration-500 rounded-full shadow-[0_0_12px_rgba(93,88,240,0.5)]"
                            style={{ width: `${progressPercentage}%` }}
                        ></div>
                    </div>
                </div>
            </div>
        </div>
    );
});
