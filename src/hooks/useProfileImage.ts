import { useState, useEffect } from 'react';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

export const useProfileImage = () => {
    const getDisplayImage = (src: string | null) => {
        if (!src) return "https://img.freepik.com/free-psd/3d-illustration-person-with-sunglasses_23-2149436188.jpg";
        if (src.startsWith('file://')) {
            return Capacitor.convertFileSrc(src);
        }
        return src;
    };

    // Initialize with localStorage for instant render if available
    const [profileImage, setProfileImage] = useState<string>(
        getDisplayImage(localStorage.getItem('profileImage'))
    );

    useEffect(() => {
        // Function to load from highly reliable storage (Preferences)
        const loadFromPreferences = async () => {
            try {
                const { value } = await Preferences.get({ key: 'profileImage' });
                if (value) {
                    const displayValue = getDisplayImage(value);
                    if (displayValue !== profileImage) {
                        setProfileImage(displayValue);
                        // Sync back to localStorage for next boot speed (store raw value)
                        localStorage.setItem('profileImage', value);
                    }
                }
            } catch (e) {
                console.error("Failed to load profile image from preferences", e);
            }
        };

        loadFromPreferences();

        // Listen for updates from other components
        const handleProfileUpdate = (event: CustomEvent<string>) => {
            if (event.detail) {
                setProfileImage(getDisplayImage(event.detail));
            }
        };

        window.addEventListener('profile-updated', handleProfileUpdate as EventListener);

        return () => {
            window.removeEventListener('profile-updated', handleProfileUpdate as EventListener);
        };
    }, []);

    return profileImage;
};
