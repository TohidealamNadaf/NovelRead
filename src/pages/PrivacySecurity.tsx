
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { ArrowLeft, Shield, Lock, Eye, Save } from 'lucide-react';

export const PrivacySecurity = () => {
    const navigate = useNavigate();

    return (
        <div className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-white min-h-screen font-sans flex flex-col transition-colors">
            {/* Header */}
            <div className="sticky top-0 z-20 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md px-4 py-4 pt-[35px] shrink-0 border-b border-slate-200 dark:border-white/5">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <h2 className="text-xl font-bold">Privacy & Security</h2>
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-4 py-4 pb-24 space-y-6">
                <div className="p-4 rounded-xl bg-white dark:bg-[#1c1c1e] border border-slate-200 dark:border-white/5 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <Shield className="text-primary" size={24} />
                        <h3 className="font-bold text-lg">Data Protection</h3>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        Your reading data, including library content and preferences, is stored locally on your device.
                        We do not sell your personal data to third parties.
                    </p>
                </div>

                <div className="p-4 rounded-xl bg-white dark:bg-[#1c1c1e] border border-slate-200 dark:border-white/5 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <Lock className="text-green-500" size={24} />
                        <h3 className="font-bold text-lg">Local Encryption</h3>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        Downloaded chapters are stored in a secure local database.
                        Enable biometric lock to prevent unauthorized access to your library.
                    </p>
                    <div className="mt-4 flex items-center justify-between">
                        <span className="text-sm font-medium">Biometric Lock</span>
                        <div className="w-12 h-7 bg-slate-200 dark:bg-slate-700 rounded-full relative transition-colors cursor-pointer">
                            <div className="absolute left-1 top-1 size-5 bg-white rounded-full shadow-sm"></div>
                        </div>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-white dark:bg-[#1c1c1e] border border-slate-200 dark:border-white/5 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <Eye className="text-blue-500" size={24} />
                        <h3 className="font-bold text-lg">Incognito Mode</h3>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                        When enabled, your reading history will not be recorded, and progress will not be synced.
                    </p>
                    <button className="w-full py-3 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 font-medium transition-colors">
                        Turn On Incognito
                    </button>
                </div>

                <div className="p-4 rounded-xl bg-white dark:bg-[#1c1c1e] border border-slate-200 dark:border-white/5 shadow-sm">
                    <div className="flex items-center gap-3 mb-4">
                        <Save className="text-orange-500" size={24} />
                        <h3 className="font-bold text-lg">Manual Backup</h3>
                    </div>
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                        Export your library settings and reading progress to a local file.
                    </p>
                    <button className="w-full py-3 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 font-medium transition-colors">
                        Export Data
                    </button>
                </div>
            </div>
            <Navbar />
        </div>
    );
};
