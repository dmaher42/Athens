import { loadGeoJson } from '../geo/geoLoader.js';
import { LocalEquirectangularProjection } from '../geo/projection.js';
import { AgoraLayer } from './agoraLayer.js';

const LANDMARK_LABELS = {
    'Acropolis of Athens': 'Acropolis',
    'Agora of Athens (Ancient Agora)': 'Agora',
    'Pnyx': 'Pnyx',
    'Areopagus (Areios Pagos)': 'Areopagus',
    'Kerameikos': 'Kerameikos'
};

const LONG_WALL_LABELS = {
    'Makra Teiche (Long Walls) to Piraeus — schematic': 'Long Walls to Piraeus',
    'Phaleric Wall — schematic': 'Long Walls to Phaleron'
};

const CITY_WALL_LABEL = 'City Wall';
const CITY_PADDING_PX = 48;
const MARKER_RADIUS = 5.5;
const DEFAULT_LABEL_FONT = '600 14px "Cormorant Garamond", serif';
const DEFAULT_PATH_FONT = '600 13px "Cinzel", serif';
const DEFAULT_LABEL_TEXT_COLOR = '#fdf6df';
const DEFAULT_LABEL_BACKGROUND = 'rgba(18, 24, 36, 0.75)';
const DEFAULT_PATH_BACKGROUND = 'rgba(18, 24, 36, 0.7)';
const CITY_WALL_STYLE = { stroke: '#d7c8a8', width: 1.6 };
const LONG_WALL_STYLE = { stroke: '#bb7832', width: 3.4 };
const DEFAULT_ZOOM_LIMITS = { min: 0.05, max: 32 };

function measureTextBox(ctx, text) {
    const metrics = ctx.measureText(text);
    const ascent = metrics.actualBoundingBoxAscent ?? metrics.fontBoundingBoxAscent ?? 8;
    const descent = metrics.actualBoundingBoxDescent ?? metrics.fontBoundingBoxDescent ?? 4;
    return {
        width: metrics.width,
        height: ascent + descent,
        ascent,
        descent
    };
}

function sortPointsClockwise(points) {
    const filtered = points.filter(Boolean);
    if (filtered.length <= 1) {
        return filtered;
    }
    const centroid = filtered.reduce((acc, point) => {
        acc.x += point.x;
        acc.y += point.y;
        return acc;
    }, { x: 0, y: 0 });
    centroid.x /= filtered.length;
    centroid.y /= filtered.length;

    return filtered.slice().sort((a, b) => {
        const angleA = Math.atan2(a.y - centroid.y, a.x - centroid.x);
        const angleB = Math.atan2(b.y - centroid.y, b.x - centroid.x);
        return angleA - angleB;
    });
}

function distanceBetween(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.hypot(dx, dy);
}

function computePolylineMidpoint(points, { closed = false } = {}) {
    if (!Array.isArray(points) || points.length < 2) {
        return null;
    }
    const segments = [];
    for (let i = 1; i < points.length; i += 1) {
        const start = points[i - 1];
        const end = points[i];
        segments.push({ start, end, length: distanceBetween(start, end) });
    }
    if (closed) {
        const start = points[points.length - 1];
        const end = points[0];
        segments.push({ start, end, length: distanceBetween(start, end) });
    }

    const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
    if (totalLength === 0) {
        const fallback = points[0];
        return { point: { x: fallback.x, y: fallback.y }, angle: 0 };
    }

    const halfLength = totalLength / 2;
    let accumulated = 0;
    for (const segment of segments) {
        if (accumulated + segment.length >= halfLength) {
            const segmentPosition = (halfLength - accumulated) / segment.length;
            const point = {
                x: segment.start.x + (segment.end.x - segment.start.x) * segmentPosition,
                y: segment.start.y + (segment.end.y - segment.start.y) * segmentPosition
            };
            const angle = Math.atan2(segment.end.y - segment.start.y, segment.end.x - segment.start.x);
            return { point, angle };
        }
        accumulated += segment.length;
    }

    const lastSegment = segments[segments.length - 1];
    const angle = Math.atan2(lastSegment.end.y - lastSegment.start.y, lastSegment.end.x - lastSegment.start.x);
    return { point: { x: lastSegment.end.x, y: lastSegment.end.y }, angle };
}

