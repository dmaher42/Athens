const DEFAULT_GEOJSON_URL = './data/athens_places.geojson';
const PLEIADES_BASE_URL = 'https://pleiades.stoa.org/places/';
const DEFAULT_ASC_SA_SEARCH_BASE = 'https://agora.ascsa.net/id/search?q=';
const PANEL_CLASS = 'athens-lore-panel';
const PANEL_VISIBLE_CLASS = 'athens-lore-panel--visible';
const DEFAULT_CONTEXT_FALLBACK_PREFIX = 'Context for';

const DEFAULT_CONTEXT_OVERRIDES = {
    'acropolis of athens': 'The Acropolis crowns Athens with sanctuaries devoted to Athena, culminating in the Parthenon. Its fortified plateau anchors civic religion and dominates the skyline.',
    'agora of athens (ancient agora)': 'The Agora formed the civic heart of the city where Athenians traded, worshipped, and debated policy. Stoas, shrines, and law courts framed the open square.',
    'pnyx': 'The Pnyx hillside served as the democratic assembly ground of the ekklesia. A carved speaker\'s platform faces the city and the Acropolis beyond.',
    'areopagus (areios pagos)': 'This rocky hill west of the Acropolis hosted the Areopagus council and homicide courts. Sanctuaries of the Erinyes and other deities dotted its slopes.',
    'kerameikos': 'Kerameikos blended the potters\' quarter with Athens\' principal cemetery along the Sacred Way. The Dipylon and Sacred Gates pierced the city walls here.',
    'peiraieus / piraeus': 'Piraeus became Athens\' bustling naval and commercial harbor. Long Walls linked it to the city, sheltering fleets, warehouses, and marketplaces.',
    'phaleron': 'Phaleron functioned as Athens\' earlier harbor before Piraeus took precedence. It remained a secondary anchorage and coastal deme on the Saronic Gulf.'
};

function normalizeKey(value) {
    if (!value || typeof value !== 'string') {
        return '';
    }
    return value
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[\u2019']/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

function toArray(value) {
    if (Array.isArray(value)) {
        return value;
    }
    if (value === undefined || value === null) {
        return [];
    }
    return [value];
}

function uniqueByUrl(entries) {
    const seen = new Set();
    const result = [];
    for (const entry of entries) {
        if (!entry || !entry.url) {
            continue;
        }
        const key = entry.url.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        result.push(entry);
    }
    return result;
}

function buildAscsaSearchUrl(name) {
    if (!name) {
        return null;
    }
    return `${DEFAULT_ASC_SA_SEARCH_BASE}${encodeURIComponent(name)}`;
}

function resolveContext(name, properties, overrides) {
    const firstMatch = (candidate) => {
        if (Array.isArray(candidate)) {
            return candidate.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean).join(' ');
        }
        if (candidate && typeof candidate === 'object') {
            const values = [];
            for (const value of Object.values(candidate)) {
                if (typeof value === 'string' && value.trim()) {
                    values.push(value.trim());
                }
            }
            if (values.length) {
                return values.join(' ');
            }
            return '';
        }
        if (typeof candidate === 'string') {
            return candidate.trim();
        }
        return '';
    };

    const props = properties ?? {};
    const contextKeys = ['context', 'summary', 'description', 'note', 'notes'];
    for (const key of contextKeys) {
        const value = props[key];
        const resolved = firstMatch(value);
        if (resolved) {
            return resolved;
        }
    }

    const normalizedName = normalizeKey(name);
    if (normalizedName && overrides[normalizedName]) {
        return overrides[normalizedName];
    }

    const sourceText = firstMatch(props.source);
    if (sourceText && sourceText.length <= 160) {
        return sourceText;
    }

    if (name) {
        return `${DEFAULT_CONTEXT_FALLBACK_PREFIX} ${name} will be added soon as research continues.`;
    }
    return 'Additional context will be added soon as research continues.';
}

function extractStrings(value) {
    if (!value) {
        return [];
    }
    const values = [];
    if (typeof value === 'string') {
        values.push(value);
    } else if (Array.isArray(value)) {
        for (const item of value) {
            if (typeof item === 'string') {
                values.push(item);
            }
        }
    }
    return values;
}

function normalizeUrl(url) {
    if (typeof url !== 'string') {
        return '';
    }
    const trimmed = url.trim();
    if (!trimmed) {
        return '';
    }
    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }
    return '';
}

