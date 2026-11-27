// Approved western expansion: both gates move 40 game metres west together.
// Approximate visual interpretation, not a surveyed reconstruction; +X east, +Z north.
export const CITY_GATES=Object.freeze([
 // Approximate 41m gate-to-outer-tower court depth and 22m wall-to-wall width.
 // The cityward portal stays fixed; this is a historical scale target, not a survey.
 {id:'dipylon',label:'Dipylon',x:-279,z:14,depth:45,half:11.75,passages:[-2.5,2.5],clear:4,towers:4},
 {id:'sacred-gate',label:'Sacred Gate',x:-279,z:-22,depth:8,half:6.8,passages:[0],clear:5.2,towers:2},
]);
export const DIPYLON_ENTRY=[[-211,50],[-211,35],[-275,35],[-275,14],[-277,11.5],[-282,11.5],[-306,11.5],[-324,11.5],[-331,14]];
export const DIPYLON_ACADEMY=[[-331,14],[-331,50],[-301,100],[-301,160],[-297,199],[-230,207],[-223,210],[-218,202],[-210,194]];
export const DIPYLON_AGORA_AVENUE=[[-275,11.5],[-271,12],[-219,14],[-213,18],[-202,23],[-181,30],[-157,34],[-132,36],[-127,36],[-105,36]];
export const SACRED_GATE_CITY_ROAD=[[-295,-22],[-289,-22],[-282,-22],[-275,-22],[-222,-22],[-218,-12],[-217,1],[-217,12],[-213,18]];
export const CITY_GATE_ROUTES=Object.freeze([
 {id:'dipylon-upper-passage',width:2.6,type:'street',role:'city-gate',points:[[-271,12],[-275,14],[-277,16.5],[-282,16.5],[-306,16.5],[-324,16.5],[-331,14]]},
 {id:'sacred-gate-household-road',width:3.2,type:'street',role:'city-gate',points:SACRED_GATE_CITY_ROAD},
 {id:'sacred-way-eleusis',width:4.2,type:'path',role:'sacred-road',points:[[-295,-22],[-308,-22],[-318,-28],[-325,-35]]},
 {id:'kerameikos-outer-walk',width:2.5,type:'path',role:'cemetery',points:[[-331,14],[-336,5],[-336,-8],[-320,-22],[-295,-22]]},
 {id:'potter-northern-household-link',width:2.8,type:'alley',role:'residential',points:[[-211,85],[-211,109]]},
 {id:'dipylon-agora-avenue',width:10,startWidth:8,endWidth:11,type:'street',role:'processional',points:DIPYLON_AGORA_AVENUE},
]);
export const CITY_GATE_LOCAL_ROUTES=Object.freeze(CITY_GATES.flatMap(g=>g.passages.map((offset,i)=>({id:g.id+'-threshold-'+i,points:[[g.x+4,g.z+offset],[g.x-3,g.z+offset],[g.x-g.depth/2,g.z+offset],[g.x-g.depth-7,g.z+offset]]}))));
const out=[[-309,-22,10],...SACRED_GATE_CITY_ROAD.map(p=>[...p,0]),[-219,14,0],[-271,12,0],[-275,11.5,0],[-282,11.5,0],[-306,11.5,0],[-324,11.5,0],...DIPYLON_ACADEMY.map(p=>[...p,0]),[-210,194,18]];
// Out-and-back journeys reuse authored streets, including every gate bend.
// Returning along the same chain avoids a last-to-first shortcut through walls.
const gateRoundTrip=(points,startWait=14,endWait=18)=>[
 ...points.map(([x,z],i)=>[x,z,i===0?startWait:i===points.length-1?endWait:0]),
 ...points.slice(1,-1).reverse().map(([x,z])=>[x,z,0]),
];
const potteryGateJourney=[[-211,85],[-211,50],...DIPYLON_ENTRY.slice(1),[-331,24]];
const arrivingMarketJourney=[[-331,35],[-331,14],[-324,16.5],[-306,16.5],[-282,16.5],[-277,16.5],[-275,14],[-271,12],...DIPYLON_AGORA_AVENUE.slice(2,6)];
const cemeteryVisitJourney=[[-295,-22],[-320,-22],[-336,-8],[-336,5],[-331,14]];
export const CITY_GATE_ROUNDS=Object.freeze([
 {id:'dipylon-gatekeeper',label:'Dipylon gatekeeper',role:'citizen',speed:.5,dialogue:'Keep the passage clear for the laden carts. The potters are up the inside lane; the broad road takes you down to the Agora. Outside, turn north for the Academy.',stops:[[-283,18.5,16,Math.PI],[-287,18.5,12,Math.PI],[-283,18.5,0]]},
 {id:'sacred-gate-attendant',label:'Sacred Gate attendant',role:'citizen',speed:.46,dialogue:'You are at the Sacred Gate. This road goes west towards Eleusis. Give the mourners room when they pass; the family graves lie outside the wall.',stops:[[-282,-19.6,14,Math.PI],[-284.5,-19.6,12,Math.PI],[-282,-19.6,0]]},
 {id:'kerameikos-traveller',label:'Traveller',role:'citizen',speed:.8,dialogue:'Dust all the way from the farms, and now the smell of the kilns. I will find water before I go into the market. Are the gates always this busy?',stops:[...out,...out.slice(1,-1).reverse().map(s=>[s[0],s[1],0])]},
 {id:'kerameikos-pottery-carrier',label:'Pottery carrier',role:'artisan',cargo:'pottery',speed:.69,dialogue:'These have survived the firing. I would rather they survived the gate as well. We wrap the pots for the road; one sharp knock can undo days of work.',stops:gateRoundTrip(potteryGateJourney,16,21)},
 {id:'kerameikos-market-arrival',label:'Market traveller',role:'merchant',speed:.75,dialogue:'I left the country road at first light. Once I have found a buyer in the Agora, I can take the same gate home. There is still a long walk beyond these walls.',stops:gateRoundTrip(arrivingMarketJourney,19,24)},
 {id:'kerameikos-family-visitor',label:'Family visitor',role:'citizen',speed:.48,dialogue:'My family comes out to tend a grave beside the road. People hurry past on business, but we stop a while. Please let the procession through.',stops:gateRoundTrip(cemeteryVisitJourney,24,32)},
]);
export const KERAMEIKOS_MONUMENTS=Object.freeze([[-309,-14,1],[-346,-7,0],[-344,1,2],[-350,10,1],[-344,20,0],[-350,29,2],[-342,38,1],[-341,48,0]]);
export const KERAMEIKOS_TREES=Object.freeze([[-312,-37],[-319,-17],[-344,-3],[-350,9],[-345,35],[-341,53]]);
