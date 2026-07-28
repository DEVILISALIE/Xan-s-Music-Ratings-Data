const http = require('http');
const fs = require('fs');
const path = require('path');
const sourceRoot = path.join(__dirname, 'desktop-ui');

const mime = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const relativePath = url === '/' ? 'index.html' : url.slice(1);
  const filePath = path.resolve(sourceRoot, relativePath);
  if (!filePath.startsWith(sourceRoot + path.sep) && filePath !== sourceRoot) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'text/plain' });
    res.end(data);
  });
});

server.listen(3000, () => {
  console.log('Dev server running at http://localhost:3000');
});