function buildPleiadesEntry(id, uri) {
    if (uri) {
        return { type: 'pleiades', url: uri, label: id ? `Pleiades ${id}` : 'Pleiades' };
    }
    if (id) {
        return { type: 'pleiades', url: `${PLEIADES_BASE_URL}${id}`, label: `Pleiades ${id}` };
    }
    return null;
}

function coerceAscsaUrl(candidate, urlBuilder) {
    if (!candidate) {
        return '';
    }
    if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (!trimmed) {
            return '';
        }
        const normalized = normalizeUrl(trimmed);
        if (normalized) {
            return normalized;
        }
        if (typeof urlBuilder === 'function') {
            const built = urlBuilder(trimmed);
            return normalizeUrl(built) || '';
        }
    }
    return '';
}

function gatherAscsaSources(properties, name, urlBuilder, fallbackBuilder) {
    const props = properties ?? {};
    const candidateKeys = [
        'ascsa_uri',
        'ascsa_url',
        'ascsaUris',
        'ascsaUrls',
        'ascsa_refs',
        'ascsaRefs',
        'ascsa_sources',
        'ascsaSources',
        'ascsa'
    ];
    const ascsaUrls = [];
    for (const key of candidateKeys) {
        const values = toArray(props[key]);
        for (const value of values) {
            const url = coerceAscsaUrl(value, urlBuilder);
            if (url) {
                ascsaUrls.push({ type: 'ascsa', url, label: 'ASCSA Digital Resource' });
            }
        }
    }
    const ascsaId = props.ascsa_id ?? props.ascsaId;
    if (ascsaId) {
        const url = coerceAscsaUrl(String(ascsaId), urlBuilder);
        if (url) {
            ascsaUrls.push({ type: 'ascsa', url, label: 'ASCSA Digital Resource' });
        }
    }

    const structuredSources = Array.isArray(props.sources) ? props.sources : [];
    for (const entry of structuredSources) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const type = entry.type ?? entry.kind ?? '';
        if (typeof type === 'string' && type.toLowerCase().includes('ascsa')) {
            const url = coerceAscsaUrl(entry.url ?? entry.href ?? entry.link, urlBuilder);
            if (url) {
                const label = entry.label ?? entry.title ?? 'ASCSA Digital Resource';
                ascsaUrls.push({ type: 'ascsa', url, label });
            }
        }
    }

    if (!ascsaUrls.length && typeof fallbackBuilder === 'function') {
        const fallbackUrl = fallbackBuilder(name, props);
        const normalizedFallback = normalizeUrl(fallbackUrl ?? '');
        if (normalizedFallback) {
            ascsaUrls.push({
                type: 'ascsa',
                url: normalizedFallback,
                label: 'ASCSA Digital Library (search)',
                isFallback: true
            });
        }
    }

    return ascsaUrls;
}

class LorePinsPanel {
    constructor({
        overlay,
        geoJsonUrl,
        fetchImpl,
        domWindow,
        domDocument,
        panelParent,
        contextOverrides = {},
        clickMoveTolerance = 6,
        clickTimeTolerance = 400,
        hitRadius = 16,
        ascsaUrlBuilder,
        ascsaSearchBuilder
    } = {}) {
        if (!overlay || !overlay.canvas) {
            throw new Error('LorePinsPanel requires a LandmarkOverlay instance with a canvas element.');
        }
        this.overlay = overlay;
        this.canvas = overlay.canvas;
        this.geoJsonUrl = geoJsonUrl ?? overlay.options?.geoJsonUrl ?? DEFAULT_GEOJSON_URL;
        this.fetchImpl = fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : undefined);
        this.window = domWindow ?? (typeof window !== 'undefined' ? window : undefined);
        this.document = domDocument ?? (typeof document !== 'undefined' ? document : undefined);
        this.panelParent = panelParent ?? this.document?.body ?? null;
        this.contextOverrides = { ...DEFAULT_CONTEXT_OVERRIDES, ...normalizeContextOverrides(contextOverrides) };
        this.clickMoveTolerance = clickMoveTolerance;
        this.clickTimeTolerance = clickTimeTolerance;
        this.hitRadius = hitRadius;
        this.ascsaUrlBuilder = ascsaUrlBuilder;
        this.ascsaSearchBuilder = ascsaSearchBuilder ?? buildAscsaSearchUrl;

