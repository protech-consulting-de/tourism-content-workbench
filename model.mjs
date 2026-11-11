export const stations = new Map([
  ['nord', new Map([['markt', 'Marktplatz'], ['bahnhof', 'Bahnhof']])],
  ['tal', new Map([['zentrum', 'Ortsmitte']])]
]);
export const languages = ['de', 'en', 'nl'];
const concepts = new Map([['urn:demo:skos:aussichtspunkt', 'TouristAttraction']]);

export function sourceRecord(version) {
  if (![1, 2].includes(version)) throw new Error('Unbekannte Quellversion.');
  const descriptions = version === 1
    ? {de: 'Der Rundweg beginnt am unteren Tor.', en: 'The circular trail starts at the lower gate.', nl: 'De rondwandeling begint bij de onderste poort.'}
    : {de: 'Der Rundweg beginnt jetzt am oberen Tor.', en: 'The circular trail now starts at the upper gate.', nl: 'De rondwandeling begint nu bij de bovenste poort.'};
  return {
    id: 'panoramapunkt', version, concept: 'urn:demo:skos:aussichtspunkt',
    name: {de: 'Panoramapunkt am Mühlenweg', en: 'Mill Trail Viewpoint', nl: 'Uitzichtpunt aan het Molenpad'},
    descriptions
  };
}

export class Catalogue {
  constructor() {
    this.sources = new Map();
    this.overrides = new Map();
    this.events = [];
  }
  record(event) {
    this.events.push({sequence: this.events.length + 1, ...event});
  }
  importSource(input) {
    if (!input || typeof input.id !== 'string' || !/^[a-z0-9-]+$/.test(input.id)
        || !Number.isSafeInteger(input.version) || input.version < 1 || !concepts.has(input.concept)) {
      throw new Error('Ungültige Quellkennung, Version oder Klassifikation.');
    }
    const source = {id: input.id, version: input.version, concept: input.concept, name: {}, descriptions: {}};
    for (const language of languages) {
      for (const field of ['name', 'descriptions']) {
        const value = input[field]?.[language];
        if (typeof value !== 'string' || !value.trim()) throw new Error('Fehlender lokalisierter Inhalt.');
        source[field][language] = value.trim();
      }
    }
    const prior = this.sources.get(source.id);
    if (prior && source.version < prior.version) throw new Error('Veraltete Quelle.');
    if (prior && source.version === prior.version) {
      if (JSON.stringify(source) !== JSON.stringify(prior)) throw new Error('Versionskonflikt.');
      return 'unverändert';
    }
    this.sources.set(source.id, source);
    this.record({action: 'Import', id: source.id, sourceVersion: source.version});
    return prior ? 'aktualisiert' : 'angelegt';
  }
  scope(tenant, station, language, id) {
    if (!stations.get(tenant)?.has(station) || !languages.includes(language) || !this.sources.has(id)) {
      throw new Error('Unbekannter Standort, Mandant, Inhalt oder Sprache.');
    }
    return JSON.stringify([tenant, station, language, id]);
  }
  saveOverride(tenant, station, language, id, value) {
    const key = this.scope(tenant, station, language, id);
    if (typeof value !== 'string' || value.length > 400) throw new Error('Maximal 400 Zeichen.');
    const text = value.trim();
    if (text === (this.overrides.get(key) ?? '')) return;
    if (text) this.overrides.set(key, text);
    else this.overrides.delete(key);
    this.record({action: text ? 'Lokal veröffentlicht' : 'Lokale Fassung entfernt', tenant, station, language, id});
  }
  deliver(tenant, station, language, id) {
    const key = this.scope(tenant, station, language, id);
    const source = this.sources.get(id);
    return {
      '@context': 'https://schema.org', '@type': concepts.get(source.concept),
      '@id': 'urn:demo:poi:' + id, name: source.name[language],
      description: this.overrides.get(key) ?? source.descriptions[language],
      additionalType: source.concept,
      additionalProperty: [
        { '@type': 'PropertyValue', name: 'source_version', value: source.version },
        { '@type': 'PropertyValue', name: 'description_origin', value: this.overrides.has(key) ? 'editorial' : 'source' }
      ]
    };
  }
}
