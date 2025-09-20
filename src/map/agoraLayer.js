import { degToRad } from '../geo/projection.js';

const DEFAULT_DATA_URL = './data/agora_local.json';
const DEFAULT_STYLE = {
    fill: 'rgba(207, 182, 136, 0.48)',
    stroke: '#caa76a',
    lineWidth: 1.2
};
const DEFAULT_LABEL_STYLE = {
    font: '600 13px "Cormorant Garamond", serif',
    textColor: '#fdf6df',
    background: 'rgba(18, 24, 36, 0.7)'
};

export const AGORA_ANCHOR_ID = 'AGORA_ANCHOR';

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

function clampCornerRadius(width, height, radius) {
    if (!Number.isFinite(radius) || radius <= 0) {
        return 0;
    }
    const maxRadius = Math.min(Math.abs(width) / 2, Math.abs(height) / 2);
    return Math.min(radius, maxRadius);
}

function createRoundedRectLocalPoints(halfWidth, halfHeight, radius, segmentsPerCorner = 4) {
    const r = clampCornerRadius(halfWidth * 2, halfHeight * 2, radius);
    if (r <= 0) {
        return [
            { x: -halfWidth, y: -halfHeight },
            { x: halfWidth, y: -halfHeight },
            { x: halfWidth, y: halfHeight },
            { x: -halfWidth, y: halfHeight }
        ];
    }
    const segments = Math.max(1, Math.floor(segmentsPerCorner ?? 4));
    const points = [];
    const addPoint = (x, y) => {
        points.push({ x, y });
    };
    const addArc = (cx, cy, startAngle, endAngle) => {
        const total = segments;
        const delta = endAngle - startAngle;
        for (let i = 1; i <= total; i += 1) {
            const t = i / total;
            const angle = startAngle + delta * t;
            const px = cx + r * Math.cos(angle);
            const py = cy + r * Math.sin(angle);
            points.push({ x: px, y: py });
        }
    };

    addPoint(-halfWidth + r, halfHeight);
    addPoint(halfWidth - r, halfHeight);
    addArc(halfWidth - r, halfHeight - r, Math.PI / 2, 0);
    addPoint(halfWidth, -halfHeight + r);
    addArc(halfWidth - r, -halfHeight + r, 0, -Math.PI / 2);
    addPoint(-halfWidth + r, -halfHeight);
    addArc(-halfWidth + r, -halfHeight + r, -Math.PI / 2, -Math.PI);
    addPoint(-halfWidth, halfHeight - r);
    addArc(-halfWidth + r, halfHeight - r, Math.PI, Math.PI / 2);

    return points;
}

function createFootprintPolygon(center, footprint) {
    if (!footprint || typeof footprint.width !== 'number' || typeof footprint.height !== 'number') {
        return [];
    }
    const width = footprint.width;
    const height = footprint.height;
    const rotationDegrees = footprint.rotationDegrees ?? 0;
    const cornerRadius = footprint.cornerRadius ?? 0;
    const halfWidth = width / 2;
    const halfHeight = height / 2;
    const rotationRadians = degToRad(rotationDegrees);
    const cosR = Math.cos(rotationRadians);
    const sinR = Math.sin(rotationRadians);
    const localPoints = createRoundedRectLocalPoints(halfWidth, halfHeight, cornerRadius, footprint.segmentsPerCorner);
    return localPoints.map(({ x, y }) => ({
        x: center.x + x * cosR - y * sinR,
        y: center.y + x * sinR + y * cosR
    }));
}

function normalizeStyle(style = {}) {
    return {
        fill: style.fill ?? DEFAULT_STYLE.fill,
        stroke: style.stroke ?? DEFAULT_STYLE.stroke,
        lineWidth: style.lineWidth ?? DEFAULT_STYLE.lineWidth
    };
}

export class AgoraLayer {
    constructor({ dataUrl = DEFAULT_DATA_URL, fetchImpl } = {}) {
        this.dataUrl = dataUrl;
        this.fetchImpl = fetchImpl ?? globalThis.fetch;
        this.anchorWorld = null;
        this.rawData = null;
        this.features = [];
        this.visible = false;
    }