        this.panel = null;
        this.titleEl = null;
        this.contextEl = null;
        this.metaEl = null;
        this.sourcesListEl = null;
        this.closeButton = null;
        this._pointerState = null;
        this._featureRecordsByKey = new Map();
        this._featureRecords = [];
        this._initialized = false;
        this._destroyed = false;
    }

    async initialize() {
        if (this._initialized) {
            return this;
        }
        if (!this.document) {
            throw new Error('LorePinsPanel requires a DOM document to render into.');
        }
        if (!this.panelParent) {
            throw new Error('LorePinsPanel could not determine a parent element for the info panel.');
        }
        if (typeof this.fetchImpl !== 'function') {
            throw new Error('LorePinsPanel requires a fetch implementation to load GeoJSON data.');
        }
        this._createPanel();
        await this._loadFeatureData();
        this._bindEvents();
        this._initialized = true;
        return this;
    }

    destroy() {
        if (this._destroyed) {
            return;
        }
        this._destroyed = true;
        this._unbindEvents();
        if (this.panel && this.panel.parentNode) {
            this.panel.parentNode.removeChild(this.panel);
        }
        this.panel = null;
        this.titleEl = null;
        this.contextEl = null;
        this.metaEl = null;
        this.sourcesListEl = null;
        this.closeButton = null;
        this._featureRecords = [];
        this._featureRecordsByKey.clear();
    }

    hide() {
        if (!this.panel) {
            return;
        }
        this.panel.style.display = 'none';
        this.panel.classList.remove(PANEL_VISIBLE_CLASS);
        this.panel.setAttribute('aria-hidden', 'true');
    }

    _createPanel() {
        if (!this.document) {
            return;
        }
        const panel = this.document.createElement('aside');
        panel.className = PANEL_CLASS;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-live', 'polite');
        panel.setAttribute('aria-hidden', 'true');
        panel.style.position = 'fixed';
        panel.style.maxWidth = '320px';
        panel.style.minWidth = '260px';
        panel.style.background = 'rgba(18, 24, 36, 0.94)';
        panel.style.color = '#fdf6df';
        panel.style.borderRadius = '12px';
        panel.style.border = '1px solid rgba(208, 179, 122, 0.9)';
        panel.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.45)';
        panel.style.padding = '16px 18px 18px';
        panel.style.display = 'none';
        panel.style.zIndex = '320';
        panel.style.pointerEvents = 'auto';
        panel.style.backdropFilter = 'blur(6px)';
        panel.style.WebkitBackdropFilter = 'blur(6px)';

        const header = this.document.createElement('div');
        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.gap = '12px';
        header.style.marginBottom = '8px';

        const title = this.document.createElement('h3');
        title.style.margin = '0';
        title.style.fontFamily = '"Cinzel", serif';
        title.style.fontSize = '20px';
        title.style.fontWeight = '600';
        title.style.letterSpacing = '0.5px';
        title.style.color = '#ffd37a';
        title.style.flex = '1 1 auto';

        const close = this.document.createElement('button');
        close.type = 'button';
        close.textContent = '×';
        close.setAttribute('aria-label', 'Close landmark details');
        close.style.background = 'rgba(255, 215, 128, 0.12)';
        close.style.border = '1px solid rgba(255, 215, 128, 0.35)';
        close.style.color = '#fdf6df';
        close.style.fontSize = '18px';
        close.style.lineHeight = '1';
        close.style.padding = '2px 8px';
        close.style.borderRadius = '6px';
        close.style.cursor = 'pointer';
        close.style.transition = 'background 0.2s ease, transform 0.2s ease';
        close.addEventListener('pointerenter', () => {
            close.style.background = 'rgba(255, 215, 128, 0.3)';
            close.style.transform = 'scale(1.05)';
        });
        close.addEventListener('pointerleave', () => {
            close.style.background = 'rgba(255, 215, 128, 0.12)';
            close.style.transform = 'scale(1)';
        });
        close.addEventListener('click', () => this.hide());

        header.appendChild(title);
        header.appendChild(close);

        const context = this.document.createElement('p');
        context.style.margin = '0 0 12px';
        context.style.fontFamily = '"Cormorant Garamond", serif';
        context.style.fontSize = '15px';
        context.style.lineHeight = '1.45';
        context.style.color = 'rgba(253, 246, 223, 0.92)';
        context.style.whiteSpace = 'pre-line';

        const meta = this.document.createElement('div');
        meta.style.margin = '0 0 12px';
        meta.style.fontFamily = '"Cinzel", serif';
        meta.style.fontSize = '13px';
        meta.style.color = '#bba47c';
        meta.style.letterSpacing = '0.35px';

        const sourcesHeader = this.document.createElement('h4');
        sourcesHeader.textContent = 'Sources';
        sourcesHeader.style.margin = '0 0 6px';
        sourcesHeader.style.fontFamily = '"Cinzel", serif';
        sourcesHeader.style.fontSize = '14px';
        sourcesHeader.style.letterSpacing = '0.6px';
        sourcesHeader.style.fontWeight = '600';
        sourcesHeader.style.textTransform = 'uppercase';
        sourcesHeader.style.color = '#d5bb88';

        const list = this.document.createElement('ul');
        list.style.listStyle = 'none';
        list.style.padding = '0';
        list.style.margin = '0';
        list.style.display = 'flex';
        list.style.flexDirection = 'column';
        list.style.gap = '6px';

        panel.appendChild(header);
        panel.appendChild(context);
        panel.appendChild(meta);
        panel.appendChild(sourcesHeader);
        panel.appendChild(list);

        this.panelParent.appendChild(panel);

        this.panel = panel;
        this.titleEl = title;
        this.contextEl = context;
        this.metaEl = meta;
        this.sourcesListEl = list;
        this.closeButton = close;
    }

    async _loadFeatureData() {
        if (this._featureRecords.length) {
            return this._featureRecords;
        }
        const response = await this.fetchImpl(this.geoJsonUrl);
        if (!response || typeof response.json !== 'function') {
            throw new Error('LorePinsPanel received an invalid response when loading GeoJSON data.');
        }
        if (!response.ok) {
            throw new Error(`LorePinsPanel failed to load GeoJSON data (${response.status})`);
        }
        const data = await response.json();
        const features = Array.isArray(data?.features) ? data.features : [];
        for (const feature of features) {
            if (!feature || typeof feature !== 'object') {
                continue;
            }
            const geometry = feature.geometry ?? {};
            if (!geometry || geometry.type !== 'Point') {
                continue;
            }
            const properties = feature.properties ?? {};
            const name = properties.title ?? properties.name;
            if (!name) {
                continue;
            }
            const record = this._createFeatureRecord(name, properties, feature);
            this._featureRecords.push(record);
            const key = normalizeKey(name);
            if (key) {
                this._featureRecordsByKey.set(key, record);
            }
            const aliasKeys = this._collectAliasKeys(properties);
            for (const aliasKey of aliasKeys) {
                if (aliasKey && !this._featureRecordsByKey.has(aliasKey)) {
                    this._featureRecordsByKey.set(aliasKey, record);
                }
            }
        }
        return this._featureRecords;
    }

    _collectAliasKeys(properties) {
        const props = properties ?? {};
        const aliases = [];
        const aliasFields = ['alternate_names', 'alternateNames', 'aliases', 'labels'];
        for (const key of aliasFields) {
            for (const value of toArray(props[key])) {
                if (typeof value === 'string') {
                    const normalized = normalizeKey(value);
                    if (normalized) {
                        aliases.push(normalized);
                    }
                }
            }
        }
        return aliases;
    }

    _createFeatureRecord(name, properties, feature) {
        const props = properties ?? {};
        const pleiadesId = props.pleiades_id ?? props.pleiadesId ?? null;
        const pleiadesUri = normalizeUrl(props.pleiades_uri ?? props.pleiadesUri ?? '');
        const context = resolveContext(name, props, this.contextOverrides);

        const sources = [];
        const pleiadesPrimary = buildPleiadesEntry(pleiadesId, pleiadesUri);
        if (pleiadesPrimary) {
            sources.push(pleiadesPrimary);
        }
        const pleiadesRefs = extractStrings(props.pleiades_refs ?? props.pleiadesRefs);
        for (const ref of pleiadesRefs) {
            if (ref && ref !== pleiadesId) {
                const extraEntry = buildPleiadesEntry(ref, '');
                if (extraEntry) {
                    sources.push(extraEntry);
                }
            }
        }

        const ascsaSources = gatherAscsaSources(
            props,
            name,
            this.ascsaUrlBuilder,
            (labelName, featureProps) => {
                if (typeof this.ascsaSearchBuilder === 'function') {
                    return this.ascsaSearchBuilder(labelName, featureProps);
                }
                return null;
            }
        );
        sources.push(...ascsaSources);

        const additionalSources = Array.isArray(props.sources)
            ? props.sources.filter((entry) => entry && typeof entry === 'object' && entry.url && !String(entry.type ?? '').toLowerCase().includes('ascsa'))
            : [];
        for (const entry of additionalSources) {
            const url = normalizeUrl(entry.url ?? entry.href ?? entry.link ?? '');
            if (!url) {
                continue;
            }
            const label = entry.label ?? entry.title ?? 'Source';
            sources.push({ type: entry.type ?? 'source', url, label });
        }

        const uniqueSources = uniqueByUrl(sources);

        return {
            name,
            properties: props,
            feature,
            pleiadesId,
            pleiadesUri: pleiadesPrimary?.url ?? pleiadesUri,
            context,
            sources: uniqueSources
        };
    }

    _bindEvents() {
        if (!this.canvas) {
            return;
        }
        this._pointerDownHandler = (event) => this._handlePointerDown(event);
        this._pointerUpHandler = (event) => this._handlePointerUp(event);
        this._pointerCancelHandler = () => {
            this._pointerState = null;
        };
        this.canvas.addEventListener('pointerdown', this._pointerDownHandler);
        this.canvas.addEventListener('pointerup', this._pointerUpHandler);
        this.canvas.addEventListener('pointerleave', this._pointerCancelHandler);
        this.canvas.addEventListener('pointercancel', this._pointerCancelHandler);

        if (this.window) {
            this._resizeHandler = () => this._positionPanel();
            this.window.addEventListener('resize', this._resizeHandler, { passive: true });
            this._keyHandler = (event) => {
                if (event.key === 'Escape') {
                    this.hide();
                }
            };
            this.window.addEventListener('keydown', this._keyHandler);
        }
    }

    _unbindEvents() {
        if (this.canvas) {
            if (this._pointerDownHandler) {
                this.canvas.removeEventListener('pointerdown', this._pointerDownHandler);
            }
            if (this._pointerUpHandler) {
                this.canvas.removeEventListener('pointerup', this._pointerUpHandler);
            }
            if (this._pointerCancelHandler) {
                this.canvas.removeEventListener('pointerleave', this._pointerCancelHandler);
                this.canvas.removeEventListener('pointercancel', this._pointerCancelHandler);
            }
        }
        if (this.window) {
            if (this._resizeHandler) {
                this.window.removeEventListener('resize', this._resizeHandler);
            }
            if (this._keyHandler) {
                this.window.removeEventListener('keydown', this._keyHandler);
            }
        }
    }

    _handlePointerDown(event) {
        const { offsetX, offsetY, pointerId } = event;
        const time = typeof event.timeStamp === 'number' ? event.timeStamp : Date.now();
        this._pointerState = {
            id: pointerId,
            x: offsetX,
            y: offsetY,
            time
        };
    }

    _handlePointerUp(event) {
        if (!this._pointerState) {
            return;
        }
        if (this._pointerState.id !== undefined && event.pointerId !== undefined && this._pointerState.id !== event.pointerId) {
            return;
        }
        const { offsetX, offsetY } = event;
        const dx = offsetX - this._pointerState.x;
        const dy = offsetY - this._pointerState.y;
        const distance = Math.hypot(dx, dy);
        const elapsed = (typeof event.timeStamp === 'number' ? event.timeStamp : Date.now()) - this._pointerState.time;
        this._pointerState = null;
        if (distance <= this.clickMoveTolerance && elapsed <= this.clickTimeTolerance) {
            this._activateFromPoint(offsetX, offsetY);
        }
    }

    _activateFromPoint(x, y) {
        const landmark = this._findLandmarkAtPoint(x, y);
        if (!landmark) {
            this.hide();
            return;
        }
        const record = this._lookupFeatureRecord(landmark);
        if (!record) {
            this.hide();
            return;
        }
        this._renderRecord(record);
        this._positionPanel();
    }

    _findLandmarkAtPoint(x, y) {
        const landmarks = Array.isArray(this.overlay?.landmarks) ? this.overlay.landmarks : [];
        if (!landmarks.length || typeof this.overlay._worldToScreen !== 'function') {
            return null;
        }
        let best = null;
        for (const landmark of landmarks) {
            if (!landmark || !landmark.world) {
                continue;
            }
            const screen = this.overlay._worldToScreen(landmark.world);
            if (!screen) {
                continue;
            }
            const dx = screen.x - x;
            const dy = screen.y - y;
            const dist = Math.hypot(dx, dy);
            if (dist <= this.hitRadius && (!best || dist < best.distance)) {
                best = { landmark, distance: dist };
            }
        }
        return best ? best.landmark : null;
    }

    _lookupFeatureRecord(landmark) {
        if (!landmark) {
            return null;
        }
        const nameKey = normalizeKey(landmark.name ?? landmark.label);
        if (nameKey && this._featureRecordsByKey.has(nameKey)) {
            return this._featureRecordsByKey.get(nameKey);
        }
        if (landmark.name) {
            const fallback = this._featureRecords.find((record) => record.name === landmark.name);
            if (fallback) {
                return fallback;
            }
        }
        return null;
    }

    _renderRecord(record) {
        if (!this.panel || !record) {
            return;
        }
        if (this.titleEl) {
            this.titleEl.textContent = record.name;
        }
        if (this.contextEl) {
            this.contextEl.textContent = record.context;
        }
        if (this.metaEl) {
            if (record.pleiadesId) {
                this.metaEl.textContent = `Pleiades ID: ${record.pleiadesId}`;
                this.metaEl.style.display = 'block';
            } else {
                this.metaEl.textContent = '';
                this.metaEl.style.display = 'none';
            }
        }
        if (this.sourcesListEl) {
            this.sourcesListEl.textContent = '';
            if (record.sources.length) {
                for (const source of record.sources) {
                    const item = this.document.createElement('li');
                    const link = this.document.createElement('a');
                    link.href = source.url;
                    link.textContent = source.label ?? 'Source';
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.style.color = '#ffe6a6';
                    link.style.textDecoration = 'underline';
                    link.style.fontFamily = '"Cormorant Garamond", serif';
                    link.style.fontSize = '15px';
                    if (source.type === 'pleiades') {
                        link.title = 'Open the Pleiades entry for this location';
                    } else if (source.type === 'ascsa') {
                        link.title = source.isFallback
                            ? 'Open an ASCSA digital library search related to this landmark'
                            : 'Open the ASCSA digital resource used for placement';
                    }
                    item.appendChild(link);
                    this.sourcesListEl.appendChild(item);
                }
            } else {
                const item = this.document.createElement('li');
                const placeholder = this.document.createElement('span');
                placeholder.textContent = 'Source information not available.';
                placeholder.style.color = '#bca87c';
                placeholder.style.fontStyle = 'italic';
                placeholder.style.fontFamily = '"Cormorant Garamond", serif';
                placeholder.style.fontSize = '14px';
                item.appendChild(placeholder);
                this.sourcesListEl.appendChild(item);
            }
        }
        this.panel.style.display = 'block';
        this.panel.classList.add(PANEL_VISIBLE_CLASS);
        this.panel.setAttribute('aria-hidden', 'false');
    }

    _positionPanel() {
        if (!this.panel || !this.canvas || !this.panel.classList.contains(PANEL_VISIBLE_CLASS)) {
            return;
        }
        const rect = typeof this.canvas.getBoundingClientRect === 'function'
            ? this.canvas.getBoundingClientRect()
            : null;
        const win = this.window;
        if (!rect || !win) {
            return;
        }
        const rightInset = Math.max(16, Math.round(win.innerWidth - rect.right));
        const panelHeight = this.panel.offsetHeight || 0;
        const desiredTop = rect.bottom + 12;
        const maxTop = Math.max(16, win.innerHeight - panelHeight - 16);
        const safeTop = Math.min(Math.max(16, Math.round(desiredTop)), maxTop);
        this.panel.style.right = `${rightInset}px`;
        this.panel.style.top = `${safeTop}px`;
    }
}

function normalizeContextOverrides(overrides) {
    const normalized = {};
    if (!overrides || typeof overrides !== 'object') {
        return normalized;
    }
    for (const [key, value] of Object.entries(overrides)) {
        if (!key || typeof value !== 'string') {
            continue;
        }
        const normalizedKey = normalizeKey(key);
        if (!normalizedKey) {
            continue;
        }
        normalized[normalizedKey] = value.trim();
    }
    return normalized;
}

export class LorePins extends LorePinsPanel {}

export async function createLorePins(options) {
    const panel = new LorePins(options);
    await panel.initialize();
    return panel;
}

export default LorePins;
