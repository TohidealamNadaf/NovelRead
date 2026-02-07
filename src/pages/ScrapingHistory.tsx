
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Navbar } from '../components/Navbar';
import { dbService } from '../services/database.service';
import { ArrowLeft, Trash2, ExternalLink } from 'lucide-react';

export const ScrapingHistory = () => {
    const navigate = useNavigate();
    const [history, setHistory] = useState<any[]>([]);

    useEffect(() => {
        loadHistory();
    }, []);

    const loadHistory = async () => {
        try {
            const novels = await dbService.getNovels();
            // Filter only imported novels (relaxed for debugging/legacy support)
            // If category is missing, assume it might be imported if it has a sourceUrl (which all do in this schema)
            const imported = novels.filter(n => n.category === 'Imported' || !n.category || n.category === 'Unknown');
            setHistory(imported);
        } catch (e) {
            console.error(e);
        }
    };

    const deleteNovel = async (id: string) => {
        if (confirm("Delete this novel and all its chapters?")) {
            await dbService.deleteNovel(id);
            loadHistory();
        }
    };

    return (
        <div className="bg-background-dark text-white min-h-screen font-sans flex flex-col">
            <div className="sticky top-0 z-20 bg-background-dark/80 backdrop-blur-md px-4 py-4 pt-[35px] shrink-0 border-b border-white/5">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="size-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <h2 className="text-xl font-bold">Scraping History</h2>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 pb-24">
                {history.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                        <p>No scraping history found.</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        {history.map(novel => (
                            <div key={novel.id} className="flex items-center p-3 rounded-xl bg-[#1c1c1e] border border-white/5 gap-3">
                                <div className="h-16 w-12 bg-slate-700 rounded-md bg-cover bg-center shrink-0" style={{ backgroundImage: `url('${novel.coverUrl}')` }}></div>
                                <div className="flex-1 min-w-0">
                                    <h4 className="font-bold text-sm truncate">{novel.title}</h4>
                                    <p className="text-xs text-slate-400 truncate">{novel.author}</p>
                                    <a href={novel.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-primary flex items-center gap-1 mt-1">
                                        Source <ExternalLink size={10} />
                                    </a>
                                </div>
                                <button onClick={() => deleteNovel(novel.id)} className="p-2 text-red-400 hover:bg-red-500/10 rounded-full transition-colors">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <Navbar />
        </div>
    );
};
