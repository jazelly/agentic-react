// Tiny SPA static server for bundlers without a preview command (webpack5). usage: static-server.mjs <dir> <port>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const [dir, port] = [path.resolve(process.argv[2]), Number(process.argv[3])];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.map': 'application/json' };
http.createServer((req, res) => {
  let p = path.join(dir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(dir)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) p = fs.existsSync(path.join(p, 'index.html')) ? path.join(p, 'index.html') : path.join(dir, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`static ${dir} on ${port}`));