    async load() {
        if (this.rawData) {
            return this.rawData;
        }
        if (typeof this.fetchImpl !== 'function') {
            throw new Error('AgoraLayer requires a fetch implementation to load plan data');
        }
        const response = await this.fetchImpl(this.dataUrl);
        if (!response.ok) {
            throw new Error(`Failed to load Agora layer data (${response.status})`);
        }
        const data = await response.json();
        this.rawData = data;
        this._recompute();
        return data;
    }

    setAnchorWorld(anchorWorld) {
        if (anchorWorld && typeof anchorWorld.x === 'number' && typeof anchorWorld.y === 'number') {
            this.anchorWorld = { x: anchorWorld.x, y: anchorWorld.y };
        } else {
            this.anchorWorld = null;
        }
        this._recompute();
    }

    setVisible(visible) {
        this.visible = Boolean(visible);
    }

    _recompute() {
        if (!this.rawData || !this.anchorWorld) {
            this.features = [];
            return;
        }
        const items = Array.isArray(this.rawData.features) ? this.rawData.features : [];
        const computed = [];
        for (const feature of items) {
            const offset = feature.offset ?? {};
            const center = {
                x: this.anchorWorld.x + (typeof offset.x === 'number' ? offset.x : 0),
                y: this.anchorWorld.y + (typeof offset.y === 'number' ? offset.y : 0)
            };
            const polygon = createFootprintPolygon(center, feature.footprint);
            if (!polygon || polygon.length < 3) {
                continue;
            }
            const labelOffset = feature.labelOffset ?? {};
            const labelWorld = {
                x: center.x + (typeof labelOffset.x === 'number' ? labelOffset.x : 0),
                y: center.y + (typeof labelOffset.y === 'number' ? labelOffset.y : 0)
            };
            computed.push({
                id: feature.id ?? feature.name,
                name: feature.name ?? 'Unnamed structure',
                polygon,
                labelWorld,
                style: normalizeStyle(feature.style)
            });
        }
        this.features = computed;
    }

    render({ context, worldToScreen, labelStyle = {} } = {}) {
        if (!this.visible || !this.features.length) {
            return;
        }
        if (typeof worldToScreen !== 'function' || !context) {
            return;
        }
        const fillDefault = DEFAULT_LABEL_STYLE;
        const font = labelStyle.font ?? fillDefault.font;
        const textColor = labelStyle.textColor ?? fillDefault.textColor;
        const background = labelStyle.background ?? fillDefault.background;
        const paddingX = 6;
        const paddingY = 4;

        for (const feature of this.features) {
            const screenPoints = feature.polygon.map((point) => worldToScreen(point));
            if (!screenPoints.length) {
                continue;
            }
            context.save();
            context.beginPath();
            context.moveTo(screenPoints[0].x, screenPoints[0].y);
            for (let i = 1; i < screenPoints.length; i += 1) {
                context.lineTo(screenPoints[i].x, screenPoints[i].y);
            }
            context.closePath();
            context.fillStyle = feature.style.fill;
            context.strokeStyle = feature.style.stroke;
            context.lineWidth = feature.style.lineWidth;
            context.fill();
            context.stroke();
            context.restore();

            if (!feature.name) {
                continue;
            }
            const labelScreen = worldToScreen(feature.labelWorld);
            context.save();
            context.font = font;
            context.textBaseline = 'middle';
            context.textAlign = 'center';
            const metrics = measureTextBox(context, feature.name);
            const boxWidth = metrics.width + paddingX * 2;
            const boxHeight = metrics.height + paddingY * 2;
            context.fillStyle = background;
            context.fillRect(labelScreen.x - boxWidth / 2, labelScreen.y - boxHeight / 2, boxWidth, boxHeight);
            context.fillStyle = textColor;
            context.fillText(feature.name, labelScreen.x, labelScreen.y);
            context.restore();
        }
    }
}

export function createAgoraLayer(options) {
    return new AgoraLayer(options);
}

export { DEFAULT_DATA_URL as AGORA_LAYER_DATA_URL };
