// Keep the native Journey ground and the existing city/road materials in place.
// The west approach uses its authored masks; the exterior base finish backs it
// with earthy, staggered colour variation beyond those masks.
const countryPrelude = '#ifdef ATHENS_JOURNEY_GROUND\n// Skip all country texture work across the rest of Athens.';
const exteriorColour = `
// Blend the existing ground photograph across the dry exterior of Athens.
// The city atlas and native road, shore and rock finishes retain priority.
vec2 jrPalXZ=vPositionW.xz;
if(jrPalXZ.x<-316.||jrPalXZ.x>184.||jrPalXZ.y<-262.||jrPalXZ.y>312.){
 float jrPalWest=1.-smoothstep(-371.,-316.,jrPalXZ.x);
 float jrPalEast=smoothstep(184.,238.,jrPalXZ.x);
 float jrPalSouth=1.-smoothstep(-317.,-262.,jrPalXZ.y);
 float jrPalNorth=smoothstep(312.,367.,jrPalXZ.y);
 float jrPalWeight=max(max(jrPalWest,jrPalEast),max(jrPalSouth,jrPalNorth));
 #ifdef ATHENS_AGORA_GROUND
 jrPalWeight*=smoothstep(harbourSeaLevel+1.5,harbourSeaLevel+8.,vPositionW.y)*(1.-clamp(agCachedResponse.x,0.,1.));
 #endif
 if(jrPalWeight>.001){
  float jrPalSlope=smoothstep(.67,.96,abs(geometricNormalW.y));
  float jrPalGrowth=smoothstep(.18,.82,.5+.28*sin(dot(jrPalXZ,vec2(.018,.013)))+.22*sin(dot(jrPalXZ,vec2(-.037,.024))));
  float jrPalLuma=dot(surfaceAlbedo,vec3(.2126,.7152,.0722));
  vec3 jrPalField=mix(vec3(1.14,.96,.66),vec3(.72,.90,.55),jrPalGrowth);
  vec3 jrPalTint=mix(vec3(1.055,1.035,.995),jrPalField,jrPalSlope);
  surfaceAlbedo=mix(surfaceAlbedo,jrPalLuma*jrPalTint,jrPalWeight*mix(.24,.87,jrPalSlope));
 }
}`;

export const patches = [
  {
    before: countryPrelude,
    after: '#ifdef ATHENS_JOURNEY_GROUND' + exteriorColour + '\n'
      + countryPrelude.split('\n')[1],
  },
  {
    before: 'vec3 jrMeadow=jrGrass*mix(vec3(.96,1.30,.98),vec3(1.045,1.16,.92),jrLand.g)*(.91+jrMacro*.23);',
    after: `float jrSummer=smoothstep(.13,.83,.72*jrLand.g+.28*jrMacro);
   float jrMeadowLuma=dot(jrGrass,vec3(.2126,.7152,.0722));
   vec3 jrMeadow=mix(jrGrass,vec3(jrMeadowLuma)*mix(vec3(.76,.94,.58),vec3(1.17,.96,.62),jrSummer),.76)*(.91+jrMacro*.23);`,
  },
  {
    before: 'vec3 jrWeatheredStone=mix(jrStone,vec3(jrStoneValue)*vec3(1.045,1.025,.985),.32)*1.045;',
    after: 'vec3 jrWeatheredStone=mix(jrStone,vec3(jrStoneValue)*vec3(1.065,1.045,1.015),.46)*1.065;',
  },
  {
    before: 'jrField=mix(jrField,jrMeadow*vec3(.94,1.16,.86),jrVerge*(.78+jrMottle*.17));',
    after: 'jrField=mix(jrField,jrMeadow*vec3(.95,1.035,.94),jrVerge*(.78+jrMottle*.17));',
  },
];