export class LandmarkOverlay {
    /**
     * @param {HTMLCanvasElement} canvas - Target canvas element used as an overlay.
     * @param {object} [options]
     * @param {string} [options.geoJsonUrl] - Optional alternative URL to load the GeoJSON from.
     * @param {typeof fetch} [options.fetchImpl] - Optional fetch implementation.
     * @param {number} [options.fitPadding=CITY_PADDING_PX] - Padding (in CSS pixels) used when fitting the initial view.
     * @param {{ min?: number, max?: number }} [options.zoomLimits] - Optional zoom limits.
     * @param {Window} [options.domWindow] - Optional custom window for event binding (useful for tests).
     */
    constructor(canvas, options = {}) {
        if (!(canvas instanceof HTMLCanvasElement)) {
            throw new TypeError('LandmarkOverlay requires a valid HTMLCanvasElement');
        }

        this.canvas = canvas;
        this.canvas.style.touchAction = this.canvas.style.touchAction || 'none';
        this.context = canvas.getContext('2d');
        if (!this.context) {
            throw new Error('Unable to acquire 2D drawing context for landmarks overlay');
        }

        this.options = options;
        this.window = options.domWindow ?? (typeof window !== 'undefined' ? window : undefined);
        if (!this.window) {
            throw new Error('LandmarkOverlay requires a browser window for interaction handling');
        }

        this.devicePixelRatio = options.devicePixelRatio ?? this.window.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1;
        this.zoomLimits = {
            min: options.zoomLimits?.min ?? DEFAULT_ZOOM_LIMITS.min,
            max: options.zoomLimits?.max ?? DEFAULT_ZOOM_LIMITS.max
        };

        this.labelFont = options.labelFont ?? DEFAULT_LABEL_FONT;
        this.pathLabelFont = options.pathLabelFont ?? DEFAULT_PATH_FONT;
        this.labelTextColor = options.labelTextColor ?? DEFAULT_LABEL_TEXT_COLOR;
        this.labelBackground = options.labelBackground ?? DEFAULT_LABEL_BACKGROUND;
        this.pathLabelBackground = options.pathLabelBackground ?? DEFAULT_PATH_BACKGROUND;
        this.cityWallStyle = { ...CITY_WALL_STYLE, ...options.cityWallStyle };
        this.longWallStyle = { ...LONG_WALL_STYLE, ...options.longWallStyle };

        this.agoraLayer = new AgoraLayer({
            dataUrl: options.agoraDataUrl,
            fetchImpl: options.fetchImpl
        });
        this.showAgoraLayer = Boolean(options.showAgoraLayer);
        this.agoraLayer.setVisible(this.showAgoraLayer);

        this.camera = {
            center: { x: 0, y: 0 },
            zoom: 1
        };
        this.bounds = null;
        this.landmarks = [];
        this.longWalls = [];
        this.cityWallPath = null;
        this.agoraAnchorWorld = null;
        this.projection = null;
        this.isDragging = false;
        this.lastPointerPosition = { x: 0, y: 0 };
        this.viewportWidth = canvas.clientWidth || canvas.width || 800;
        this.viewportHeight = canvas.clientHeight || canvas.height || 600;
        this._renderScheduled = false;
        this._initialized = false;

        this._handleResize = this._handleResize.bind(this);
        this._handlePointerDown = this._handlePointerDown.bind(this);
        this._handlePointerMove = this._handlePointerMove.bind(this);
        this._handlePointerUp = this._handlePointerUp.bind(this);
        this._handleWheel = this._handleWheel.bind(this);

        this._resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(this._handleResize) : null;
        if (this._resizeObserver) {
            this._resizeObserver.observe(this.canvas);
        }

        this.window.addEventListener('resize', this._handleResize);
        this.canvas.addEventListener('pointerdown', this._handlePointerDown);
        this.canvas.addEventListener('pointermove', this._handlePointerMove);
        this.canvas.addEventListener('pointerup', this._handlePointerUp);
        this.canvas.addEventListener('pointerleave', this._handlePointerUp);
        this.window.addEventListener('pointerup', this._handlePointerUp);
        this.canvas.addEventListener('wheel', this._handleWheel, { passive: false });

        this._handleResize();
    }

    async initialize() {
        if (this._initialized) {
            return;
        }
        const geoJson = await loadGeoJson(this.options.geoJsonUrl, this.options.fetchImpl);
        this._prepareData(geoJson);
        if (this.agoraLayer) {
            try {
                await this.agoraLayer.load();
            } catch (error) {
                console.warn('Failed to load Agora plan overlay data:', error);
            }
        }
        this._fitView(this.options.fitPadding ?? CITY_PADDING_PX);
        this._initialized = true;
        this.requestRender();
    }

