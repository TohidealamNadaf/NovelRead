export const generateSlug = (title: string): string => {
    if (!title) return 'novel';
    return encodeURIComponent(title)
        .replace(/%20/g, '-')
        .replace(/[^a-zA-Z0-9-]/g, '') // Remove special chars just in case
        .slice(0, 60);
};
