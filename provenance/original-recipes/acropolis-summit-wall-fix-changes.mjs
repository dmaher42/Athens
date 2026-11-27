import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { outline } from '../../src/sanctuary/AcropolisGeology.mjs';
import { makeSummitGroundShader } from './AcropolisSummitGround.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const world = path.resolve(here, '../..');
const q = String.fromCharCode(96);
const a = '\x24{';
const shader = makeSummitGroundShader(outline) + 'float acSummitGroundWeight;\n';
const initialize = 'acSummitGroundWeight=acropolisSummitGround(vPositionW);';
const guard = 'acSummitGroundWeight > 0.0';
const varying = 'varying float vAcropolisRockCoverage;';

export function once(text, before, after) {
  assert.equal(text.split(before).length, 2, 'Expected one exact Acropolis owner span: ' + before.slice(0, 100));
  return text.replace(before, () => after);
}

function attenuateRoughness(fragment) {
  const match = fragment.match(/float acRM=(mix\([^\n;]+\));/);
  assert(match, 'Expected the existing blended-foothill roughness weight');
  return '\n        if(acSummitGroundWeight<1.0){'
    + once(fragment, match[0], 'float acRM=(1.-acSummitGroundWeight)*' + match[1] + ';')
    + '        }\n';
}

export function nativeChanges(original) {
  assert(!original.includes('float acropolisSummitGround(vec3 p)'), 'Summit finish is already integrated');
  const definitions = a + 'this.blendFoothill?' + JSON.stringify(varying) + ':""}\n      '+q+',CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS:';
  const definitionsAfter = a + 'this.blendFoothill?' + JSON.stringify(varying+'\n'+shader) + ':""}\n      '+q
    + ',CUSTOM_FRAGMENT_MAIN_BEGIN:this.blendFoothill?' + JSON.stringify(initialize) + ':"",CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS:';
  const rough = original.match(/CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS:\(this\.blendFoothill\?("(?:[^"\\]|\\.)*"):/);
  const rock = original.match(/float acRockMix = mix\(1\.0, smoothstep\(\.018, \.68, vAcropolisRockCoverage\), (\x24\{[\w$]+\})\);/);
  const earth = original.match(/this\.foothillOnly\?\x60if \((\x24\{[\w$]+\}) > 0\.0\) \{\x60:""/);
  assert(rough && rock && earth, 'Native field, material and grade anchors moved');
  assert.equal(rock[1], earth[1], 'Limestone and underlying earth must use the same original foothill coverage');
  const spans = [
    { before: definitions, after: definitionsAfter },
    { before: rough[1], after: JSON.stringify(attenuateRoughness(JSON.parse(rough[1]))) },
    { before: rock[0], after: rock[0].replace('= mix', '= (1.-acSummitGroundWeight)*mix') },
    { before: earth[0], after: earth[0].replace(' > 0.0)', ' > 0.0 || ' + guard + ')') },
  ];
  const update = spans.reduce((all, { before, after }) => once(all, before, after), original);
  const inverse = spans.toReversed().reduce((all, { before, after }) => once(all, after, before), update);
  assert.equal(inverse, original);
  return { update, spans };
}

export function canonicalChanges() {
  const changes = [];
  function edit(relative, update) {
    const file = path.join(world, relative);
    const before = fs.readFileSync(file, 'utf8');
    const after = update(before);
    changes.push({ relative, file, before, after });
  }
  edit('src/sanctuary/AcropolisLimestone.ts', text => {
    const firstImport = "import {ownAcropolisMaps} from './AcropolisTerrainUpgrade.mjs';";
    text = once(text, firstImport, firstImport + "\nimport { outline } from './AcropolisGeology.mjs';\nimport { makeSummitGroundShader } from './AcropolisSummitGround.mjs';");
    const beforeComment = '// Continuous world-space stone across authored cliffs, closure skirts and';
    text = once(text, beforeComment, "const summitGroundShader = makeSummitGroundShader(outline) + 'float acSummitGroundWeight;\\n';\n\n" + beforeComment);
    const define = a + "this.blendFoothill ? '" + varying + "' : ''}";
    text = once(text, define, a + "this.blendFoothill ? '" + varying + "' + summitGroundShader : ''}");
    const roughness = 'CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS: this.blendFoothill\n        ? '+q;
    const at = text.indexOf(roughness) + roughness.length;
    assert(at > roughness.length);
    const end = text.indexOf(q, at);
    assert(end > at);
    text = text.slice(0, at) + attenuateRoughness(text.slice(at,end)) + text.slice(end);
    text = once(text, '      ' + roughness, '      CUSTOM_FRAGMENT_MAIN_BEGIN: this.blendFoothill ? \'' + initialize + '\' : \'\',\n      '+roughness);
    return once(text, 'float acRockMix = mix(1.0, smoothstep(.018, .68',
      'float acRockMix = (1.-acSummitGroundWeight)*mix(1.0, smoothstep(.018, .68');
  });
  edit('src/core/BabylonAgoraGround.ts', text => once(text,
    'if (' + a + 'acropolisFoothillWeight} > 0.0) {',
    'if (' + a + 'acropolisFoothillWeight} > 0.0 || ' + guard + ') {'));
  const relative = 'src/sanctuary/AcropolisSummitGround.mjs';
  const file = path.join(world, relative);
  assert(!fs.existsSync(file), 'Reconcile the current canonical summit helper before writing');
  changes.push({ relative, file, before: null, after: fs.readFileSync(path.join(here, 'AcropolisSummitGround.mjs'), 'utf8') });
  return changes;
}
