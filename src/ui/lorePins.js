const DEFAULT_FALLBACK_DESCRIPTION = 'An important site in classical Athens.';
const PANEL_CLASS_NAME = 'athens-lore-panel';
const PANEL_VISIBLE_CLASS = 'athens-lore-panel--visible';
const POINTER_MOVE_TOLERANCE = 6;
const POINTER_TIME_TOLERANCE = 500;
let activeOverlay = null;

function ensureThree() {
    const { THREE } = globalThis;
    if (!THREE) {
        throw new Error('THREE.js must be available on the global scope to create lore pins.');
    }
    return THREE;
}

function resolveDocument(renderer) {
    if (renderer?.domElement?.ownerDocument) {
        return renderer.domElement.ownerDocument;
    }
    if (typeof document !== 'undefined') {
        return document;
    }
    return null;
}

function createPanelElements(doc) {
    if (!doc || !doc.body) {
        throw new Error('Unable to create lore panel without a document body.');
    }

    const panel = doc.createElement('div');
    panel.className = PANEL_CLASS_NAME;
    panel.style.position = 'fixed';
    panel.style.bottom = '24px';
    panel.style.right = '24px';
    panel.style.maxWidth = '300px';
    panel.style.padding = '18px 22px 20px';
    panel.style.background = 'rgba(10, 14, 22, 0.82)';
    panel.style.color = '#f6f0de';
    panel.style.fontFamily = "'Cormorant Garamond', 'Georgia', serif";
    panel.style.borderRadius = '14px';
    panel.style.boxShadow = '0 12px 32px rgba(0, 0, 0, 0.45)';
    panel.style.border = '1px solid rgba(255, 215, 128, 0.35)';
    panel.style.backdropFilter = 'blur(4px)';
    panel.style.zIndex = '260';
    panel.style.display = 'none';
    panel.style.pointerEvents = 'auto';
    panel.style.boxSizing = 'border-box';

    const closeButton = doc.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = '\u00d7';
    closeButton.setAttribute('aria-label', 'Close lore panel');
    closeButton.style.position = 'absolute';
    closeButton.style.top = '8px';
    closeButton.style.right = '12px';
    closeButton.style.border = 'none';
    closeButton.style.background = 'transparent';
    closeButton.style.color = '#fcead1';
    closeButton.style.fontSize = '20px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.lineHeight = '1';

    const titleEl = doc.createElement('h3');
    titleEl.style.margin = '0 0 8px';
    titleEl.style.fontSize = '20px';
    titleEl.style.fontFamily = "'Cinzel', serif";
    titleEl.style.color = '#ffe8b5';

    const contextEl = doc.createElement('p');
    contextEl.style.margin = '0 0 14px';
    contextEl.style.fontSize = '15px';
    contextEl.style.lineHeight = '1.5';

    const sourcesHeader = doc.createElement('div');
    sourcesHeader.textContent = 'Sources';
    sourcesHeader.style.fontSize = '14px';
    sourcesHeader.style.letterSpacing = '0.04em';
    sourcesHeader.style.textTransform = 'uppercase';
    sourcesHeader.style.marginBottom = '8px';
    sourcesHeader.style.color = 'rgba(255, 233, 190, 0.92)';

    const sourcesList = doc.createElement('ul');
    sourcesList.style.listStyle = 'disc';
    sourcesList.style.margin = '0 0 0 18px';
    sourcesList.style.padding = '0';
    sourcesList.style.fontSize = '14px';
    sourcesList.style.lineHeight = '1.4';

    panel.appendChild(closeButton);
    panel.appendChild(titleEl);
    panel.appendChild(contextEl);
    panel.appendChild(sourcesHeader);
    panel.appendChild(sourcesList);
    doc.body.appendChild(panel);

    return { panel, titleEl, contextEl, sourcesList, closeButton };
}

function getLocationName(location) {
    if (!location) {
        return 'Landmark';
    }
    const props = location.properties ?? {};
    return props.title || props.name || location.title || location.name || 'Landmark';
}

function getLocationDescription(location) {
    const props = location?.properties ?? {};
    const description = typeof props.description === 'string' ? props.description.trim() : '';
    if (description) {
        return description;
    }
    return DEFAULT_FALLBACK_DESCRIPTION;
}

