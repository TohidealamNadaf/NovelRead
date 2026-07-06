# Novel Reading App

A modern, cross-platform Novel & Manhwa Reading application built with React, TypeScript, Vite, and Capacitor. This app allows users to discover, scrape, download, read, and even automatically rewrite/correct chapters using AI.

## 🚀 Key Features

### 1. Robust Web Scraping Engine (`ScraperService`)
The app features an advanced scraping system designed to bypass common anti-bot protections (like Cloudflare) and extract high-quality content. Supported sources include:
- **NovelFire (`novelfire.scraper.ts`):** Deep integration with `novelfire.net`, accurately extracting metadata, chapter lists, and chapter content while bypassing Cloudflare JS challenges.
- **FreeWebNovel (`freewebnovel.scraper.ts`):** Full support for extracting novels and chapters from `freewebnovel.com` natively.
- **Manhwa Support (`manhwaScraper.service.ts`):** Capable of extracting image arrays for reading Manhwa/Manga.
- **Anti-Bot Resilience:** Implements a 3-tier proxy cascade for web browsers (Vite Dev Proxy → `corsproxy.io` → `allorigins.win`) to handle CORS and Cloudflare blocks. Uses native `CapacitorHttp` on mobile devices.
- **Smart Retries:** Features exponential backoff and retry logic for chapter fetching, ensuring no chapters are missed during bulk downloads even if temporary network blocks occur.
- **Content Cleaning:** Automatically strips ads, iframes, translation notes, and injected JavaScript to provide a pristine reading experience.

### 2. AI-Powered Chapter Rewriter (`RewriterService`)
Machine Translation (MTL) and fast-typing errors are automatically corrected using a sophisticated AI pipeline.
- **Deterministic Pre-processing:** Lightning-fast local regex fixes for common symbol typos (e.g., `@nd` → `and`, `$he` → `she`), glued punctuation, repeated words, and aggressive watermark removal.
- **AI Correction:** Connects to LLM providers (Gemini, Claude, Groq, OpenRouter) to fix deep contextual errors like gender pronoun inconsistencies, merged dialogue, and broken grammar.
- **Formatting Preservation:** Meticulously preserves original HTML formatting (italics for thoughts, bolds for system prompts) throughout the AI translation process.

### 3. AI Summarizer (`SummarizerService`)
- Uses LLMs to generate concise summaries of long chapters or full novel synopses. 

### 4. Offline Reading & Database (`db.service.ts`)
- Uses `@capacitor-community/sqlite` natively and `idb` on the web to seamlessly store downloaded chapters, novel metadata, and user reading progress.
- Supports bulk downloading entire novels in the background with local notifications (`@capacitor/local-notifications`) showing progress.

### 5. Cross-Platform (Capacitor)
- Runs as a standard Web App in the browser.
- Compiles natively to Android (and iOS) using Ionic Capacitor, utilizing native HTTP requests, local SQLite databases, and haptic feedback.

### 6. Reader & Text-to-Speech (`ttsEngine.ts`)
- Highly customizable reader interface with Virtual Scrolling (`@tanstack/react-virtual`) for massive chapter lists.
- **Native TTS Integration:** Uses `@capacitor-community/text-to-speech` and `@capgo/capacitor-media-session` to allow listening to novels like audiobooks, complete with lock-screen media controls.

## 🛠️ Tech Stack

- **Frontend:** React 18, TypeScript, Vite
- **Styling:** Tailwind CSS
- **Mobile/Native:** Capacitor (Core, HTTP, Local Notifications)
- **HTML Parsing:** Cheerio
- **AI Integration:** Support for Gemini, Claude, Groq, Mistral, and OpenRouter APIs.

## 📦 Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- npm or yarn
- Android Studio (for Android deployment)

### Installation
1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
   *Note: The Vite dev server includes a custom proxy middleware `/api/proxy` to bypass CORS when running in a web browser.*

### Android Deployment
1. Build the web assets:
   ```bash
   npm run build
   ```
2. Sync with Capacitor:
   ```bash
   npx cap sync android
   ```
3. Open in Android Studio:
   ```bash
   npx cap open android
   ```

## 🧠 Current Architecture Highlights

- **`scraper.service.ts`:** Contains the heavy lifting for fetching HTML, parsing DOM nodes, handling Cloudflare `__CF$cv$params` challenges, and managing the download queue.
- **`rewriter.service.ts`:** Manages the 4-step pipeline (HTML→Text, Regex Pre-process, AI prompt execution, Text→HTML).
- **`vite.config.ts`:** Custom HTTP/HTTPS proxy middleware to handle dynamic target routing with browser-like headers for local development.

---
*Built for the ultimate ad-free, typo-free reading experience.*
