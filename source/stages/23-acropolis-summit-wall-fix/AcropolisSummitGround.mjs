// The retained main summit wall follows the same outline as the geology.
// The Nike bastion and gateway lie west of this main-terrace treatment.
const clamp = value => Math.max(0, Math.min(1, value));
function smooth(start, end, value) {
  const t = clamp((value - start) / (end - start));
  return t * t * (3 - 2 * t);
}

function terraceEdges(outline) {
  const south = outline.slice(0, 7);
  const east = outline.slice(6, 10).map(([x, z]) => [z, x]);
  if (south[0]?.[0] !== -160 || south.at(-1)?.[0] !== -15 ||
      east[0]?.[0] !== -102 || east.at(-1)?.[0] !== -15 ||
      outline[10]?.[1] !== -15 || outline[11]?.[1] !== -15) {
    throw Error('The retained Acropolis summit outline changed');
  }
  return { south, east };
}

function interpolate(stations, value) {
  for (let i = 1; i < stations.length; i++) {
    const [a, y] = stations[i - 1];
    const [b, next] = stations[i];
    if (value <= b) return y + (next - y) * clamp((value - a) / (b - a));
  }
  return stations.at(-1)[1];
}

export function summitGroundWeight(outline, x, y, z) {
  if (x <= -160 || x >= -9 || z <= -112 || z >= -15 || y <= 21.5) return 0;
  const { south, east } = terraceEdges(outline);
  const inside = Math.min(x + 160, -15 - z, z - interpolate(south, x), interpolate(east, z) - x);
  return smooth(.05, .65, inside) * smooth(21.5, 23.5, y);
}

export function makeSummitGroundShader(outline) {
  const { south, east } = terraceEdges(outline);
  const f = value => Number(value).toFixed(5);
  const line = (axis, stations) => stations.slice(1).map(([b, next], i) => {
    const [a, y] = stations[i];
    return axis + '<=' + f(b) + '?mix(' + f(y) + ',' + f(next)
      + ',clamp((' + axis + '-(' + f(a) + '))/' + f(b - a) + ',0.,1.)):';
  }).join('') + f(stations.at(-1)[1]);

  return '\nfloat acropolisSummitGround(vec3 p){\n'
    + ' if(p.x<=-160.||p.x>=-9.||p.z<=-112.||p.z>=-15.||p.y<=21.5)return 0.;\n'
    + ' float south=' + line('p.x', south) + ';\n'
    + ' float east=' + line('p.z', east) + ';\n'
    + ' float inside=min(min(p.x+160.,-15.-p.z),min(p.z-south,east-p.x));\n'
    + ' return smoothstep(.05,.65,inside)*smoothstep(21.5,23.5,p.y);\n}\n';
}