function normalizeUrl(value) {
    if (typeof value !== 'string') {
        return '';
    }
    const trimmed = value.trim();
    if (!trimmed) {
        return '';
    }
    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }
    return '';
}

function labelFromUrl(url, fallback = 'Source') {
    try {
        const parsed = new URL(url);
        const hostname = parsed.hostname.replace(/^www\./i, '');
        return hostname || fallback;
    } catch (error) {
        return fallback;
    }
}

function buildSources(location) {
    const props = location?.properties ?? {};
    const entries = [];
    const seen = new Set();

    const pleiadesCandidate = props.pleiades_uri ?? props.pleiadesUri;
    const pleiadesUrl = normalizeUrl(pleiadesCandidate);
    if (pleiadesUrl && !seen.has(pleiadesUrl)) {
        entries.push({ label: 'Pleiades', url: pleiadesUrl });
        seen.add(pleiadesUrl);
    }

    const rawSources = Array.isArray(props.sources) ? props.sources : [];
    for (const source of rawSources) {
        let url = '';
        let label = '';
        if (typeof source === 'string') {
            url = normalizeUrl(source);
        } else if (source && typeof source === 'object') {
            url = normalizeUrl(source.url ?? source.href ?? source.link ?? '');
            const rawLabel = source.label ?? source.title ?? source.name ?? '';
            if (typeof rawLabel === 'string' && rawLabel.trim()) {
                label = rawLabel.trim();
            }
        }
        if (!url || seen.has(url)) {
            continue;
        }
        if (!label) {
            label = labelFromUrl(url);
        }
        entries.push({ label, url });
        seen.add(url);
    }

    return entries;
}

function updateSourcesList(doc, listEl, sources) {
    while (listEl.firstChild) {
        listEl.removeChild(listEl.firstChild);
    }

    if (!sources.length) {
        const item = doc.createElement('li');
        item.textContent = 'No sources available yet.';
        item.style.listStyle = 'none';
        item.style.color = 'rgba(246, 240, 222, 0.75)';
        listEl.appendChild(item);
        return;
    }

    for (const source of sources) {
        const item = doc.createElement('li');
        item.style.marginBottom = '4px';
        const link = doc.createElement('a');
        link.href = source.url;
        link.textContent = source.label;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.style.color = '#fbd68f';
        link.style.textDecoration = 'underline';
        item.appendChild(link);
        listEl.appendChild(item);
    }
}

function hidePanel(state) {
    if (!state?.panelEl) {
        return;
    }
    state.panelEl.style.display = 'none';
    state.panelEl.classList.remove(PANEL_VISIBLE_CLASS);
    state.currentLocation = null;
}

function showPanel(state, location) {
    if (!state?.panelEl) {
        return;
    }
    const name = getLocationName(location);
    state.titleEl.textContent = name;
    state.contextEl.textContent = getLocationDescription(location);
    updateSourcesList(state.document, state.sourcesListEl, buildSources(location));
    state.panelEl.style.display = 'block';
    state.panelEl.classList.add(PANEL_VISIBLE_CLASS);
    state.currentLocation = location;
}

function getLocationPosition(location, THREE) {
    if (!location) {
        return null;
    }
    const pos = location.position ?? location.worldPosition ?? null;
    if (!pos) {
        return null;
    }
    if (typeof pos.x === 'number' && typeof pos.y === 'number' && typeof pos.z === 'number') {
        if (typeof pos.isVector3 === 'boolean' ? pos.isVector3 : typeof pos.clone === 'function') {
            return pos;
        }
        return new THREE.Vector3(pos.x, pos.y, pos.z);
    }
    if (Array.isArray(pos) && pos.length >= 3) {
        return new THREE.Vector3(pos[0], pos[1], pos[2]);
    }
    return null;
}

function setPointerFromEvent(event, element, target) {
    const rect = element.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    target.x = x * 2 - 1;
    target.y = -(y * 2 - 1);
}

