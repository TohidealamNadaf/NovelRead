import React from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, ChevronRight, Search, Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Novel } from '../services/db.service';

interface NovelGridProps {
    filteredNovels: Novel[];
    searchQuery: string;
    selectedCategory: string;
    editMode: boolean;
    COLUMN_COUNT: number;
    handlePointerDown: () => void;
    handlePointerUpOrMove: () => void;
    preventLinkIfEdit: (e: React.MouseEvent) => void;
    handleDeleteNovel: (novelId: string, e: React.MouseEvent) => Promise<void>;
}

const jiggleVariants: any = {
    idle: { rotate: 0 },
    jiggle: {
        rotate: [-1, 1, -1],
        transition: { repeat: Infinity, duration: 0.3, ease: "easeInOut" }
    }
};

const NovelGridBase: React.FC<NovelGridProps> = ({
    filteredNovels,
    searchQuery,
    selectedCategory,
    editMode,
    COLUMN_COUNT,
    handlePointerDown,
    handlePointerUpOrMove,
    preventLinkIfEdit,
    handleDeleteNovel
}: NovelGridProps) => {
    return (
        <div className="px-4">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-extrabold text-slate-800 dark:text-white">
                    {editMode ? 'Edit Library' : 'My Collection'} 
                    <span className="text-sm font-medium text-slate-400 ml-2">({filteredNovels.length})</span>
                </h3>
            </div>

            {filteredNovels.length === 0 && !searchQuery ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="size-24 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                        <BookOpen size={48} className="text-primary/50" />
                    </div>
                    <h4 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Your library is empty</h4>
                    <p className="text-sm text-slate-500 max-w-[250px] mb-6">Discover new worlds and add your favorite novels here.</p>
                    <Link to="/discover" className="flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-full font-bold shadow-lg shadow-primary/30 active:scale-95 transition-all">
                        Browse Discover <ChevronRight size={18} />
                    </Link>
                </motion.div>
            ) : filteredNovels.length === 0 && searchQuery ? (
                <div className="text-center py-20 text-slate-500">
                    <Search size={40} className="mx-auto mb-4 opacity-20" />
                    <p className="font-medium">No results found for "{searchQuery}"</p>
                </div>
            ) : (
                <div 
                    className="grid gap-3 sm:gap-4 pb-6"
                    style={{ gridTemplateColumns: `repeat(${COLUMN_COUNT}, minmax(0, 1fr))` }}
                >
                    {filteredNovels.map((novel) => (
                        <motion.div
                            key={novel.id}
                            variants={editMode ? jiggleVariants : {}}
                            animate={editMode ? "jiggle" : "idle"}
                        >
                            <Link
                                to={editMode ? '#' : (novel.category === 'Manhwa' ? `/manhwa/${encodeURIComponent(novel.id)}` : `/novel/${encodeURIComponent(novel.id)}`)}
                                className={`flex flex-col gap-2 group relative w-full select-none touch-manipulation ${editMode ? 'cursor-default' : 'cursor-pointer'}`}
                                style={{ WebkitTapHighlightColor: 'transparent' }}
                                onTouchStart={handlePointerDown}
                                onTouchEnd={handlePointerUpOrMove}
                                onTouchMove={handlePointerUpOrMove}
                                onMouseDown={handlePointerDown}
                                onMouseUp={handlePointerUpOrMove}
                                onMouseLeave={handlePointerUpOrMove}
                                onContextMenu={(e) => { e.preventDefault(); }}
                                onClick={preventLinkIfEdit}
                            >
                                {/* Edit Mode Delete Button */}
                                <AnimatePresence>
                                    {editMode && (
                                        <motion.button
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 0, opacity: 0 }}
                                            onClick={(e) => handleDeleteNovel(novel.id, e)}
                                            className="absolute -top-2 -right-2 z-20 size-8 bg-red-500/90 backdrop-blur-md rounded-full flex items-center justify-center shadow-xl ring-2 ring-white dark:ring-[#0f111a] hover:bg-red-600 transition-colors"
                                        >
                                            <X size={16} className="text-white" strokeWidth={3} />
                                        </motion.button>
                                    )}
                                </AnimatePresence>

                                <div className={`relative aspect-[2/3] w-full rounded-2xl overflow-hidden shadow-sm bg-slate-100 dark:bg-white/5 ring-1 ring-black/5 dark:ring-white/10 ${editMode ? 'ring-2 ring-red-500/50 shadow-red-500/20' : 'group-active:scale-[0.97] transition-all duration-200'}`}>
                                    <img
                                        src={novel.coverUrl || '/placeholder-cover.jpg'}
                                        alt={novel.title}
                                        className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-110"
                                        loading="lazy"
                                    />
                                    
                                    {/* Smooth Gradient Overlay */}
                                    <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-80" />

                                    {/* Type Badge */}
                                    {novel.category && novel.category !== 'Unknown' && (
                                        <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-black/40 backdrop-blur-md ring-1 ring-white/20">
                                            <p className="text-[9px] font-extrabold text-white uppercase tracking-wider">{novel.category}</p>
                                        </div>
                                    )}

                                    {/* Embedded Info & Progress */}
                                    <div className="absolute inset-x-0 bottom-0 p-2 sm:p-3 flex flex-col justify-end">
                                        <div className="h-1 bg-white/30 rounded-full overflow-hidden backdrop-blur-sm w-full shadow-inner mb-1.5">
                                            <div
                                                className="h-full bg-primary shadow-[0_0_8px_rgba(var(--color-primary),0.8)]"
                                                style={{ width: `${Math.min(100, ((novel.readChapters || 0) / (novel.totalChapters || 1)) * 100)}%` }}
                                            />
                                        </div>
                                        <div className="flex justify-between items-end gap-2">
                                            <p className="text-[10px] sm:text-xs text-white/90 truncate font-medium">
                                                Ch {novel.readChapters || 0}
                                            </p>
                                            <p className="text-[9px] text-white/60 font-semibold bg-white/10 px-1.5 py-0.5 rounded backdrop-blur-md">
                                                {Math.round(((novel.readChapters || 0) / (novel.totalChapters || 1)) * 100)}%
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col px-1">
                                    <p className="font-bold text-xs sm:text-sm line-clamp-2 leading-tight group-hover:text-primary transition-colors text-slate-800 dark:text-slate-200">
                                        {novel.title}
                                    </p>
                                </div>
                            </Link>
                        </motion.div>
                    ))}

                    {/* Import Button */}
                    {!searchQuery && selectedCategory === 'All' && (
                        <Link to="/discover" className="relative aspect-[2/3] w-full rounded-2xl border-2 border-dashed border-slate-300 dark:border-white/10 flex flex-col items-center justify-center gap-3 hover:bg-primary/5 hover:border-primary/50 transition-all active:scale-[0.97] group">
                            <div className="size-12 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center group-hover:bg-primary group-hover:shadow-lg group-hover:shadow-primary/30 transition-all duration-300">
                                <Plus className="text-slate-400 group-hover:text-white transition-colors" size={24} />
                            </div>
                            <span className="text-xs font-bold text-slate-500 group-hover:text-primary">Add Novel</span>
                        </Link>
                    )}
                </div>
            )}
            
            {/* Floating Import Button for when grid is full or empty */}
            {!searchQuery && selectedCategory === 'All' && filteredNovels.length > 0 && (
                <div className="flex justify-center mt-4 mb-6">
                    <Link to="/discover" className="flex items-center gap-2 px-6 py-3 rounded-full bg-slate-100 dark:bg-white/5 text-sm font-bold hover:bg-primary hover:text-white transition-colors shadow-sm">
                        <Plus size={18} />
                        <span>Import Another Series</span>
                    </Link>
                </div>
            )}
        </div>
    );
};

export const NovelGrid = React.memo(NovelGridBase);
