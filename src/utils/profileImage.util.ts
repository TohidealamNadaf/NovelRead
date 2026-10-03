import { Capacitor } from '@capacitor/core';

// Modern, offline-first vector SVG default avatar with purple/indigo gradient
export const DEFAULT_AVATAR = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="50%" stop-color="#4f46e5"/>
      <stop offset="100%" stop-color="#3730a3"/>
    </linearGradient>
    <linearGradient id="face" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#e0e7ff" stop-opacity="0.85"/>
    </linearGradient>
  </defs>
  <rect width="120" height="120" rx="60" fill="url(#bg)"/>
  <circle cx="60" cy="46" r="22" fill="url(#face)"/>
  <path d="M26 104 C26 78 40 68 60 68 C80 68 94 78 94 104 Z" fill="url(#face)"/>
  <circle cx="60" cy="45" r="14" fill="#4f46e5" opacity="0.15"/>
</svg>
`.trim())}`;

export interface PresetAvatar {
    id: string;
    name: string;
    category: string;
    svgUrl: string;
}

export const PRESET_AVATARS: PresetAvatar[] = [
    {
        id: 'preset:scholar',
        name: 'The Scholar',
        category: 'Classic',
        svgUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <linearGradient id="sch" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0284c7"/>
      <stop offset="100%" stop-color="#0369a1"/>
    </linearGradient>
  </defs>
  <rect width="120" height="120" rx="60" fill="url(#sch)"/>
  <circle cx="60" cy="46" r="20" fill="#f0f9ff"/>
  <path d="M28 102 C28 78 42 68 60 68 C78 68 92 78 92 102 Z" fill="#f0f9ff"/>
  <circle cx="53" cy="45" r="5" fill="none" stroke="#0369a1" stroke-width="2"/>
  <circle cx="67" cy="45" r="5" fill="none" stroke="#0369a1" stroke-width="2"/>
  <line x1="58" y1="45" x2="62" y2="45" stroke="#0369a1" stroke-width="2"/>
</svg>
`.trim())}`
    },
    {
        id: 'preset:mage',
        name: 'The Arcanist',
        category: 'Fantasy',
        svgUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <linearGradient id="mage" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#9333ea"/>
      <stop offset="100%" stop-color="#6b21a8"/>
    </linearGradient>
  </defs>
  <rect width="120" height="120" rx="60" fill="url(#mage)"/>
  <circle cx="60" cy="48" r="20" fill="#faf5ff"/>
  <path d="M38 48 C38 28 82 28 82 48 C82 58 76 68 60 68 C44 68 38 58 38 48 Z" fill="#581c87"/>
  <circle cx="54" cy="48" r="3" fill="#c084fc"/>
  <circle cx="66" cy="48" r="3" fill="#c084fc"/>
  <path d="M28 102 C28 80 42 70 60 70 C78 70 92 80 92 102 Z" fill="#faf5ff"/>
</svg>
`.trim())}`
    },
    {
        id: 'preset:cultivator',
        name: 'The Cultivator',
        category: 'Xianxia',
        svgUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <linearGradient id="cul" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#059669"/>
      <stop offset="100%" stop-color="#064e3b"/>
    </linearGradient>
  </defs>
  <rect width="120" height="120" rx="60" fill="url(#cul)"/>
  <circle cx="60" cy="45" r="20" fill="#ecfdf5"/>
  <path d="M28 102 C28 78 42 68 60 68 C78 68 92 78 92 102 Z" fill="#ecfdf5"/>
  <path d="M60 32 C58 36 60 40 60 40 C60 40 62 36 60 32 Z" fill="#10b981"/>
</svg>
`.trim())}`
    },
    {
        id: 'preset:shadow',
        name: 'Shadow Monarch',
        category: 'Action',
        svgUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <linearGradient id="shd" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="120" height="120" rx="60" fill="url(#shd)"/>
  <circle cx="60" cy="46" r="21" fill="#312e81"/>
  <path d="M26 104 C26 78 40 68 60 68 C80 68 94 78 94 104 Z" fill="#312e81"/>
  <circle cx="53" cy="46" r="4" fill="#38bdf8"/>
  <circle cx="67" cy="46" r="4" fill="#38bdf8"/>
</svg>
`.trim())}`
    },
    {
        id: 'preset:celestial',
        name: 'The Celestial',
        category: 'Divine',
        svgUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <linearGradient id="cel" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#d97706"/>
      <stop offset="100%" stop-color="#78350f"/>
    </linearGradient>
  </defs>
  <rect width="120" height="120" rx="60" fill="url(#cel)"/>
  <circle cx="60" cy="46" r="20" fill="#fffbeb"/>
  <circle cx="60" cy="46" r="27" fill="none" stroke="#fde68a" stroke-width="2" stroke-dasharray="3 3"/>
  <path d="M28 102 C28 78 42 68 60 68 C78 68 92 78 92 102 Z" fill="#fffbeb"/>
</svg>
`.trim())}`
    },
    {
        id: 'preset:cyber',
        name: 'Netrunner',
        category: 'Sci-Fi',
        svgUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs>
    <linearGradient id="cyb" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ec4899"/>
      <stop offset="100%" stop-color="#831843"/>
    </linearGradient>
  </defs>
  <rect width="120" height="120" rx="60" fill="url(#cyb)"/>
  <circle cx="60" cy="46" r="20" fill="#fdf2f8"/>
  <path d="M28 102 C28 78 42 68 60 68 C78 68 92 78 92 102 Z" fill="#fdf2f8"/>
  <rect x="44" y="42" width="32" height="7" rx="3" fill="#06b6d4"/>
</svg>
`.trim())}`
    }
];

/**
 * Converts any stored profile image reference to a displayable <img> src.
 * Handles:
 * - undefined / null -> DEFAULT_AVATAR
 * - preset:id -> mapped Preset SVG URL
 * - data: (Base64/SVG) -> direct return
 * - file:// or content:// (Android/iOS) -> Capacitor.convertFileSrc()
 * - http(s) -> direct return
 */
export const getProfileImageDisplay = (src: string | null | undefined): string => {
    if (!src) return DEFAULT_AVATAR;

    // Handle preset avatars
    if (src.startsWith('preset:')) {
        const found = PRESET_AVATARS.find(p => p.id === src);
        if (found) return found.svgUrl;
    }

    if (src.startsWith('data:')) {
        return src;
    }

    if (src.startsWith('file://') || src.startsWith('content://')) {
        return Capacitor.convertFileSrc(src);
    }

    return src;
};

export const isWeb = (): boolean => Capacitor.getPlatform() === 'web';