export function destroyLorePinsOverlay() {
    if (!activeOverlay) {
        return;
    }

    const {
        scene,
        meshes,
        domElement,
        listeners,
        closeButton,
        closeHandler,
        panelEl
    } = activeOverlay;

    if (domElement && listeners) {
        for (const [eventName, handler] of Object.entries(listeners)) {
            if (typeof handler === 'function') {
                domElement.removeEventListener(eventName, handler);
            }
        }
    }

    if (closeButton && typeof closeHandler === 'function') {
        closeButton.removeEventListener('click', closeHandler);
    }

    if (Array.isArray(meshes)) {
        for (const mesh of meshes) {
            if (mesh && scene) {
                scene.remove(mesh);
            }
            if (mesh?.geometry && typeof mesh.geometry.dispose === 'function') {
                mesh.geometry.dispose();
            }
            if (mesh?.material && typeof mesh.material.dispose === 'function') {
                mesh.material.dispose();
            }
        }
    }

    if (panelEl && panelEl.parentNode) {
        panelEl.parentNode.removeChild(panelEl);
    }

    activeOverlay = null;
}

export function createLorePinsOverlay(scene, camera, renderer, locations) {
    const THREE = ensureThree();

    if (!scene || !camera || !renderer?.domElement) {
        throw new Error('createLorePinsOverlay requires a scene, camera, renderer, and renderer DOM element.');
    }

    const doc = resolveDocument(renderer);
    if (!doc) {
        throw new Error('Unable to resolve a document context for lore pins overlay.');
    }

    destroyLorePinsOverlay();

    const { panel, titleEl, contextEl, sourcesList, closeButton } = createPanelElements(doc);

    const pointer = new THREE.Vector2();
    const raycaster = new THREE.Raycaster();
    const domElement = renderer.domElement;

    const meshes = [];
    const providedLocations = Array.isArray(locations) ? locations : [];
    for (const location of providedLocations) {
        const position = getLocationPosition(location, THREE);
        if (!position) {
            continue;
        }
        const geometry = new THREE.SphereGeometry(1.5, 16, 16);
        const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(position);
        mesh.userData.location = location;
        meshes.push(mesh);
        scene.add(mesh);
    }

    const state = {
        scene,
        camera,
        renderer,
        raycaster,
        pointer,
        domElement,
        meshes,
        panelEl: panel,
        titleEl,
        contextEl,
        sourcesListEl: sourcesList,
        closeButton,
        document: doc,
        listeners: {},
        pointerDown: null,
        currentLocation: null,
        closeHandler: null
    };

    const handleClose = (event) => {
        event?.preventDefault();
        hidePanel(state);
    };
    closeButton.addEventListener('click', handleClose);
    state.closeHandler = handleClose;

    const activateFromEvent = (event) => {
        if (!meshes.length) {
            return;
        }
        setPointerFromEvent(event, domElement, pointer);
        raycaster.setFromCamera(pointer, camera);
        const intersections = raycaster.intersectObjects(meshes, false);
        if (!intersections.length) {
            return;
        }
        const { location } = intersections[0].object.userData;
        if (!location) {
            return;
        }
        showPanel(state, location);
    };

    const onPointerDown = (event) => {
        if (event.button !== 0) {
            return;
        }
        state.pointerDown = {
            x: event.clientX,
            y: event.clientY,
            time: performance.now(),
            id: event.pointerId
        };
    };

    const onPointerCancel = () => {
        state.pointerDown = null;
    };

    const onPointerUp = (event) => {
        if (event.button !== 0) {
            state.pointerDown = null;
            return;
        }
        const start = state.pointerDown;
        state.pointerDown = null;
        if (!start || start.id !== event.pointerId) {
            return;
        }
        const dx = event.clientX - start.x;
        const dy = event.clientY - start.y;
        const dt = performance.now() - start.time;
        const distance = Math.hypot(dx, dy);
        if (distance > POINTER_MOVE_TOLERANCE || dt > POINTER_TIME_TOLERANCE) {
            return;
        }
        activateFromEvent(event);
    };

    const listeners = {
        pointerdown: onPointerDown,
        pointerup: onPointerUp,
        pointerleave: onPointerCancel,
        pointercancel: onPointerCancel
    };

    for (const [eventName, handler] of Object.entries(listeners)) {
        domElement.addEventListener(eventName, handler, { passive: true });
    }

    state.listeners = listeners;

    activeOverlay = state;
    return state;
}

export default createLorePinsOverlay;
