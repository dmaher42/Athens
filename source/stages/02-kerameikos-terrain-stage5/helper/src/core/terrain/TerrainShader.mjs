// This plugin runs on a PRIVATE material, using the selected program's Babylon base.
// Nine samplers: 3 colour, 3 normal+roughness, 1 baked atlas, 2 borrowed native maps.
export function createTerrainMaterial({scene,Material,Plugin,Texture,RawTexture,base,control,profile,patch,own,borrowed,host}){
  const m=host?.material??new Material('Terrain study / packed earth gravel limestone',scene);own.materials.push(m);
  if(!host){m.albedoColor.set(1,1,1);m.roughness=.96;m.metallic=0;m.backFaceCulling=false;m.maxSimultaneousLights=4;}
  const tex=(name,color)=>{if(host?.textures?.[name])return host.textures[name];const t=new Texture((host?.assetPath??(base+'assets/'))+name,scene);t.name='Terrain study / '+name;t.gammaSpace=color;t.anisotropicFilteringLevel=8;t.wrapU=t.wrapV=1;own.textures.push(t);return t;};
  const maps={tlEarth:tex('earth-colour.jpg',true),tlGravel:tex('gravel-colour.jpg',true),tlRock:tex('rock-colour.jpg',true),tlEarthNR:tex('earth-normal-rough.png',false),tlGravelNR:tex('gravel-normal-rough.png',false),tlRockNR:tex('rock-normal-rough.png',false)};
  const mask=host?.controlTexture??RawTexture.CreateRGBATexture(control.pixels,control.width??control.size,control.height??control.size,scene,false,false,2);if(!host?.controlTexture){mask.name='Piraeus terrain / static land-use RGBA';mask.gammaSpace=false;mask.wrapU=mask.wrapV=0;own.textures.push(mask);}maps.tlControl=mask;
  if(!host){if(!borrowed?.grass||!borrowed?.land)throw Error('Original country surface required for a continuous test-patch boundary');maps.tlNativeGrass=borrowed.grass;maps.tlNativeLand=borrowed.land;}
  class MediterraneanTerrain extends Plugin{
    constructor(){super(m,'MediterraneanTerrainStudy',host?190:180,{MEDITERRANEAN_TERRAIN_STUDY:true,['TL_PROFILE_'+profile.label.replace(/\W/g,'_')]:true},true,true);this.doNotSerialize=true;}
    getClassName(){return 'MediterraneanTerrainStudy';}
    prepareDefines(d){d.MEDITERRANEAN_TERRAIN_STUDY=true;}
    getSamplers(list){list.push(...Object.keys(maps));}
    bindForSubMesh(ubo){for(const [name,t]of Object.entries(maps))ubo.setTexture(name,t);}
    isReadyForSubMesh(){return Object.values(maps).every(t=>t.isReady());}
    getCustomCode(type){return type==='fragment'?{
      CUSTOM_FRAGMENT_DEFINITIONS:`
uniform sampler2D tlEarth;uniform sampler2D tlGravel;uniform sampler2D tlRock;
uniform sampler2D tlEarthNR;uniform sampler2D tlGravelNR;uniform sampler2D tlRockNR;uniform sampler2D tlControl;
uniform sampler2D tlNativeGrass;uniform sampler2D tlNativeLand;
vec4 tlWeights;vec3 tlPackedNormal;float tlRough;
// Two incommensurate, rotated photographic fields; broad variation is baked once.
vec4 tlSample(sampler2D image,vec2 p,float metres){
 vec2 a=p/metres;vec2 b=mat2(.799,-.602,.602,.799)*a*.713+vec2(17.31,43.73);
 return mix(texture2D(image,a),texture2D(image,b),.38);
}
vec4 tlSampleNR(sampler2D image,vec2 p,float metres){
 vec2 a=p/metres,b=mat2(.799,-.602,.602,.799)*a*.713+vec2(17.31,43.73);
 vec4 na=texture2D(image,a),nb=texture2D(image,b);vec3 va=na.xyz*2.-1.,vb=nb.xyz*2.-1.;
 vb.xy=mat2(.799,.602,-.602,.799)*vb.xy;
 return vec4(normalize(mix(va,vb,.38))*.5+.5,mix(na.a,nb.a,.38));
}
`,
      CUSTOM_FRAGMENT_BEFORE_LIGHTS:`
vec2 tlUV=(vPositionW.xz-vec2(${patch.x-patch.width/2},${patch.z-patch.depth/2}))/vec2(${patch.width},${patch.depth});
tlWeights=texture2D(tlControl,clamp(tlUV,0.,1.));
float tlWear=tlWeights.r;float tlGravelMix=tlWeights.g;float tlStone=tlWeights.b;
// Geology follows the actual landform; road wear still protects the track.
float tlSlope=1.-smoothstep(.70,.93,abs(geometricNormalW.y));
tlStone=max(tlStone,tlSlope*${profile.rock.toFixed(3)}*(1.-tlWear));
vec3 tlE=toLinearSpace(tlSample(tlEarth,vPositionW.xz,3.6).rgb);
vec3 tlG=toLinearSpace(tlSample(tlGravel,vPositionW.xz,2.05).rgb);
vec3 tlR=toLinearSpace(tlSample(tlRock,vPositionW.xz,3.2).rgb);
// Warm maintained earth, pale grey-beige aggregate; no black wet-soil band.
float tlEL=dot(tlE,vec3(.2126,.7152,.0722));tlE=mix(tlE,vec3(tlEL),.26)*vec3(1.23,1.10,.87);
float tlGL=dot(tlG,vec3(.2126,.7152,.0722));tlG=mix(tlG,vec3(tlGL),.38)*vec3(1.24,1.19,1.06);
float tlRL=dot(tlR,vec3(.2126,.7152,.0722));tlR=mix(tlR,vec3(tlRL),.24)*vec3(1.23,1.18,1.06);
float tlMicro=sin(vPositionW.x*1.21+sin(vPositionW.z*.83))*.025;
vec4 tlLand=texture2D(tlNativeLand,(vPositionW.xz-vec2(-1290.,-390.))/vec2(1012.,495.));
vec3 tlSoil=tlE*(.88+tlLand.a*.25+tlMicro);
tlSoil=mix(tlSoil,tlSoil*vec3(.80,.90,.68),${profile.natural.toFixed(3)}*(1.-tlWear)*.35);
vec3 tlFinish=mix(mix(tlSoil,tlG,tlGravelMix),tlR,tlStone);
// Preserve the selected countryside's photographed meadow/litter at the edge.
// These are borrowed native maps: no duplicate grass image or ownership change.
vec3 tlGrassA=toLinearSpace(texture2D(tlNativeGrass,vPositionW.xz/3.6).rgb);
vec3 tlGrassB=toLinearSpace(texture2D(tlNativeGrass,mat2(.8,-.6,.6,.8)*vPositionW.xz/7.7+vec2(.37,.71)).rgb);
vec3 tlGrass=mix(tlGrassA,tlGrassB,.18+smoothstep(.25,.8,tlLand.a)*.16);
vec3 tlMeadow=tlGrass*mix(vec3(.96,1.30,.98),vec3(1.045,1.16,.92),tlLand.g)*(.91+tlLand.a*.23);
float tlMottle=texture2D(tlRock,vPositionW.xz/18.+vec2(.31,.67)).r;
float tlLitter=tlLand.r*smoothstep(.28,.72,tlMottle)*.65;
vec3 tlFloor=mix(tlE*vec3(.58,.62,.43),tlGrass*vec3(.81,.80,.52),.63)*(.76+tlMottle*.55);
vec3 tlNativeField=mix(tlMeadow,tlFloor,tlLitter);
tlNativeField=mix(tlNativeField,mix(tlE,tlG,.58),tlWear);
float tlNatural=(1.-tlWear)*${profile.natural.toFixed(3)}*(.35+tlLand.a*.50)*(1.-${profile.earth.toFixed(3)}*.30);
tlFinish=mix(tlFinish,tlNativeField,tlNatural);
// Paired wheel wear is baked from distance to the actual curved road in G.
// It changes fine aggregate appearance only; road geometry stays untouched.
surfaceAlbedo=mix(tlNativeField,clamp(tlFinish,vec3(.04),vec3(.72)),tlWeights.a);
vec4 tlEN=tlSampleNR(tlEarthNR,vPositionW.xz,3.6),tlGN=tlSampleNR(tlGravelNR,vPositionW.xz,2.05),tlRN=tlSampleNR(tlRockNR,vPositionW.xz,3.2);
tlPackedNormal=mix(mix(tlEN.xyz,tlGN.xyz,tlGravelMix),tlRN.xyz,tlStone)*2.-1.;
// Reconstruct a terrain-aligned frame from the true geometric normal.
vec3 tlN=normalize(geometricNormalW);vec3 tlT=normalize(vec3(1.,0.,0.)-tlN*tlN.x);vec3 tlB=normalize(cross(tlT,tlN));
normalW=normalize(tlN*max(.4,tlPackedNormal.z)+tlT*tlPackedNormal.x*.38+tlB*tlPackedNormal.y*.38);
tlRough=mix(mix(tlEN.a,tlGN.a,tlGravelMix),tlRN.a,tlStone);
`,
      CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS:'metallicRoughness.g=clamp(.76+tlRough*.23,.82,.995);metallicRoughness.r=0.;'
    }:null;}
  }
  const plugin=new MediterraneanTerrain();
  if(host){
    const originalCode=plugin.getCustomCode.bind(plugin),names=['tlRock','tlEarthNR','tlGravelNR','tlRockNR','tlControl'];
    plugin.enabled=true;plugin.getUniforms=()=>({ubo:[{name:'tlEnabled',size:1,type:'float'}],fragment:'#ifndef UNIFORMBUFFERS\nuniform float tlEnabled;\n#endif'});
    plugin.getSamplers=list=>list.push(...names);plugin.bindForSubMesh=ubo=>{ubo.updateFloat('tlEnabled',plugin.enabled?1:0);for(const name of names)ubo.setTexture(name,maps[name]);};
    plugin.getCustomCode=type=>{
      const code=originalCode(type);if(!code)return code;
      code.CUSTOM_FRAGMENT_DEFINITIONS=code.CUSTOM_FRAGMENT_DEFINITIONS.replace('uniform sampler2D tlEarth;uniform sampler2D tlGravel;','').replace('uniform sampler2D tlNativeGrass;uniform sampler2D tlNativeLand;','')+'\nfloat tlCoverage;';
      let body=code.CUSTOM_FRAGMENT_BEFORE_LIGHTS;
      const start=body.indexOf('// Preserve the selected countryside'),end=body.indexOf('// Paired wheel wear',start);if(start<0||end<0)throw Error('Approved edge adaptation anchor changed');
      body=body.slice(0,start)+'vec3 tlNativeField=surfaceAlbedo;\n'+body.slice(end);
      body=body.replace(/vec4 tlLand=texture2D\(tlNativeLand,[^;]+;/,'vec4 tlLand=vec4(0.,0.,0.,hgCachedFinish.b);');
      body=body.replace(/\btlEarth\b/g,'agoraSoil').replace(/\btlGravel\b/g,'agoraTrail');
      body=body.replace('float tlWear=tlWeights.r;','tlCoverage=tlWeights.a*smoothstep('+Number(host.sea+.08).toFixed(5)+','+Number(host.sea+.35).toFixed(5)+',vPositionW.y);tlCoverage*=hgCachedFinish.r>.01?smoothstep(0.,.10,hgCachedWeights.x):1.;float tlWear=tlWeights.r;');
      body=body.replace('vec3(.72)),tlWeights.a);','vec3(.72)),tlCoverage);');
      body=body.replace('normalW=normalize(tlN*max(.4,tlPackedNormal.z)+tlT*tlPackedNormal.x*.38+tlB*tlPackedNormal.y*.38);','normalW=normalize(mix(normalW,normalize(tlN*max(.4,tlPackedNormal.z)+tlT*tlPackedNormal.x*.38+tlB*tlPackedNormal.y*.38),tlCoverage));');
      body=body.replace(/(tlSample(?:NR)?\([^,]+,)vPositionW\.xz/g,'$1(vPositionW.xz*appearanceAgoraScale)');
      code.CUSTOM_FRAGMENT_BEFORE_LIGHTS='if(tlEnabled>.5){'+body+'}';
      code.CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS='if(tlEnabled>.5){metallicRoughness.g=mix(metallicRoughness.g,clamp(.76+tlRough*.23,.82,.995),tlCoverage);}';return code;
    };
  }
  m.metadata={...m.metadata,terrainPrototype:{samplers:9,borrowedSamplers:2,lighting:'Selected native scene unchanged',packedMaps:'RGB OpenGL tangent normal + A roughness',profile:profile.label,collisionDisplacement:'CPU vertex buffer only',newPerFrameObservers:0,comparisonScalarPerMaterialBind:host?1:0}};
  return {material:m,plugin,maps};
}
