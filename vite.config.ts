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
          proxy.on('error', (err, _req, res) => {
            console.error('Proxy Error:', err);
            if (!(res as any).headersSent && (res as any).writeHead) {
              (res as any).writeHead(500, { 'Content-Type': 'text/plain' });
            }
            res.end('Proxy encountered an error.');
          });
          proxy.on('proxyReq', (proxyReq, req) => {
            // Dynamically change the target based on the URL parameter
            const url = new URL('http://localhost' + (req.url || ''));
            const target = url.searchParams.get('url');
            if (target) {
              const targetUrl = new URL(target);
              proxyReq.setHeader('host', targetUrl.host);
              proxyReq.setHeader('referer', targetUrl.origin);
              proxyReq.setHeader('origin', targetUrl.origin);
              // Override the target for this specific request
              (proxy as any).options.target = targetUrl.origin;
            }
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            if (proxyRes.statusCode && proxyRes.statusCode >= 400) {
              console.warn(`Proxy received ${proxyRes.statusCode} from ${req.url}`);
            }
          });
        }
      }
    }
  }
})
