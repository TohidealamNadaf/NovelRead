
import { Filesystem, Directory } from '@capacitor/filesystem';

export const cacheService = {
    async getCacheSize(): Promise<string> {
        try {
            // Calculate size of the 'Data' directory where we store images/chapters
            // Note: In a real extensive app, we might need recursive calculation.
            // For now, let's assume we checking the main storage folder.

            // Getting directory stats is limited in web/hybrid without a plugin for folder size.
            // However, we can list files and sum up their sizes if 'readdir' returns stats.
            // Standard readdir only returns names. 
            // A common workaround is to track usage or just clear blind.

            // But let's try to list the directory and estimate.
            const result = await Filesystem.readdir({
                path: '',
                directory: Directory.Data
            });

            // This is a rough estimation as we can't easily get file sizes in bulk without native code or loop.
            // For a production app, we'd loop or use a plugin. 
            // Let's count files for now or return a placeholder if calculation is too heavy.

            // Better: Just return a "Calculated" string or implement a loop if files < 100.
            // For the sake of this task, let's try to get stat for a few known folders.

            let totalSize = 0;
            // Listing files in Data directory
            for (const file of result.files) {
                // stat() might be expensive in a loop.
                if (file.type === 'file') {
                    // We can't get size directly from readdir result in standard plugin?
                    // Actually, some versions return size. Let's assume standard behavior:
                    // We might need to stat each file.
                    try {
                        const stat = await Filesystem.stat({
                            path: file.name,
                            directory: Directory.Data
                        });
                        totalSize += stat.size;
                    } catch { }
                }
            }

            // Convert to MB
            const mb = totalSize / (1024 * 1024);
            return mb < 1 ? '< 1 MB' : `${mb.toFixed(2)} MB`;

        } catch (e) {
            console.error("Error calculating cache", e);
            return "Unknown";
        }
    },

    async clearCache(): Promise<boolean> {
        try {
            // Delete all files in Data directory?
            // That might delete user preferences if stored there (but we use Preferences plugin).
            // It might delete profile image.

            // We should be careful. Ideally we scope cache to a subdirectory (e.g., 'cache/').
            // If the app stores chapters in root Data, clearing root Data clears everything.

            // Strategy: List files, delete those that are images or chapter data.
            // Or if we moved everything to a 'downloads' folder.

            const result = await Filesystem.readdir({
                path: '',
                directory: Directory.Data
            });

            for (const file of result.files) {
                if (file.type === 'file') {
                    // Filter valid cache files (images, html) custom logic
                    if (file.name.endsWith('.jpg') || file.name.endsWith('.png') || file.name.endsWith('.html') || file.name.endsWith('.json')) {
                        // Don't delete profile image if we name it specifically
                        if (!file.name.startsWith('profile_')) {
                            await Filesystem.deleteFile({
                                path: file.name,
                                directory: Directory.Data
                            });
                        }
                    }
                }
            }
            return true;
        } catch (e) {
            console.error("Error clearing cache", e);
            return false;
        }
    }
};
