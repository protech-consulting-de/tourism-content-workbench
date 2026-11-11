import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {Catalogue, sourceRecord} from './model.mjs';

const assets = new Map([['/', ['index.html', 'text/html']], ['/ui.mjs', ['ui.mjs', 'text/javascript']], ['/style.css', ['style.css', 'text/css']]]);
function json(res, status, data, type = 'application/json') {
  res.writeHead(status, {'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store'});
  res.end(JSON.stringify(data));
}
async function readBody(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 8000) throw new Error('Anfrage zu groß.');
  }
  return JSON.parse(body);
}

export function makeServer() {
  const catalogue = new Catalogue();
  const id = 'panoramapunkt';
  catalogue.importSource(sourceRecord(1));
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const {pathname, searchParams} = url;
      if (req.method === 'GET' && assets.has(pathname)) {
        const [file, type] = assets.get(pathname);
        const content = await readFile(new URL(file, import.meta.url));
        res.writeHead(200, {'Content-Type': type + '; charset=utf-8'});
        return res.end(content);
      }
      if (req.method === 'GET' && pathname === '/api/v1/editor') {
        return json(res, 200, {source: catalogue.sources.get(id), events: catalogue.events});
      }
      if (req.method === 'GET' && pathname === '/api/v1/poi/' + id) {
        const data = catalogue.deliver(searchParams.get('tenant'), searchParams.get('station'), searchParams.get('lang'), id);
        return json(res, 200, data, 'application/ld+json');
      }
      if (req.method === 'POST' && ['/api/v1/import', '/api/v1/override'].includes(pathname)) {
        if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || '')
            || (req.headers.origin && req.headers.origin !== 'http://' + req.headers.host)
            || req.headers['content-type'] !== 'application/json') return json(res, 403, {error: 'Nur lokaler JSON-Zugriff.'});
        const body = await readBody(req);
        if (pathname.endsWith('/import')) {
          return json(res, 200, {result: catalogue.importSource(sourceRecord(body.version))});
        }
        catalogue.saveOverride(body.tenant, body.station, body.language, id, body.text);
        return json(res, 200, {result: 'gespeichert'});
      }
      return json(res, 404, {error: 'Unbekannte Adresse.'});
    } catch (error) {
      return json(res, 400, {error: error.message});
    }
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 4173);
  const server = makeServer();
  server.listen(port, '127.0.0.1', () => console.log('Tourismusredaktion: http://127.0.0.1:' + server.address().port));
}
