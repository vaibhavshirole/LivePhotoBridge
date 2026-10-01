const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || '3000', 10);
const bundles = new Map(); // id -> { buffer, filename, createdAt }

// Cleanup expired bundles after 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, item] of bundles.entries()) {
    if (now - item.createdAt > 30 * 60 * 1000) {
      bundles.delete(id);
    }
  }
}, 60 * 1000);

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.heic': 'image/heic',
  '.svg': 'image/svg+xml',
  '.zip': 'application/zip',
};

const server = http.createServer((req, res) => {
  const localIp = getLocalIp();
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${pathname}`);

  // CORS headers for local network testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Filename');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API: Get Local Network IP & URL
  if (req.method === 'GET' && pathname === '/api/network-ip') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ip: localIp,
      port: PORT,
      url: `http://${localIp}:${PORT}`
    }));
    return;
  }

  // API: Upload ZIP Bundle for QR code sharing
  if (req.method === 'POST' && pathname === '/api/bundle') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      const id = crypto.randomBytes(6).toString('hex');
      const filename = req.headers['x-filename'] || 'MotionPhotos.zip';

      bundles.set(id, {
        buffer,
        filename,
        createdAt: Date.now()
      });

      const downloadUrl = `http://${localIp}:${PORT}/download/${id}`;
      console.log(`[Bundle Created] ID: ${id}, Size: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB`);
      console.log(`[Mobile QR URL] -> ${downloadUrl}`);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        id,
        downloadUrl,
        size: buffer.length
      }));
    });
    return;
  }

  // API: Download Bundle (Scanned via mobile QR code)
  if ((req.method === 'GET' || req.method === 'HEAD') && pathname.startsWith('/download/')) {
    const id = pathname.replace('/download/', '').trim();
    const bundle = bundles.get(id);

    if (!bundle) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Download Expired</title>
        <style>body { font-family: -apple-system, sans-serif; background: #0f1117; color: #fff; text-align: center; padding: 40px 20px; }</style>
        </head>
        <body>
          <h2>Bundle Not Found or Expired</h2>
          <p style="color: #9ca3af;">Please re-generate the package from the desktop browser.</p>
        </body>
        </html>
      `);
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Length': bundle.buffer.length,
      'Content-Disposition': `attachment; filename="${bundle.filename}"`
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    res.end(bundle.buffer);
    return;
  }

  // Static File Serving
  let relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  const localIp = getLocalIp();
  console.log(`\n=================================================`);
  console.log(`🚀 LivePhotoBridge Web Server Active`);
  console.log(`─────────────────────────────────────────────────`);
  console.log(`  Local URL   : http://localhost:${PORT}`);
  console.log(`  Network URL : http://${localIp}:${PORT}`);
  console.log(`=================================================\n`);
});
