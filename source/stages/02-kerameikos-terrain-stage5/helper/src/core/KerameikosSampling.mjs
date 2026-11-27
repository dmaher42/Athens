/** Sampling adapter for the approved factory. With a zero rock
 * blend weight the rock colour/normal cannot affect any output. All nonzero
 * layers retain both full-resolution rotated photographic samples. Explicit
 * gradients preserve mip selection at divergent blend boundaries. */
export function optimiseZeroRockLayer(plugin,engine){if(engine.webGLVersion<2)return false;const codeBefore=plugin.getCustomCode.bind(plugin),uniformsBefore=plugin.getUniforms.bind(plugin),bindBefore=plugin.bindForSubMesh.bind(plugin);plugin.sparseRock=true;plugin.sparseCoverage=true;plugin.getUniforms=()=>{const u=uniformsBefore();return{...u,ubo:[...u.ubo,{name:'kgSparseRock',size:1,type:'float'},{name:'kgSparseCoverage',size:1,type:'float'}],fragment:u.fragment+'\n#ifndef UNIFORMBUFFERS\nuniform float kgSparseRock;uniform float kgSparseCoverage;\n#endif'}};plugin.bindForSubMesh=(ubo,...args)=>{bindBefore(ubo,...args);ubo.updateFloat('kgSparseRock',plugin.sparseRock?1:0);ubo.updateFloat('kgSparseCoverage',plugin.sparseCoverage?1:0)};plugin.getCustomCode=type=>{const c=codeBefore(type);if(!c||type!=='fragment')return c;c.CUSTOM_FRAGMENT_DEFINITIONS+=`
vec2 kgEaDx,kgEaDy,kgEbDx,kgEbDy,kgGaDx,kgGaDy,kgGbDx,kgGbDy,kgRaDx,kgRaDy,kgRbDx,kgRbDy;
void kgPrepareD(vec2 p,float metres,out vec2 ax,out vec2 ay,out vec2 bx,out vec2 by){
 vec2 a=p/metres,b=mat2(.799,-.602,.602,.799)*a*.713+vec2(17.31,43.73);
 ax=dFdx(a);ay=dFdy(a);bx=dFdx(b);by=dFdy(b);
}
void kgReadD(float metres,out vec2 ax,out vec2 ay,out vec2 bx,out vec2 by){
 if(metres>3.5){ax=kgEaDx;ay=kgEaDy;bx=kgEbDx;by=kgEbDy;}
 else if(metres>3.1){ax=kgRaDx;ay=kgRaDy;bx=kgRbDx;by=kgRbDy;}
 else{ax=kgGaDx;ay=kgGaDy;bx=kgGbDx;by=kgGbDy;}
}
vec4 kgSampleColour(sampler2D image,vec2 p,float metres){
 if(kgSparseCoverage<.5)return tlSample(image,p,metres);
 vec2 a=p/metres,ax,ay,bx,by;kgReadD(metres,ax,ay,bx,by);
 mat2 r=mat2(.799,-.602,.602,.799);vec2 b=r*a*.713+vec2(17.31,43.73);
 return mix(textureGrad(image,a,ax,ay),textureGrad(image,b,bx,by),.38);
}
vec4 kgSampleNormal(sampler2D image,vec2 p,float metres){
 if(kgSparseCoverage<.5)return tlSampleNR(image,p,metres);
 vec2 a=p/metres,ax,ay,bx,by;kgReadD(metres,ax,ay,bx,by);
 mat2 r=mat2(.799,-.602,.602,.799);vec2 b=r*a*.713+vec2(17.31,43.73);
 vec4 na=textureGrad(image,a,ax,ay),nb=textureGrad(image,b,bx,by);
 vec3 va=na.xyz*2.-1.,vb=nb.xyz*2.-1.;vb.xy=mat2(.799,.602,-.602,.799)*vb.xy;
 return vec4(normalize(mix(va,vb,.38))*.5+.5,mix(na.a,nb.a,.38));
}
`;c.CUSTOM_FRAGMENT_MAIN_BEGIN+='\nkgPrepareD(vPositionW.xz*appearanceAgoraScale,3.6,kgEaDx,kgEaDy,kgEbDx,kgEbDy);kgPrepareD(vPositionW.xz*appearanceAgoraScale,2.05,kgGaDx,kgGaDy,kgGbDx,kgGbDy);kgPrepareD(vPositionW.xz*appearanceAgoraScale,3.2,kgRaDx,kgRaDy,kgRbDx,kgRbDy);';let body=c.CUSTOM_FRAGMENT_BEFORE_LIGHTS;const rock=body.split('\n').find(l=>l.startsWith('vec3 tlR=')),normal=body.split('\n').find(l=>l.startsWith('vec4 tlEN='));if(!rock||!normal||!normal.includes(',tlRN='))throw Error('Approved photographic layer anchors changed');const colour=rock.slice('vec3 tlR='.length,-1).replace('tlSample(','kgSampleColour('),nr=normal.slice(normal.indexOf(',tlRN=')+',tlRN='.length,-1).replace('tlSampleNR(','kgSampleNormal('),normalStart=normal.slice(0,normal.indexOf(',tlRN='));body=body.replace(rock,'vec3 tlR=vec3(0.);if(kgSparseRock<.5||tlStone>0.){tlR='+colour+';}');body=body.replace(normal,normalStart+',tlRN=vec4(.5,.5,1.,1.);if(kgSparseRock<.5||tlStone>0.){tlRN='+nr+';}');body=body.replace(/\btlSampleNR\(/g,'kgSampleNormal(').replace(/\btlSample\(/g,'kgSampleColour(');const condition='if(tlEnabled>.5&&(kgSparseCoverage<.5||kgReplaceCoverage>0.)){';if(!body.includes('if(tlEnabled>.5){')||!c.CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS.includes('if(tlEnabled>.5){'))throw Error('Approved layer enable anchors changed');body=body.replace('if(tlEnabled>.5){',condition);c.CUSTOM_FRAGMENT_BEFORE_LIGHTS=body;c.CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS=c.CUSTOM_FRAGMENT_UPDATE_METALLICROUGHNESS.replace('if(tlEnabled>.5){',condition);return c;};return true;}
