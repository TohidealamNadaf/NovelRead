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
import { MiniPlayer } from './components/MiniPlayer';
import { Capacitor } from '@capacitor/core';

function App() {
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
        <Route path="/discover" element={<Discover />} />
        <Route path="/discover/:category" element={<DiscoverList />} />
        <Route path="/audio" element={<AudioSettings />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/history" element={<ScrapingHistory />} />
        <Route path="/privacy" element={<PrivacySecurity />} />

        {/* Route alias for development/testing UI */}
        <Route path="/reader" element={<Reader />} />
      </Routes>
      <MiniPlayer />
    </>
  );
}

export default App;
