export const isPlaceholderContent = (content?: string): boolean => {
    if (!content) return true;
    if (content.length < 50) return true;
    if (/No images found|Failed to load images/i.test(content)) return true;
    if (!/<img\b/i.test(content)) return true;
    return false;
};
