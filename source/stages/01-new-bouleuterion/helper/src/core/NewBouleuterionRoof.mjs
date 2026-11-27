/** SDK-free New Bouleuterion roof geometry.
 *
 * The hipped form, elevations and carpentry are a coherent reconstruction,
 * not a claim that a complete ancient superstructure survived. The caller
 * owns the existing native Builder, geometry operations, materials and ledger.
 * All coordinates are local to the one council-house root; no scene service,
 * asset loader, observer, support registration or material is created here.
 */
export const NEW_BOULEUTERION_ROOF=Object.freeze({
  wallWidth:21.5,wallDepth:16.9,wallThickness:.65,
  roofWidth:22.3,roofDepth:17.7,ridgeLength:4.6,
  bearing:6.40,eaveSurface:6.64,ridgeSurface:8.70,deckThickness:.09,
  principalColumns:Object.freeze([
    Object.freeze({x:-3.02,z:-5.5,bearing:6.40}),Object.freeze({x:-3.02,z:5.5,bearing:6.40}),
    Object.freeze({x:3.02,z:-5.5,bearing:6.40}),Object.freeze({x:3.02,z:5.5,bearing:6.40}),
  ]),
  tilePitch:.50,tileRun:.52,
});

export function buildNewBouleuterionRoof(k,G,m){
  for(const name of ['timber','clay','clayLight'])if(!m[name])throw Error('Council roof material unavailable: '+name);
  for(const name of ['data','polygon','prism','mesh'])if(typeof G[name]!=='function')throw Error('Existing council geometry operation unavailable: '+name);
  const A=NEW_BOULEUTERION_ROOF,L=A.roofWidth/2,D=A.roofDepth/2,R=A.ridgeLength/2,
    pitch=(A.ridgeSurface-A.eaveSurface)/D,
    roofY=(x,z)=>A.ridgeSurface-pitch*Math.max(Math.abs(z),Math.abs(x)-R),
    under=(x,z)=>roofY(x,z)-A.deckThickness,
    wood=G.data(),deck=G.data(),pans=G.data(),covers=G.data(),ornament=G.data(),
    cameraBoxes=[],members=[],faceReports=[];
  const polygon=(d,points,normal=[0,1,0],tone=1)=>G.polygon(d,points,normal,1,tone);
  const box=(d,x,y,z,w,h,depth,tone=1)=>{
    if(!(w>0&&h>0&&depth>0))throw Error('Nonpositive council roof member');
    G.prism(d,'x',[x,0,z],w,[[-depth/2,y-h/2],[depth/2,y-h/2],[depth/2,y+h/2],[-depth/2,y+h/2]],tone);
  };
  // A rectangular-section member between arbitrary 3D points. Its top and
  // bottom use a vertical section so roof contacts are explicit and repeatable.
  const beam=(d,id,a,b,width,height,tone=1)=>{
    const dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);
    if(!(length>1e-6&&width>0&&height>0))throw Error('Invalid roof beam '+id);
    const side=[-dz/length*width/2,0,dx/length*width/2],
      at=(p,s,y)=>[p[0]+side[0]*s,p[1]+y,p[2]+side[2]*s],
      corners=[at(a,-1,-height/2),at(a,1,-height/2),at(b,1,-height/2),at(b,-1,-height/2),
        at(a,-1,height/2),at(a,1,height/2),at(b,1,height/2),at(b,-1,height/2)];
    const faces=[[[0,1,2,3],[0,-1,0]],[[4,7,6,5],[0,1,0]],
      [[0,4,5,1],[-dx,0,-dz]],[[3,2,6,7],[dx,0,dz]],
      [[0,3,7,4],[-side[0],0,-side[2]]],[[1,5,6,2],[side[0],0,side[2]]]];
    for(const[indices,normal]of faces)polygon(d,indices.map(i=>corners[i]),normal,tone);
    members.push({id,from:a,to:b,width,height});
  };
  const post=(id,x,z,bottom,top,width=.18)=>{
    if(top<=bottom)throw Error('Council roof post has no bearing height: '+id);
    box(wood,x,(bottom+top)/2,z,width,top-bottom,width);
    members.push({id,x,z,bottom,top,width});
  };

  // The perimeter wall plates start exactly on the 6.40m masonry bearing.
  // Their profiled tops meet the rafters, including the hips at the corners.
  const plateHalf=.18,wallX=A.wallWidth/2-.325,wallZ=A.wallDepth/2-.325;
  for(const s of[-1,1]){
    const z=s*wallZ;
    G.prism(wood,'x',[0,0,0],A.wallWidth-.30,
      [[z-plateHalf,A.bearing],[z+plateHalf,A.bearing],
        [z+plateHalf,under(0,z+plateHalf)-.12],[z-plateHalf,under(0,z-plateHalf)-.12]]);
    const x=s*wallX;
    G.prism(wood,'z',[0,0,0],A.wallDepth-.30,
      [[x-plateHalf,A.bearing],[x+plateHalf,A.bearing],
        [x+plateHalf,under(x+plateHalf,0)-.12],[x-plateHalf,under(x-plateHalf,0)-.12]]);
  }
  // Two cross-hall principal frames bear directly on the four real columns.
  // Their longitudinal ties also reach the end walls; none floats on a dark
  // ceiling plane or on an invented fifth central support.
  for(const x of[-3.02,3.02]){
    box(wood,x,A.bearing+.16,0,.34,.32,A.wallDepth-.30);
    members.push({id:'principal transverse tie',x,bottom:A.bearing,top:A.bearing+.32,zEnds:[-8.30,8.30]});
    for(const z of[-5.5,5.5])post('principal post above capital',x,z,A.bearing+.32,under(x,z)-.16,.20);
    post('principal king post',x,0,A.bearing+.32,under(x,0)-.20,.20);
    for(const side of[-1,1]){
      beam(wood,'principal raking chord',[x,under(x,0)-.10,0],[x,under(x,side*8.4)-.10,side*8.4],.22,.20);
      beam(wood,'principal diagonal strut',[x,A.bearing+.41,side*5.5],[x,under(x,side*1.9)-.26,side*1.9],.16,.18,.98);
    }
  }
  for(const z of[-5.5,5.5]){
    box(wood,0,A.bearing+.14,z,A.wallWidth-.30,.28,.34);
    members.push({id:'longitudinal tie above columns',z,bottom:A.bearing,top:A.bearing+.28,xEnds:[-10.60,10.60]});
  }
  // Ridge spine slopes down onto the two principal hip-end frames; its top
  // follows the deck so its short end portions do not protrude through a hip.
  box(wood,0,under(0,0)-.12,0,A.ridgeLength,.24,.28);
  for(const side of[-1,1])beam(wood,'ridge end bearing',
    [side*R,under(side*R,0)-.12,0],[side*3.14,under(side*3.14,0)-.12,0],.28,.24);

  // Four roofs share exactly these boundaries. A timber soffit and ceramic
  // bedding close every face, using the same surface equations as the tiles.
  const faces=[
    {id:'east long slope',axis:'z',sign:1,outline:[[-L,D],[L,D],[R,0],[-R,0]]},
    {id:'west long slope',axis:'z',sign:-1,outline:[[-L,-D],[-R,0],[R,0],[L,-D]]},
    {id:'south hip',axis:'x',sign:1,outline:[[L,-D],[R,0],[L,D]]},
    {id:'north hip',axis:'x',sign:-1,outline:[[-L,-D],[-L,D],[-R,0]]},
  ];
  for(const face of faces){
    polygon(deck,face.outline.map(([x,z])=>[x,under(x,z),z]),[0,-1,0]);
    polygon(pans,face.outline.map(([x,z])=>[x,roofY(x,z)-.012,z]),[0,1,0]);
  }
  // Closed fascia and the real roof-deck edge. At the wall line the rafters
  // sit on the plates; outside it their short tails remain visible at the eave.
  for(const s of[-1,1]){
    box(wood,0,A.eaveSurface-.09,s*D,A.roofWidth,.18,.10);
    box(wood,s*L,A.eaveSurface-.09,0,.10,.18,A.roofDepth);
  }

  // Purlins follow the hip outline instead of running through the triangular
  // end roofs. Common rafters meet those purlins and the perimeter wall plates.
  for(const zAbs of[2.8,5.5,7.6])for(const s of[-1,1]){
    const z=s*zAbs,half=R+zAbs;
    box(wood,0,under(0,z)-.17,z,half*2-.18,.20,.16);
  }
  const rafters=Math.ceil(A.roofWidth/.58);
  for(let i=0;i<=rafters;i++){
    const x=-L+i*A.roofWidth/rafters,near=Math.max(0,Math.abs(x)-R);
    if(D-near<.12)continue;
    for(const side of[-1,1])beam(wood,'common long-slope rafter',
      [x,under(x,side*near)-.07,side*near],
      [x,under(x,side*D)-.07,side*D],.075,.14,.97);
  }
  const endRafters=Math.ceil(A.roofDepth/.58);
  for(let i=0;i<=endRafters;i++){
    const z=-D+i*A.roofDepth/endRafters,near=R+Math.abs(z);
    if(L-near<.12)continue;
    for(const side of[-1,1])beam(wood,'common hip-slope rafter',
      [side*near,under(side*near,z)-.07,z],
      [side*L,under(side*L,z)-.07,z],.075,.14,.97);
  }
  for(const sx of[-1,1])for(const sz of[-1,1])beam(wood,'principal diagonal hip rafter',
    [sx*R,under(sx*R,0)-.11,0],[sx*L,under(sx*L,sz*D)-.11,sz*D],.24,.22);

  // Clip individual tile footprints against their actual trapezoid/triangle.
  // This avoids floating rectangular tiles beyond the four hip lines.
  const signedArea=ps=>ps.reduce((sum,p,i)=>{const q=ps[(i+1)%ps.length];return sum+p[0]*q[1]-q[0]*p[1];},0)/2;
  const clip=(input,outline)=>{
    let ps=input;const sign=Math.sign(signedArea(outline));
    for(let e=0;e<outline.length;e++){
      const a=outline[e],b=outline[(e+1)%outline.length],
        distance=p=>sign*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]));
      const next=[];
      for(let i=0;i<ps.length;i++){
        const p=ps[i],q=ps[(i+1)%ps.length],dp=distance(p),dq=distance(q);
        if(dp>=-1e-9)next.push(p);
        if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);next.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
      }
      ps=next;if(ps.length<3)return[];
    }
    // Repeated clipping corners produce zero-length edges; remove them before
    // cap triangulation so all emitted normal vectors remain well-defined.
    ps=ps.filter((p,i)=>Math.hypot(p[0]-ps[(i+ps.length-1)%ps.length][0],p[1]-ps[(i+ps.length-1)%ps.length][1])>1e-7);
    return ps.filter((p,i)=>{const a=ps[(i+ps.length-1)%ps.length],b=ps[(i+1)%ps.length];
      return Math.abs((p[0]-a[0])*(b[1]-p[1])-(p[1]-a[1])*(b[0]-p[0]))>1e-10;});
  };
  let tileCount=0,coverRuns=0;
  const tile=(face,foot,lift,tone)=>{
    if(foot.length<3||Math.abs(signedArea(foot))<.002)return;
    const orientation=Math.sign(signedArea(foot)),top=foot.map(([x,z])=>[x,roofY(x,z)+lift,z]);
    polygon(pans,top,[0,1,0],tone);tileCount++;
    for(let i=0;i<foot.length;i++){
      const a=foot[i],b=foot[(i+1)%foot.length],ta=top[i],tb=top[(i+1)%foot.length];
      polygon(pans,[ta,tb,[tb[0],tb[1]-.032,tb[2]],[ta[0],ta[1]-.032,ta[2]]],
        [orientation*(b[1]-a[1]),0,orientation*(a[0]-b[0])],tone*.99);
    }
  };
  const roundCover=(axis,across,start,end,lift,radius=.057)=>{
    if(end-start<.06)return;
    const at=(along,a)=>{
      const u=across+Math.cos(a)*radius,
        x=axis==='z'?u:along,z=axis==='z'?along:u;
      return[x,roofY(x,z)+lift+Math.sin(a)*radius,z];
    };
    for(let j=0;j<6;j++){
      const a=j*Math.PI/6,b=(j+1)*Math.PI/6;
      polygon(covers,[at(start,a),at(start,b),at(end,b),at(end,a)],[0,1,0]);
    }
    coverRuns++;
  };
  for(const face of faces){
    const long=face.axis==='z',acrossSpan=long?A.roofWidth:A.roofDepth,
      count=Math.ceil(acrossSpan/A.tilePitch),acrossPitch=acrossSpan/count,
      rows=Math.ceil(D/A.tileRun),run=D/rows;
    let faceTiles=0;const beforeTiles=tileCount,beforeCovers=coverRuns;
    for(let row=0;row<rows;row++)for(let col=0;col<count;col++){
      const a0=-acrossSpan/2+col*acrossPitch+.007,a1=a0+acrossPitch-.014,
        d0=Math.max(0,row*run-.035),d1=Math.min(D,(row+1)*run+.045),
        along0=long?face.sign*d0:face.sign*(R+d0),
        along1=long?face.sign*d1:face.sign*(R+d1),
        rect=long?[[a0,along0],[a1,along0],[a1,along1],[a0,along1]]:
          [[along0,a0],[along1,a0],[along1,a1],[along0,a1]],
        foot=clip(rect,face.outline),lift=.024+(rows-row)*.0025,
        tone=.965+.05*(.5+.5*Math.sin(row*13.137+col*29.717));
      tile(face,foot,lift,tone);
      const across=a0-.007,minimum=long?Math.max(0,Math.abs(across)-R):Math.abs(across),
        from=Math.max(d0,minimum),to=d1;
      if(to-from>.06){
        const start=long?face.sign*from:face.sign*(R+from),
          end=long?face.sign*to:face.sign*(R+to);
        roundCover(face.axis,across,Math.min(start,end),Math.max(start,end),lift+.019);
      }
    }
    faceTiles=tileCount-beforeTiles;
    faceReports.push({id:face.id,axis:face.axis,sign:face.sign,planPolygon:face.outline,tiles:faceTiles,coverRuns:coverRuns-beforeCovers});
  }
  // The four diagonal hip cap chains cover the clipped pan/cover joins. Their
  // half-round cross sections follow the real pitched diagonal, not a flat rail.
  const capChain=(id,a,b,radius=.13)=>{
    const dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz),
      cross=[-dz/length,0,dx/length],count=Math.ceil(length/.53),
      at=(t,angle)=>[a[0]+dx*t+cross[0]*Math.cos(angle)*radius,
        a[1]+(b[1]-a[1])*t+.06+Math.sin(angle)*radius,
        a[2]+dz*t+cross[2]*Math.cos(angle)*radius];
    for(let i=0;i<count;i++){
      const t0=Math.max(0,i/count-.0025),t1=Math.min(1,(i+1)/count+.0025);
      for(let j=0;j<8;j++){
        const u=j*Math.PI/8,v=(j+1)*Math.PI/8;
        polygon(covers,[at(t0,u),at(t1,u),at(t1,v),at(t0,v)],[0,1,0]);
      }
      if(i===0||i===count-1){const t=i===0?t0:t1;
        polygon(covers,Array.from({length:9},(_,j)=>at(t,j*Math.PI/8)),[i===0?-dx:dx,0,i===0?-dz:dz]);}
    }
    return{id,tileCount:count,from:a,to:b,radius};
  };
  const capReports=[];
  capReports.push(capChain('short ridge',[-R,A.ridgeSurface,0],[R,A.ridgeSurface,0],.14));
  for(const sx of[-1,1])for(const sz of[-1,1])capReports.push(capChain('diagonal hip '+sx+' '+sz,
    [sx*R,A.ridgeSurface,0],[sx*L,A.eaveSurface,sz*D]));

  // A restrained pair of ceramic palmettes, not an invented statuary group.
  const palmette=(x,y,z,width,height)=>{
    const profile=[[0,y+height*.20]];
    for(let i=0;i<=32;i++){
      const angle=Math.PI-i*Math.PI/32,scallop=.92+.08*Math.cos(angle*16);
      profile.push([Math.cos(angle)*width*.5*scallop,y+height*.25+Math.sin(angle)*height*.75*scallop]);
    }
    G.prism(ornament,'x',[x,0,z],.065,signedArea(profile)>0?profile:[profile[0],...profile.slice(1).reverse()]);
    G.prism(ornament,'x',[x,0,z],.075,[[-width*.18,y],[width*.18,y],[width*.18,y+height*.28],[-width*.18,y+height*.28]]);
  };
  for(const sx of[-1,1])palmette(sx*R,A.ridgeSurface+.17,0,.34,.43);

  // Compact native-box camera proxies stay inside each roof face. Thin hip
  // boxes cover the narrow triangular band omitted by those inscribed strips.
  const bands=18;
  for(const face of faces)for(let i=0;i<bands;i++){
    const a=i*D/bands,b=(i+1)*D/bands,small=face.axis==='z'?R+a:a;
    if(small<.05)continue;
    const along=(a+b)/2,low=A.ridgeSurface-pitch*b,high=A.ridgeSurface-pitch*a;
    cameraBoxes.push({x:face.axis==='z'?0:face.sign*(R+along),y:(low+high)/2,
      z:face.axis==='z'?face.sign*along:0,hx:face.axis==='z'?small:(b-a)/2,
      hy:(high-low)/2+.12,hz:face.axis==='z'?(b-a)/2:small,yaw:0,source:face.id});
  }
  for(const sx of[-1,1])for(const sz of[-1,1])for(let i=0;i<12;i++){
    const t0=i/12,t1=(i+1)/12,tm=(t0+t1)/2,
      y0=A.ridgeSurface-(A.ridgeSurface-A.eaveSurface)*t0,
      y1=A.ridgeSurface-(A.ridgeSurface-A.eaveSurface)*t1;
    cameraBoxes.push({x:sx*(R+D*tm),y:(y0+y1)/2,z:sz*D*tm,
      hx:D*Math.SQRT2/24+.04,hy:Math.abs(y1-y0)/2+.15,hz:.19,
      yaw:Math.atan2(-sz,sx),source:'diagonal hip'});
  }
  cameraBoxes.push({x:0,y:A.ridgeSurface+.08,z:0,hx:R+.08,hy:.14,hz:.20,yaw:0,source:'short ridge caps'});

  // Camera segments must also meet the lower, visibly open structural frame.
  // These are metadata only: every rendered vertex and material stays intact.
  const framingCameraStart=cameraBoxes.length;
  for(const member of members){
    if(member.id.startsWith('common '))continue;
    if(member.zEnds){
      cameraBoxes.push({x:member.x,y:(member.bottom+member.top)/2,z:0,hx:.17,
        hy:(member.top-member.bottom)/2,hz:(member.zEnds[1]-member.zEnds[0])/2,yaw:0,source:member.id});
    }else if(member.xEnds){
      cameraBoxes.push({x:0,y:(member.bottom+member.top)/2,z:member.z,
        hx:(member.xEnds[1]-member.xEnds[0])/2,hy:(member.top-member.bottom)/2,hz:.17,yaw:0,source:member.id});
    }else if(member.bottom!==undefined){
      cameraBoxes.push({x:member.x,y:(member.bottom+member.top)/2,z:member.z,
        hx:member.width/2,hy:(member.top-member.bottom)/2,hz:member.width/2,yaw:0,source:member.id});
    }else if(member.from&&member.to){
      const a=member.from,b=member.to,dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],
        length=Math.hypot(dx,dz),count=Math.max(1,Math.ceil(length/.8),Math.ceil(Math.abs(dy)/.24));
      for(let i=0;i<count;i++){
        const t=(i+.5)/count;
        cameraBoxes.push({x:a[0]+dx*t,y:a[1]+dy*t,z:a[2]+dz*t,
          hx:length/count/2,hy:(member.height+Math.abs(dy)/count)/2,hz:member.width/2,
          yaw:Math.atan2(-dz,dx),source:member.id});
      }
    }
  }
  cameraBoxes.push({x:0,y:under(0,0)-.12,z:0,hx:R,hy:.12,hz:.14,yaw:0,source:'central ridge spine'});
  for(const zAbs of[2.8,5.5,7.6])for(const side of[-1,1]){
    const z=side*zAbs;cameraBoxes.push({x:0,y:under(0,z)-.17,z,
      hx:R+zAbs-.09,hy:.10,hz:.08,yaw:0,source:'longitudinal purlin'});
  }
  for(const side of[-1,1]){
    const z=side*wallZ,topZ=Math.max(under(0,z-plateHalf),under(0,z+plateHalf))-.12;
    cameraBoxes.push({x:0,y:(A.bearing+topZ)/2,z,hx:(A.wallWidth-.30)/2,
      hy:(topZ-A.bearing)/2,hz:plateHalf,yaw:0,source:'long wall plate'});
    const x=side*wallX,topX=Math.max(under(x-plateHalf,0),under(x+plateHalf,0))-.12;
    cameraBoxes.push({x,y:(A.bearing+topX)/2,z:0,hx:plateHalf,
      hy:(topX-A.bearing)/2,hz:(A.wallDepth-.30)/2,yaw:0,source:'end wall plate'});
  }

  const groups=[['fitted principal frames, purlins and rafters',wood,m.timber],
    ['continuous four-plane timber underside',deck,m.timber],['clipped overlapping clay pan tiles',pans,m.clay],
    ['round cover tiles, hips and short ridge',covers,m.clayLight],['restrained ridge-end palmettes',ornament,m.clayLight]],
    sourceMeshNames=[];
  let triangles=0,vertices=0,bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const[name,data,material]of groups){
    if(!data.ix.length)continue;
    if(data.p.some(v=>!Number.isFinite(v)))throw Error('Nonfinite council roof geometry: '+name);
    for(let i=0;i<data.p.length;i++){
      bounds.min[i%3]=Math.min(bounds.min[i%3],data.p[i]);bounds.max[i%3]=Math.max(bounds.max[i%3],data.p[i]);
    }
    triangles+=data.ix.length/3;vertices+=data.p.length/3;
    sourceMeshNames.push(G.mesh(k,'New Bouleuterion '+name,data,material).name);
  }
  return{version:1,owner:'NewBouleuterionRoof.mjs',architecture:A,localBounds:bounds,
    supportBearings:A.principalColumns,wallBearing:A.bearing,principalMembers:members,
    roofFaces:faceReports,tileCount,coverRuns,capChains:capReports,triangles,vertices,sourceMeshNames,
    cameraBoxes,cameraProxyVersion:2,framingCameraBoxes:cameraBoxes.length-framingCameraStart,
    cameraProxiesAreRoofOnly:true,roofWalkingSupportAdded:false,
    staticGeometryOnly:true,newFrameUpdates:0,newExternalAssets:0,qualityReduction:false,
    interpretation:'Hipped timber-and-terracotta reconstruction: exact elevation, carpentry and roof form are uncertain. Four column positions and the accepted main plan constrain the visible load paths; ceramic ornament is restrained.'};
}
