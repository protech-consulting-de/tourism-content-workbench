const field = id => document.getElementById(id);
const stationNames = {nord: {markt: 'Marktplatz', bahnhof: 'Bahnhof'}, tal: {zentrum: 'Ortsmitte'}};
const itemId = 'panoramapunkt';
class TourismPoi extends HTMLElement {
  show(data, language) {
    this.lang = language;
    const name = document.createElement('h3');
    name.textContent = data.name;
    const description = document.createElement('p');
    description.textContent = data.description;
    this.replaceChildren(name, description);
  }
}
customElements.define('tourism-poi', TourismPoi);
function stationsForTenant() {
  field('station').replaceChildren(...Object.entries(stationNames[field('tenant').value]).map(([id, name]) => new Option(name, id)));
}
let revision = 0;
async function request(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Daten konnten nicht geladen werden.');
  return data;
}
async function refresh() {
  const seq = ++revision;
  const tenant = field('tenant').value, station = field('station').value, lang = field('language').value;
  const url = '/api/v1/poi/' + itemId + '?' + new URLSearchParams({tenant, station, lang});
  const [editor, data] = await Promise.all([request('/api/v1/editor'), request(url)]);
  if (seq !== revision) return;
  const local = data.additionalProperty.find(item => item.name === 'description_origin').value === 'editorial';
  field('source').textContent = editor.source.descriptions[lang];
  field('source').lang = lang;
  field('version').textContent = 'Version ' + editor.source.version;
  field('override').value = local ? data.description : '';
  field('override').lang = lang;
  field('channel').textContent = stationNames[tenant][station] + ' · ' + lang.toUpperCase();
  document.querySelector('tourism-poi').show(data, lang);
  field('origin').textContent = local ? 'Angezeigt wird der lokale Hinweis.' : 'Angezeigt wird der importierte Hinweis.';
  field('api').href = url;
  field('events').replaceChildren(...editor.events.map(event => {
    const line = document.createElement('li');
    const details = event.sourceVersion ? 'Quelle v' + event.sourceVersion : [event.tenant, event.station, event.language].join(' / ');
    line.textContent = event.action + ' · ' + details;
    return line;
  }));
}
function errorMessage(error) { field('status').textContent = error.message; }
async function write(url, body, message) {
  const controls = [...document.querySelectorAll('button, select, textarea')];
  controls.forEach(control => control.disabled = true);
  try {
    const result = await request(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)});
    await refresh();
    field('status').textContent = message(result);
  } catch (error) { errorMessage(error); }
  finally { controls.forEach(control => control.disabled = false); }
}
field('tenant').addEventListener('change', () => { stationsForTenant(); field('status').textContent = ''; refresh().catch(errorMessage); });
for (const id of ['station','language']) field(id).addEventListener('change', () => { field('status').textContent = ''; refresh().catch(errorMessage); });
field('edit').addEventListener('submit', event => {
  event.preventDefault();
  const text = field('override').value.trim();
  write('/api/v1/override', {tenant:field('tenant').value,station:field('station').value,language:field('language').value,text},
    () => text ? 'Lokaler Hinweis veröffentlicht.' : 'Der Standort verwendet den importierten Hinweis.');
});
field('import').addEventListener('click', () => write('/api/v1/import', {version:2}, data => 'Quellversion 2: ' + data.result + '.'));
stationsForTenant();
refresh().catch(errorMessage);
