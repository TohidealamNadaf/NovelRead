import { useState, useEffect } from 'react';
import { Preferences } from '@capacitor/preferences';

export const useProfileImage = () => {
    // Initialize with localStorage for instant render if available
    const [profileImage, setProfileImage] = useState<string>(
        localStorage.getItem('profileImage') ||
        "https://img.freepik.com/free-psd/3d-illustration-person-with-sunglasses_23-2149436188.jpg"
    );

    useEffect(() => {
        // Function to load from highly reliable storage (Preferences)
        const loadFromPreferences = async () => {
            try {
                const { value } = await Preferences.get({ key: 'profileImage' });
                if (value && value !== profileImage) {
                    setProfileImage(value);
                    // Sync back to localStorage for next boot speed
                    localStorage.setItem('profileImage', value);
                }
            } catch (e) {
                console.error("Failed to load profile image from preferences", e);
            }
        };

        loadFromPreferences();

        // Listen for updates from other components
        const handleProfileUpdate = (event: CustomEvent<string>) => {
            if (event.detail) {
                setProfileImage(event.detail);
                localStorage.setItem('profileImage', event.detail);
            }
        };

        window.addEventListener('profile-updated', handleProfileUpdate as EventListener);

        return () => {
            window.removeEventListener('profile-updated', handleProfileUpdate as EventListener);
        };
    }, []);

    return profileImage;
};
