import { Capacitor } from '@capacitor/core';

// Bundle a local SVG/PNG in /public or src/assets and import it
export const DEFAULT_AVATAR = 'https://img.freepik.com/free-psd/3d-illustration-person-with-sunglasses_23-2149436188.jpg';

/**
 * Converts any stored profile image reference to a displayable <img> src.
 * Handles: http(s), data:, file:// (iOS), content:// (Android).
 */
export const getProfileImageDisplay = (src: string | null | undefined): string => {
    if (!src) return DEFAULT_AVATAR;
    if (src.startsWith('file://') || src.startsWith('content://')) {
        return Capacitor.convertFileSrc(src);
    }
    return src;
};

export const isWeb = (): boolean => Capacitor.getPlatform() === 'web';
