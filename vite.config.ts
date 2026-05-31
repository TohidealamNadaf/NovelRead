import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import http from 'http'
import https from 'https'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      // Custom proxy middleware - handles dynamic target routing with browser-like headers
      name: 'custom-proxy-middleware',
      configureServer(server) {
        server.middlewares.use('/api/proxy', (req, res) => {
          const rawUrl = req.url || '';
          const qs = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?') + 1) : rawUrl;
          const params = new URLSearchParams(qs);
          const targetRaw = params.get('url');

          if (!targetRaw) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing ?url= parameter');
            return;
          }

          let targetUrl: URL;
          try {
            targetUrl = new URL(targetRaw);
          } catch {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Invalid URL');
            return;
          }

          const isHttps = targetUrl.protocol === 'https:';
          const transport = isHttps ? https : http;
          const port = targetUrl.port ? parseInt(targetUrl.port) : (isHttps ? 443 : 80);

          const options: http.RequestOptions = {
            hostname: targetUrl.hostname,
            port,
            path: targetUrl.pathname + targetUrl.search,
            method: req.method || 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.6367.82 Mobile Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              // Intentionally omit Accept-Encoding so servers return plain (uncompressed) responses.
              // If we forward gzip/br, servers compress the body and our pipe-through proxy
              // cannot transparently decompress it, resulting in garbled binary content.
              'Referer': targetUrl.origin + '/',
              'Connection': 'keep-alive',
              'Cache-Control': 'no-cache',
            },
          };

          const proxyReq = transport.request(options, (proxyRes) => {
            // Handle redirects
            if (proxyRes.statusCode && proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
              res.writeHead(proxyRes.statusCode, { 'Location': proxyRes.headers.location });
              res.end();
              return;
            }

            if (proxyRes.statusCode && proxyRes.statusCode >= 400) {
              console.warn(`[Proxy] ${proxyRes.statusCode} from ${targetRaw}`);
            }

            // Pass through response headers (minus CORS restrictions)
            const responseHeaders: Record<string, string | string[]> = {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': proxyRes.headers['content-type'] || 'text/html; charset=utf-8',
            };
            if (proxyRes.headers['content-encoding']) {
              responseHeaders['Content-Encoding'] = proxyRes.headers['content-encoding'];
            }

            res.writeHead(proxyRes.statusCode || 200, responseHeaders);
            proxyRes.pipe(res);
          });

          proxyReq.on('error', (err) => {
            console.error('[Proxy] Error:', err.message);
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'text/plain' });
            }
            res.end(`Proxy error: ${err.message}`);
          });

          proxyReq.setTimeout(30000, () => {
            proxyReq.destroy();
            if (!res.headersSent) {
              res.writeHead(504, { 'Content-Type': 'text/plain' });
            }
            res.end('Proxy timeout');
          });

          proxyReq.end();
        });
      }
    }
  ],
})
