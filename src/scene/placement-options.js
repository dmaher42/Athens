const DEFAULT_PLACEMENT_OPTIONS = {
  minClearanceByKind: {
    temple: 12,
    stoa: 10,
    theatre: 16,
    tholos: 8,
    propylon: 6,
    altar: 4,
    block: 3,
    exedra: 4
  },
  gridCellSize: 25,
  maxAdjustRadius: 12,
  maxRotationAdjustDeg: 20,
  alignToPaths: true,
  snapToDistricts: true,
  logReport: true
};

export default DEFAULT_PLACEMENT_OPTIONS;
export { DEFAULT_PLACEMENT_OPTIONS };