    destroy() {
        if (this._resizeObserver) {
            this._resizeObserver.unobserve(this.canvas);
            this._resizeObserver.disconnect();
        }
        this.window.removeEventListener('resize', this._handleResize);
        this.canvas.removeEventListener('pointerdown', this._handlePointerDown);
        this.canvas.removeEventListener('pointermove', this._handlePointerMove);
        this.canvas.removeEventListener('pointerup', this._handlePointerUp);
        this.canvas.removeEventListener('pointerleave', this._handlePointerUp);
        this.window.removeEventListener('pointerup', this._handlePointerUp);
        this.canvas.removeEventListener('wheel', this._handleWheel);
    }

    requestRender() {
        if (this._renderScheduled) {
            return;
        }
        this._renderScheduled = true;
        this.window.requestAnimationFrame(() => {
            this._renderScheduled = false;
            this._render();
        });
    }

    setShowAgoraLayer(show) {
        const visible = Boolean(show);
        if (visible === this.showAgoraLayer) {
            return;
        }
        this.showAgoraLayer = visible;
        if (this.agoraLayer) {
            this.agoraLayer.setVisible(visible);
        }
        this.requestRender();
    }

    getShowAgoraLayer() {
        return this.showAgoraLayer;
    }

    _handleResize() {
        const rect = this.canvas.getBoundingClientRect ? this.canvas.getBoundingClientRect() : null;
        const width = rect?.width && rect.width > 0 ? rect.width : (this.canvas.width / this.devicePixelRatio) || 800;
        const height = rect?.height && rect.height > 0 ? rect.height : (this.canvas.height / this.devicePixelRatio) || 600;
        this.viewportWidth = width;
        this.viewportHeight = height;
        this.devicePixelRatio = this.options.devicePixelRatio ?? this.window.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1;
        this.canvas.width = Math.max(1, Math.round(width * this.devicePixelRatio));
        this.canvas.height = Math.max(1, Math.round(height * this.devicePixelRatio));
        this.context.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
        this.requestRender();
    }

