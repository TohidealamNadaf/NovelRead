import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Plus, Check, Bookmark, Heart, Clock, CheckCircle2, Folder, Trash2 } from 'lucide-react';
import { dbService, type Collection, type Novel } from '../../services/db.service';
import clsx from 'clsx';

interface CollectionManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    novel: Novel | null;
    onUpdated?: () => void;
}

const PRESET_COLORS = [
    '#6366f1', // Indigo
    '#3b82f6', // Blue
    '#10b981', // Emerald
    '#f59e0b', // Amber
    '#ec4899', // Pink
    '#8b5cf6', // Purple
    '#ef4444', // Red
    '#06b6d4', // Cyan
];

export const CollectionManagerModal = ({
    isOpen,
    onClose,
    novel,
    onUpdated,
}: CollectionManagerModalProps) => {
    const [collections, setCollections] = useState<Collection[]>([]);
    const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(new Set());
    const [isCreating, setIsCreating] = useState(false);
    const [newColName, setNewColName] = useState('');
    const [newColColor, setNewColColor] = useState(PRESET_COLORS[0]);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadCollections();
            if (novel) {
                setSelectedCollectionIds(new Set(novel.collectionIds || []));
            } else {
                setSelectedCollectionIds(new Set());
            }
        }
    }, [isOpen, novel]);

    const loadCollections = async () => {
        const list = await dbService.getCollections();
        setCollections(list);
    };

    const handleToggleCollection = async (colId: string) => {
        if (!novel) return;
        const next = new Set(selectedCollectionIds);
        if (next.has(colId)) {
            next.delete(colId);
        } else {
            next.add(colId);
        }
        setSelectedCollectionIds(next);

        // Auto save selection
        setIsSaving(true);
        try {
            await dbService.setNovelCollections(novel.id, Array.from(next));
            onUpdated?.();
        } finally {
            setIsSaving(false);
        }
    };

    const handleCreateCollection = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newColName.trim()) return;

        const created = await dbService.createCollection(newColName.trim(), newColColor);
        if (created) {
            setNewColName('');
            setIsCreating(false);
            await loadCollections();
            if (novel) {
                // Automatically add the current novel to the newly created collection
                const next = new Set(selectedCollectionIds);
                next.add(created.id);
                setSelectedCollectionIds(next);
                await dbService.setNovelCollections(novel.id, Array.from(next));
                onUpdated?.();
            }
        }
    };

    const handleDeleteCollection = async (colId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (window.confirm('Delete this collection?')) {
            await dbService.deleteCollection(colId);
            const next = new Set(selectedCollectionIds);
            next.delete(colId);
            setSelectedCollectionIds(next);
            await loadCollections();
            onUpdated?.();
        }
    };

    const renderIcon = (icon?: string) => {
        switch (icon) {
            case 'book-open': return <Bookmark size={18} />;
            case 'clock': return <Clock size={18} />;
            case 'heart': return <Heart size={18} />;
            case 'check-circle': return <CheckCircle2 size={18} />;
            default: return <Folder size={18} />;
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
                        onClick={onClose}
                    />

                    {/* Modal Dialog */}
                    <motion.div
                        initial={{ y: "100%", opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: "100%", opacity: 0 }}
                        transition={{ type: "spring", damping: 25, stiffness: 220 }}
                        className="relative z-10 w-full sm:max-w-md bg-white dark:bg-[#151722] rounded-t-3xl sm:rounded-3xl shadow-2xl border border-black/5 dark:border-white/10 overflow-hidden max-h-[85vh] flex flex-col"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-white/5">
                            <div>
                                <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                                    {novel ? 'Manage Collections' : 'Collections'}
                                </h3>
                                {novel && (
                                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1 max-w-[280px]">
                                        {novel.title}
                                    </p>
                                )}
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Collections List */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                            {collections.map((col) => {
                                const isChecked = selectedCollectionIds.has(col.id);
                                return (
                                    <div
                                        key={col.id}
                                        onClick={() => novel && handleToggleCollection(col.id)}
                                        className={clsx(
                                            "flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer active:scale-[0.99]",
                                            isChecked
                                                ? "bg-primary/5 dark:bg-primary/10 border-primary/40 shadow-sm"
                                                : "bg-slate-50 dark:bg-white/[0.03] border-slate-200/80 dark:border-white/5 hover:border-slate-300"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div
                                                className="size-10 rounded-xl flex items-center justify-center text-white shadow-sm"
                                                style={{ backgroundColor: col.color || '#6366f1' }}
                                            >
                                                {renderIcon(col.icon)}
                                            </div>
                                            <div>
                                                <p className="font-bold text-sm text-slate-800 dark:text-white">
                                                    {col.name}
                                                </p>
                                                <p className="text-[11px] text-slate-400">
                                                    {col.novelCount || 0} {(col.novelCount === 1) ? 'title' : 'titles'}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            {novel && (
                                                <div
                                                    className={clsx(
                                                        "size-6 rounded-lg flex items-center justify-center border transition-all",
                                                        isChecked
                                                            ? "bg-primary border-primary text-white"
                                                            : "border-slate-300 dark:border-slate-600 bg-transparent"
                                                    )}
                                                >
                                                    {isChecked && <Check size={14} className="stroke-[3]" />}
                                                </div>
                                            )}
                                            {!['col-reading', 'col-plan-to-read', 'col-favorites', 'col-completed'].includes(col.id) && (
                                                <button
                                                    onClick={(e) => handleDeleteCollection(col.id, e)}
                                                    className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                                                    title="Delete collection"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Create Collection Form */}
                            {isCreating ? (
                                <form onSubmit={handleCreateCollection} className="mt-4 p-4 rounded-2xl bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 space-y-3">
                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400">New Collection</p>
                                    <input
                                        type="text"
                                        value={newColName}
                                        onChange={(e) => setNewColName(e.target.value)}
                                        placeholder="e.g. Must Read, Cultivation, Dropped"
                                        className="w-full px-3 py-2 text-sm rounded-xl bg-white dark:bg-black/30 border border-slate-300 dark:border-white/10 focus:outline-none focus:border-primary text-slate-900 dark:text-white"
                                        autoFocus
                                    />
                                    <div className="flex items-center gap-1.5">
                                        {PRESET_COLORS.map((color) => (
                                            <button
                                                type="button"
                                                key={color}
                                                onClick={() => setNewColColor(color)}
                                                className={clsx(
                                                    "size-6 rounded-full transition-transform",
                                                    newColColor === color ? "scale-125 ring-2 ring-white ring-offset-2 ring-offset-[#151722]" : "opacity-70 hover:opacity-100"
                                                )}
                                                style={{ backgroundColor: color }}
                                            />
                                        ))}
                                    </div>
                                    <div className="flex gap-2 justify-end pt-1">
                                        <button
                                            type="button"
                                            onClick={() => setIsCreating(false)}
                                            className="px-3 py-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="submit"
                                            disabled={!newColName.trim()}
                                            className="px-4 py-1.5 text-xs font-bold bg-primary text-white rounded-lg shadow-sm disabled:opacity-50"
                                        >
                                            Create
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <button
                                    onClick={() => setIsCreating(true)}
                                    className="w-full py-3 flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 dark:border-white/20 text-slate-600 dark:text-slate-300 font-semibold text-xs hover:border-primary hover:text-primary transition-colors active:scale-[0.99]"
                                >
                                    <Plus size={16} />
                                    <span>Create New Collection</span>
                                </button>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
                            <span className="text-xs text-slate-400">
                                {isSaving ? 'Saving...' : `${selectedCollectionIds.size} selected`}
                            </span>
                            <button
                                onClick={onClose}
                                className="px-5 py-2 text-xs font-bold rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 active:scale-95 transition-transform"
                            >
                                Done
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
