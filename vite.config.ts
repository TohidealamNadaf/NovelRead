import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import http from 'http'
import https from 'https'
import zlib from 'zlib'

let browserSingleton: any = null;
const getBrowser = async () => {
    if (!browserSingleton || !browserSingleton.connected) {
        const puppeteer = await import('puppeteer');
        browserSingleton = await puppeteer.default.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
    }
    return browserSingleton;
};
const cookieJar = new Map<string, any[]>();
const solvingCache = new Map<string, Promise<string>>();
const htmlCache = new Map<string, { html: string; t: number }>();

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
              'Cookie': 'usertype=guest; cf_clearance=GyY43a9QaRKh0K22L9Xlv24BKZpp9lBo7E6O8_.M8ig-1744350198-1.2.1.1-xQttjYiNo3PzhoZ7JWg_j_ZOv4fgNF8WSB7Cqu279eFtN1aNKp1Bpkjz7hIWZ00Fn8MGd0xOi9vVdnq2iOTbW5OzOus8eIdka.DGyXkXDOC0g0o9n2lwDAEa1JYVZPXr4yjEnC5pP4xBBZZecUNwhQ37KNwKC7ECbyu0zssn3PbarKTe4SOUCXfNMNhNJh3xbDMN9xldKgIRZE2R1m8flWYujOg.NX7ByDAblvCNHjEnkGtROfH2gOBm_djbMIU_hr0hYTLxm60Dwu9WsqVjnTzpFCubIF4vU1oo0wa9BMHNxexn1Ut5bM.c93CMOyO.WCPmlx8Y73v7oNJ_yp9Tz.Q1A2M.lDPvMSs1bt.GycI',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5',
              'Accept-Encoding': 'gzip, deflate, br',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': 'same-origin',
              'Sec-Fetch-User': '?1',
              'Upgrade-Insecure-Requests': '1',
              'sec-ch-ua': '"Chromium";v="135", "Google Chrome";v="135", "Not-A.Brand";v="99"',
              'sec-ch-ua-mobile': '?0',
              'sec-ch-ua-platform': '"Windows"',
              'Referer': targetUrl.origin + '/',
              'Origin': targetUrl.origin,
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

          const triggerPuppeteer = () => {
            console.warn(`[Proxy] Cloudflare challenge/block detected for ${targetRaw} - Puppeteer fallback...`);
            
            // 1. Return cached HTML if fresh
            const cached = htmlCache.get(targetRaw);
            const ttl = targetRaw.includes('ajax=chapters') ? 300000 : 60000;
            if (cached && Date.now() - cached.t < ttl) {
                if (!res.headersSent) {
                    res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/html; charset=utf-8' });
                }
                res.end(cached.html);
                return;
            }

            // 2. Dedupe concurrent same-URL requests
            if (solvingCache.has(targetRaw)) {
                solvingCache.get(targetRaw)!.then(html => {
                    if (!res.writableEnded) {
                        if (!res.headersSent) {
                            res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/html; charset=utf-8' });
                        }
                        res.end(html);
                    }
                }).catch(() => { if (!res.writableEnded) res.destroy(); });
                return;
            }

            // 3. Detect client disconnect → abort early
            let clientGone = false;
            req.on('close', () => { clientGone = true; });

            const solvePromise = (async (): Promise<string> => {
                const browser = await getBrowser();
                const page = await browser.newPage();
                const domain = targetUrl.hostname;
                const cachedCookies = cookieJar.get(domain);
                if (cachedCookies) await page.setCookie(...cachedCookies);
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                await page.goto(targetRaw, { waitUntil: 'networkidle2', timeout: 45000 });
                const cookies = await page.cookies();
                cookieJar.set(domain, cookies); // ← persist cf_clearance!
                const html = await page.content();
                await page.close();
                htmlCache.set(targetRaw, { html, t: Date.now() });
                return html;
            })();

            solvingCache.set(targetRaw, solvePromise);
            solvePromise.then(html => {
                solvingCache.delete(targetRaw);
                if (clientGone) return; // ← don't waste bandwidth
                if (!res.writableEnded) {
                    if (!res.headersSent) {
                        res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/html; charset=utf-8' });
                    }
                    res.end(html);
                }
            }).catch(err => {
                solvingCache.delete(targetRaw);
                if (!res.writableEnded) {
                    if (!res.headersSent) {
                        res.writeHead(502, { 'Content-Type': 'text/plain' });
                    }
                    res.end(`Puppeteer failed: ${err.message}`);
                }
            });
          };

          const proxyReq = transport.request(options, (proxyRes) => {
            const status = proxyRes.statusCode || 200;
            const isBlockedStatus = status === 403 || status === 503;
            const contentType = proxyRes.headers['content-type'] || '';
            const encoding = proxyRes.headers['content-encoding'];

            // Handle redirects
            if (status >= 300 && status < 400 && proxyRes.headers.location) {
              let redirectUrl = proxyRes.headers.location;
              if (redirectUrl.startsWith('/')) {
                redirectUrl = targetUrl.origin + redirectUrl;
              }
              res.writeHead(status, { 
                'Location': `/api/proxy?url=${encodeURIComponent(redirectUrl)}`,
                'Access-Control-Allow-Origin': '*'
              });
              res.end();
              return;
            }

            if (isBlockedStatus) {
                return triggerPuppeteer();
            }

            if (status >= 400) {
              console.warn(`[Proxy] ${status} from ${targetRaw}`);
            }

            const responseHeaders: Record<string, string | string[]> = {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': contentType || 'text/html; charset=utf-8',
            };
            if (encoding && !['gzip', 'br', 'deflate'].includes(encoding)) {
              responseHeaders['Content-Encoding'] = encoding;
            }
            
            const handleError = (err: Error) => {
              console.warn('[Proxy] Decompression error:', err.message);
              if (!res.writableEnded) res.end();
            };

            let decodedStream: import('stream').Readable = proxyRes;
            if (encoding === 'gzip') decodedStream = proxyRes.pipe(zlib.createGunzip().on('error', handleError));
            else if (encoding === 'br') decodedStream = proxyRes.pipe(zlib.createBrotliDecompress().on('error', handleError));
            else if (encoding === 'deflate') decodedStream = proxyRes.pipe(zlib.createInflate().on('error', handleError));
            
            if (status === 200 && contentType.includes('text/html')) {
                let chunks: Buffer[] = [];
                decodedStream.on('data', chunk => chunks.push(chunk));
                decodedStream.on('end', () => {
                    const htmlBuffer = Buffer.concat(chunks).toString('utf-8');
                    const probe = htmlBuffer.slice(0, 4096);
                    const isChallenge = /cf-browser-verification|Just a moment|Verifying you are human|cf-challenge|Attention Required|blocked by Cloudflare|__CF\$cv\$params|challenge-platform/i.test(probe);
                    
                    if (isChallenge) {
                        triggerPuppeteer();
                    } else {
                        res.writeHead(status, responseHeaders);
                        res.end(htmlBuffer);
                    }
                });
            } else {
                res.writeHead(status, responseHeaders);
                decodedStream.pipe(res);
            }
          });

          proxyReq.on('error', (err: any) => {
            console.error('[Proxy] Error:', err.message);
            if (err.code === 'ECONNRESET' || err.message.includes('ECONNRESET')) {
              return triggerPuppeteer();
            }
            if (!res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'text/plain' });
            }
            res.end(`Proxy error: ${err.message}`);
          });

          proxyReq.setTimeout(60000, () => {
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
