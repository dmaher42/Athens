// Owner authorised exactly these four generated houses on 26 November2026 Adelaide time. Reuse existing native clearance kernel once.
const targets=[{"id": 55, "x": -188.2, "z": 63.8}, {"id": 56, "x": -176.8, "z": 63.8}, {"id": 57, "x": -165.4, "z": 63.8}, {"id": 59, "x": -176.8, "z": 75.6}];
export function clearWorkshopOverlaps(scene,colliders,puffs,approved){
 if(!approved?.removeVerifiedHouses||!Array.isArray(approved.CIRCLED_AGORA_HOUSES))throw Error('Existing approved clearance kernel required');
 for(const t of targets){const found=colliders.filter(c=>c.name==='redesign-house-'+t.id);if(found.length!==1||Math.abs(found[0].cx-t.x)>.00025||Math.abs(found[0].cz-t.z)>.00025)throw Error('Surveyed workshop obstruction identity changed');}
 const report=approved.removeVerifiedHouses(scene,colliders,puffs,[...approved.CIRCLED_AGORA_HOUSES,...targets]);scene.metadata.kerameikosWorkshopHouseClearance={authorisedTargets:targets.map(t=>t.id),report};return report;
}