    _handlePointerDown(event) {
        this.isDragging = true;
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };
        if (typeof this.canvas.setPointerCapture === 'function') {
            try {
                this.canvas.setPointerCapture(event.pointerId);
            } catch (error) {
                // ignore errors from invalid pointer capture states
            }
        }
        event.preventDefault();
    }

    _handlePointerMove(event) {
        if (!this.isDragging) {
            return;
        }
        const deltaX = event.clientX - this.lastPointerPosition.x;
        const deltaY = event.clientY - this.lastPointerPosition.y;
        this.lastPointerPosition = { x: event.clientX, y: event.clientY };
        this.camera.center.x -= deltaX / this.camera.zoom;
        this.camera.center.y -= deltaY / this.camera.zoom;
        this.requestRender();
        event.preventDefault();
    }

    _handlePointerUp(event) {
        if (typeof this.canvas.releasePointerCapture === 'function' && event.pointerId !== undefined) {
            try {
                this.canvas.releasePointerCapture(event.pointerId);
            } catch (error) {
                // ignore release errors
            }
        }
        this.isDragging = false;
    }

    _handleWheel(event) {
        if (!this._initialized) {
            return;
        }
        event.preventDefault();
        const zoomFactor = Math.exp(-event.deltaY * 0.001);
        const newZoom = this._clampZoom(this.camera.zoom * zoomFactor);
        if (newZoom === this.camera.zoom) {
            return;
        }
        const mousePosition = { x: event.offsetX, y: event.offsetY };
        const worldBefore = this._screenToWorld(mousePosition);
        this.camera.zoom = newZoom;
        const worldAfter = this._screenToWorld(mousePosition);
        this.camera.center.x += worldBefore.x - worldAfter.x;
        this.camera.center.y += worldBefore.y - worldAfter.y;
        this.requestRender();
    }

    _clampZoom(value) {
        if (value < this.zoomLimits.min) {
            return this.zoomLimits.min;
        }
        if (value > this.zoomLimits.max) {
            return this.zoomLimits.max;
        }
        return value;
    }

    _prepareData(geoJson) {
        const features = Array.isArray(geoJson?.features) ? geoJson.features : [];
        let latSum = 0;
        let lonSum = 0;
        let count = 0;

        for (const feature of features) {
            const geometry = feature.geometry;
            if (!geometry) {
                continue;
            }
            if (geometry.type === 'Point') {
                lonSum += geometry.coordinates[0];
                latSum += geometry.coordinates[1];
                count += 1;
            } else if (geometry.type === 'LineString') {
                for (const coordinate of geometry.coordinates) {
                    lonSum += coordinate[0];
                    latSum += coordinate[1];
                    count += 1;
                }
            }
        }

        if (count === 0) {
            return;
        }

        const origin = { lon: lonSum / count, lat: latSum / count };
        this.projection = new LocalEquirectangularProjection({ origin });
        this.landmarks = [];
        this.longWalls = [];
        this.cityWallPath = null;
        this.bounds = null;
        this.agoraAnchorWorld = null;
        if (this.agoraLayer) {
            this.agoraLayer.setAnchorWorld(null);
        }

        const cityPoints = [];

        for (const feature of features) {
            const geometry = feature.geometry;
            const properties = feature.properties ?? {};
            if (!geometry) {
                continue;
            }

            if (geometry.type === 'Point') {
                const world = this.projection.projectGeoJsonPosition(geometry.coordinates);
                this._extendBounds(world);
                const label = LANDMARK_LABELS[properties.name];
                if (label) {
                    const landmark = { name: properties.name, label, world };
                    this.landmarks.push(landmark);
                    cityPoints.push({ x: world.x, y: world.y });
                }
                if (properties.name === 'Agora of Athens (Ancient Agora)') {
                    this.agoraAnchorWorld = { x: world.x, y: world.y };
                    if (this.agoraLayer) {
                        this.agoraLayer.setAnchorWorld(this.agoraAnchorWorld);
                    }
                }
            } else if (geometry.type === 'LineString') {
                const points = geometry.coordinates.map((coordinate) => this.projection.projectGeoJsonPosition(coordinate));
                for (const point of points) {
                    this._extendBounds(point);
                }
                const label = LONG_WALL_LABELS[properties.name];
                if (label) {
                    this.longWalls.push({ name: properties.name, label, points });
                }
            }
        }

        if (cityPoints.length >= 3) {
            this.cityWallPath = sortPointsClockwise(cityPoints);
        }
    }

    _extendBounds(point) {
        if (!point) {
            return;
        }
        if (!this.bounds) {
            this.bounds = {
                minX: point.x,
                maxX: point.x,
                minY: point.y,
                maxY: point.y
            };
            return;
        }
        if (point.x < this.bounds.minX) this.bounds.minX = point.x;
        if (point.x > this.bounds.maxX) this.bounds.maxX = point.x;
        if (point.y < this.bounds.minY) this.bounds.minY = point.y;
        if (point.y > this.bounds.maxY) this.bounds.maxY = point.y;
    }

    _fitView(padding = CITY_PADDING_PX) {
        if (!this.bounds) {
            return;
        }
        const width = this.viewportWidth;
        const height = this.viewportHeight;
        if (!width || !height) {
            return;
        }
        const worldWidth = this.bounds.maxX - this.bounds.minX;
        const worldHeight = this.bounds.maxY - this.bounds.minY;
        const safePadding = Math.max(0, padding);
        const availableWidth = Math.max(1, width - safePadding * 2);
        const availableHeight = Math.max(1, height - safePadding * 2);
        const scaleX = worldWidth > 0 ? availableWidth / worldWidth : this.zoomLimits.max;
        const scaleY = worldHeight > 0 ? availableHeight / worldHeight : this.zoomLimits.max;
        const zoom = Math.min(scaleX, scaleY, this.zoomLimits.max);
        this.camera.zoom = zoom > 0 ? zoom : this.camera.zoom;
        this.camera.center.x = (this.bounds.minX + this.bounds.maxX) / 2;
        this.camera.center.y = (this.bounds.minY + this.bounds.maxY) / 2;
    }

    _render() {
        const ctx = this.context;
        ctx.setTransform(this.devicePixelRatio, 0, 0, this.devicePixelRatio, 0, 0);
        ctx.clearRect(0, 0, this.viewportWidth, this.viewportHeight);

        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        if (this.cityWallPath && this.cityWallPath.length >= 2) {
            this._drawPolyline(this.cityWallPath, { closed: true, stroke: this.cityWallStyle.stroke, width: this.cityWallStyle.width });
            this._drawPathLabel(this.cityWallPath, CITY_WALL_LABEL, { closed: true });
        }

        for (const wall of this.longWalls) {
            if (wall.points.length >= 2) {
                this._drawPolyline(wall.points, { closed: false, stroke: this.longWallStyle.stroke, width: this.longWallStyle.width });
                this._drawPathLabel(wall.points, wall.label);
            }
        }

        if (this.showAgoraLayer && this.agoraLayer) {
            this.agoraLayer.render({
                context: ctx,
                worldToScreen: (point) => this._worldToScreen(point),
                labelStyle: {
                    font: this.labelFont,
                    textColor: this.labelTextColor,
                    background: this.labelBackground
                }
            });
        }

        for (const landmark of this.landmarks) {
            this._drawLandmark(landmark);
        }
    }

    _drawPolyline(points, { closed = false, stroke = '#ffffff', width = 2 } = {}) {
        if (!points || points.length < 2) {
            return;
        }
        const ctx = this.context;
        ctx.save();
        ctx.beginPath();
        const first = this._worldToScreen(points[0]);
        ctx.moveTo(first.x, first.y);
        for (let i = 1; i < points.length; i += 1) {
            const screenPoint = this._worldToScreen(points[i]);
            ctx.lineTo(screenPoint.x, screenPoint.y);
        }
        if (closed) {
            ctx.closePath();
        }
        ctx.strokeStyle = stroke;
        ctx.lineWidth = width;
        ctx.stroke();
        ctx.restore();
    }

    _drawPathLabel(points, label, { closed = false } = {}) {
        if (!label) {
            return;
        }
        const result = computePolylineMidpoint(points, { closed });
        if (!result) {
            return;
        }
        const { point, angle } = result;
        const screenPoint = this._worldToScreen(point);
        const ctx = this.context;
        ctx.save();
        ctx.translate(screenPoint.x, screenPoint.y);
        let displayAngle = angle;
        if (displayAngle > Math.PI / 2) {
            displayAngle -= Math.PI;
        } else if (displayAngle < -Math.PI / 2) {
            displayAngle += Math.PI;
        }
        ctx.rotate(displayAngle);
        ctx.font = this.pathLabelFont;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const metrics = measureTextBox(ctx, label);
        const paddingX = 6;
        const paddingY = 4;
        const width = metrics.width + paddingX * 2;
        const height = metrics.height + paddingY * 2;
        ctx.fillStyle = this.pathLabelBackground;
        ctx.fillRect(-width / 2, -height / 2, width, height);
        ctx.fillStyle = this.labelTextColor;
        ctx.fillText(label, 0, 0);
        ctx.restore();
    }

    _drawLandmark(landmark) {
        const screen = this._worldToScreen(landmark.world);
        const ctx = this.context;
        ctx.save();
        ctx.beginPath();
        ctx.fillStyle = this.options.markerFill ?? '#f7efcf';
        ctx.strokeStyle = this.options.markerStroke ?? '#4a3622';
        ctx.lineWidth = 1.5;
        ctx.arc(screen.x, screen.y, MARKER_RADIUS, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        this._drawLabel(screen, landmark.label);
    }

    _drawLabel(screenPoint, text) {
        const ctx = this.context;
        ctx.save();
        ctx.font = this.labelFont;
        ctx.textBaseline = 'middle';
        let offsetX = 12;
        let textAlign = 'left';
        if (screenPoint.x > this.viewportWidth - 160) {
            offsetX = -12;
            textAlign = 'right';
        }
        let offsetY = -14;
        if (screenPoint.y < 24) {
            offsetY = 14;
        }
        const x = screenPoint.x + offsetX;
        const y = screenPoint.y + offsetY;
        ctx.textAlign = textAlign;
        const metrics = measureTextBox(ctx, text);
        const paddingX = 6;
        const paddingY = 4;
        const rectWidth = metrics.width + paddingX * 2;
        const rectHeight = metrics.height + paddingY * 2;
        const rectX = textAlign === 'right' ? x - rectWidth + paddingX : x - paddingX;
        const rectY = y - rectHeight / 2;
        ctx.fillStyle = this.labelBackground;
        ctx.fillRect(rectX, rectY, rectWidth, rectHeight);
        ctx.fillStyle = this.labelTextColor;
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    _worldToScreen(point) {
        const x = (point.x - this.camera.center.x) * this.camera.zoom + this.viewportWidth / 2;
        const y = (point.y - this.camera.center.y) * this.camera.zoom + this.viewportHeight / 2;
        return { x, y };
    }

    _screenToWorld(point) {
        const x = (point.x - this.viewportWidth / 2) / this.camera.zoom + this.camera.center.x;
        const y = (point.y - this.viewportHeight / 2) / this.camera.zoom + this.camera.center.y;
        return { x, y };
    }
}

export async function createLandmarkOverlay(canvas, options) {
    const overlay = new LandmarkOverlay(canvas, options);
    await overlay.initialize();
    return overlay;
}
