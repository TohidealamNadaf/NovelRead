import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import http from 'http'
import https from 'https'
import zlib from 'zlib'

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
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Accept-Encoding': 'gzip, deflate, br',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': 'none',
              'Sec-Fetch-User': '?1',
              'Upgrade-Insecure-Requests': '1',
              'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
              'sec-ch-ua-mobile': '?0',
              'sec-ch-ua-platform': '"Windows"',
              'Referer': 'https://mangafire.to/',
              'Origin': 'https://mangafire.to',
              'Connection': 'keep-alive',
              'Cache-Control': 'no-cache',
            },
          };

          if (req.headers['content-type']) {
            (options.headers as Record<string, any>)['Content-Type'] = req.headers['content-type'];
          }
          if (req.headers['content-length']) {
            (options.headers as Record<string, any>)['Content-Length'] = req.headers['content-length'];
          }
          if (req.headers['accept']) {
            (options.headers as Record<string, any>)['Accept'] = req.headers['accept'];
          }
          if (req.headers['x-requested-with']) {
            (options.headers as Record<string, any>)['X-Requested-With'] = req.headers['x-requested-with'];
          }

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
            const encoding = proxyRes.headers['content-encoding'];
            if (encoding && !['gzip', 'br', 'deflate'].includes(encoding)) {
              responseHeaders['Content-Encoding'] = encoding;
            }

            res.writeHead(proxyRes.statusCode || 200, responseHeaders);
            
            const handleError = (err: Error) => {
              console.warn('[Proxy] Decompression error:', err.message);
              if (!res.writableEnded) res.end();
            };

            if (encoding === 'gzip') {
              proxyRes.pipe(zlib.createGunzip().on('error', handleError)).pipe(res);
            } else if (encoding === 'br') {
              proxyRes.pipe(zlib.createBrotliDecompress().on('error', handleError)).pipe(res);
            } else if (encoding === 'deflate') {
              proxyRes.pipe(zlib.createInflate().on('error', handleError)).pipe(res);
            } else {
              proxyRes.pipe(res);
            }
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

          // Forward the incoming request body (needed for POST/form submissions like search)
          if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
            req.pipe(proxyReq);
          } else {
            proxyReq.end();
          }
        });
      }
    }
  ],
})
