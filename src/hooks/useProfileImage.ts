import { useState, useEffect } from 'react';
import { Preferences } from '@capacitor/preferences';
import { getProfileImageDisplay, DEFAULT_AVATAR } from '../utils/profileImage.util';

export const useProfileImage = () => {
    const [profileImage, setProfileImage] = useState<string>(DEFAULT_AVATAR);

    useEffect(() => {
        const load = async () => {
            try {
                const { value } = await Preferences.get({ key: 'profileImage' });
                if (value) setProfileImage(getProfileImageDisplay(value));
            } catch (e) {
                console.error('[useProfileImage] load failed', e);
            }
        };
        load();

        const handler = (e: CustomEvent<string>) => {
            if (e.detail) setProfileImage(getProfileImageDisplay(e.detail));
        };
        window.addEventListener('profile-updated', handler as EventListener);
        return () => window.removeEventListener('profile-updated', handler as EventListener);
    }, []);

    return profileImage;
};
