export const FONT_SIZES = [
    { label: '14', value: 0.875 },
    { label: '16', value: 1 },
    { label: '18', value: 1.125 },
    { label: '22', value: 1.375 },
];

export const THEME_OPTIONS = [
    { id: 'light', color: 'bg-white', label: 'Paper' },
    { id: 'sepia', color: 'bg-[#f4ecd8]', label: 'Sepia' },
    { id: 'dark', color: 'bg-[#1e1e1e]', label: 'Eclipse' },
    { id: 'oled', color: 'bg-black', label: 'OLED' },
] as const;
