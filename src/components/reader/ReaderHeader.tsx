import { MoreHorizontal } from 'lucide-react';
import { Header } from '../Header';
import type { Chapter } from '../../services/db.service';

interface ReaderHeaderProps {
    chapter: Chapter;
    navIndex: number;
    hasNavChapters: boolean;
    onBack: () => void;
    onToggleSettings: () => void;
}

export const ReaderHeader = ({
    chapter,
    navIndex,
    hasNavChapters,
    onBack,
    onToggleSettings,
}: ReaderHeaderProps) => {
    return (
        <Header
            title={chapter.title}
            subtitle={hasNavChapters ? `Chapter ${navIndex + 1}` : `Chapter ${chapter.orderIndex + 1}`}
            showBack={true}
            onBack={onBack}
            transparent
            withBorder
            className="bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md"
            rightActions={
                <button
                    onClick={onToggleSettings}
                    className="flex items-center justify-center size-10 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
                    aria-label="Reader settings"
                >
                    <MoreHorizontal />
                </button>
            }
        />
    );
};
