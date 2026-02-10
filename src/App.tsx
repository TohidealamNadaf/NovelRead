import { Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { Import } from './pages/Import';
import { ChapterList } from './pages/ChapterList';
import { Discover } from './pages/Discover';
import { DiscoverList } from './pages/DiscoverList';
import { AudioSettings } from './pages/AudioSettings';
import { Profile } from './pages/Profile';
import { Settings } from './pages/Settings';
import { Reader } from './pages/Reader';
import { ScrapingHistory } from './pages/ScrapingHistory';
import { PrivacySecurity } from './pages/PrivacySecurity';
import { Notifications } from './pages/Notifications';
import { MiniPlayer } from './components/MiniPlayer';
import { ManhwaSeries } from './pages/ManhwaSeries';
import { ManhwaReader } from './pages/ManhwaReader';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { useLocation, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

function App() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let backButtonListener: any;

    const setupListener = async () => {
      backButtonListener = await CapApp.addListener('backButton', () => {
        if (location.pathname === '/') {
          CapApp.exitApp();
        } else {
          navigate(-1);
        }
      });
    };

    setupListener();

    return () => {
      if (backButtonListener) {
        backButtonListener.remove();
      }
    };
  }, [location, navigate]);

  return (
    <>
      {Capacitor.getPlatform() === 'web' && (
        // @ts-ignore
        <jeep-sqlite />
      )}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/import" element={<Import />} />
        <Route path="/novel/:novelId" element={<ChapterList />} />
        <Route path="/read/:novelId/:chapterId" element={<Reader />} />

        {/* Manhwa Routes */}
        <Route path="/manhwa/:novelId" element={<ManhwaSeries />} />
        <Route path="/manhwa/read/:novelId/:chapterId" element={<ManhwaReader />} />

        <Route path="/discover" element={<Discover />} />
        <Route path="/discover/:category" element={<DiscoverList />} />
        <Route path="/audio" element={<AudioSettings />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/history" element={<ScrapingHistory />} />
        <Route path="/privacy" element={<PrivacySecurity />} />
        <Route path="/notifications" element={<Notifications />} />

        {/* Route alias for development/testing UI */}
        <Route path="/reader" element={<Reader />} />
      </Routes>
      <MiniPlayer />
    </>
  );
}

export default App;
