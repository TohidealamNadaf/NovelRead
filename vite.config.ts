import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Dev proxy to bypass CORS for manhwa scraping
      '/api/proxy': {
        target: 'https://kagane.org',
        changeOrigin: true,
        rewrite: (path) => {
          const url = new URL('http://localhost' + path);
          const target = url.searchParams.get('url');
          if (target) {
            const targetUrl = new URL(target);
            return targetUrl.pathname + targetUrl.search;
          }
          return path;
        },
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            // Dynamically change the target based on the URL parameter
            const url = new URL('http://localhost' + (req.url || ''));
            const target = url.searchParams.get('url');
            if (target) {
              const targetUrl = new URL(target);
              proxyReq.setHeader('host', targetUrl.host);
              proxyReq.setHeader('referer', targetUrl.origin);
              proxyReq.setHeader('origin', targetUrl.origin);
              // Override the target
              (proxy as any).options.target = targetUrl.origin;
            }
          });
        }
      }
    }
  }
})
