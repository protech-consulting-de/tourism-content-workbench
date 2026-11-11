import {strict as assert} from 'node:assert';
import {test} from 'node:test';
import {Catalogue, sourceRecord} from './model.mjs';
import {makeServer} from './server.mjs';

const id = 'panoramapunkt';
function sample() {
  const catalogue = new Catalogue();
  catalogue.importSource(sourceRecord(1));
  return catalogue;
}
test('Ein lokales Feld überlebt einen Reimport; andere Sprach- und Standortfassungen aktualisieren sich', () => {
  const c = sample();
  c.saveOverride('nord', 'markt', 'de', id, 'Treffpunkt am Infostand.');
  c.importSource(sourceRecord(2));
  assert.equal(c.deliver('nord','markt','de',id).description, 'Treffpunkt am Infostand.');
  for (const scope of [['nord','markt','nl'], ['nord','bahnhof','de'], ['tal','zentrum','de']]) {
    assert.equal(c.deliver(...scope,id).description, sourceRecord(2).descriptions[scope[2]]);
  }
  assert.equal(c.sources.size,1);
  c.saveOverride('nord','markt','de',id,'');
  assert.equal(c.deliver('nord','markt','de',id).description,sourceRecord(2).descriptions.de);
});
test('Erneute Lieferung derselben Version erzeugt keinen Eintrag; Konflikte verändern die Daten nicht', () => {
  const c = sample(); c.importSource(sourceRecord(2));
  assert.equal(c.importSource(sourceRecord(2)), 'unverändert');
  assert.equal(c.events.length,2);
  const inconsistent = sourceRecord(2); inconsistent.descriptions.en = 'Wrong version';
  assert.throws(() => c.importSource(inconsistent), /Versionskonflikt/);
  assert.throws(() => c.importSource(sourceRecord(1)), /Veraltete/);
  assert.deepEqual(c.sources.get(id), sourceRecord(2));
});
test('Nicht zugeordnete Begriffe, ungültige Daten und fremde Standortzuordnung werden abgewiesen', () => {
  const c = sample();
  const unknown = sourceRecord(2); unknown.concept = 'unknown';
  assert.throws(() => c.importSource(unknown));
  const incomplete = sourceRecord(2); delete incomplete.descriptions.nl;
  assert.throws(() => c.importSource(incomplete));
  assert.throws(() => c.deliver('nord','zentrum','de',id));
  assert.throws(() => c.deliver('nord','markt','fr',id));
  assert.throws(() => c.saveOverride('nord','markt','de',id,'x'.repeat(401)));
  assert.equal(c.events.length,1);
  assert.equal(c.deliver('nord','markt','de',id)['@type'],'TouristAttraction');
});
test('Die lokale HTTP-Schnittstelle liefert den publizierten Text und seine Herkunft', async t => {
  const server = makeServer();
  await new Promise((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  t.after(() => new Promise(resolve => {server.close(resolve);server.closeAllConnections();}));
  const base = 'http://127.0.0.1:' + server.address().port;
  const path = '/api/v1/poi/' + id + '?tenant=nord&station=markt&lang=de';
  const content = 'Aktuelle Meldung.';
  const payload = {tenant:'nord',station:'markt',language:'de',text:content};
  const options = {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)};
  assert.equal((await fetch(base + '/api/v1/override',options)).status,200);
  assert.equal((await fetch(base + '/api/v1/import',{...options,body:'{"version":2}'})).status,200);
  const result = await fetch(base + path);
  assert.match(result.headers.get('content-type'), /application\/ld\+json/);
  const data = await result.json();
  assert.equal(data.description,content);
  assert.deepEqual(data.additionalProperty.map(p => p.value), [2,'editorial']);
  assert.equal((await fetch(base + '/api/v1/override',{...options,headers:{...options.headers,Origin:'https://example.invalid'}})).status,403);
  assert.equal((await fetch(base + '/api/v1/poi/' + id + '?tenant=tal&station=markt&lang=de')).status,400);
});
