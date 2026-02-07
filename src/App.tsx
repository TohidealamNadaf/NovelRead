import { Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { Import } from './pages/Import';
import { ChapterList } from './pages/ChapterList';
import { Discover } from './pages/Discover';
import { AudioSettings } from './pages/AudioSettings';
import { Profile } from './pages/Profile';
import { Reader } from './pages/Reader';
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
        <Route path="/audio" element={<AudioSettings />} />
        <Route path="/profile" element={<Profile />} />

        {/* Route alias for development/testing UI */}
        <Route path="/reader" element={<Reader />} />
      </Routes>
    </>
  );
}

export default App;
