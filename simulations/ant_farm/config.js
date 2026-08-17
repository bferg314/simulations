// Central tuning for the ant farm. Every magic number that governs colony
// behaviour lives here so the simulation can be rebalanced without hunting
// through the class files.

export const CONFIG = {
    // --- World ---
    worldWidth: 400,
    worldHeight: 240,
    groundLevel: 80,        // mean terrain height; actual surface is sinusoidal
    chamberDepth: 132,      // where the queen excavates the royal chamber

    // --- Simulation ---
    simSpeed: 2,            // sim ticks per rendered frame
    initialAnts: 20,

    // --- Pheromones ---
    // Deposits are max()'d, not summed, and strength falls off with distance
    // travelled since the ant's last anchor event. That is what turns the field
    // into a gradient instead of a saturated blob around the nest.
    pheroFalloff: 0.997,    // per step, applied to the ant's carried strength
    pheroMinDeposit: 0.02,  // below this an ant stops laying trail

    // --- Food economy ---
    foodValue: 10,           // store units gained per food item retrieved
    foodSpawnRate: 0.05,    // chance per tick of a new surface food item
    foodMax: 90,
    queenUpkeep: 0.002,     // store units consumed per tick
    workerUpkeep: 0.0003,
    larvaMealCost: 1,
    eggCost: 1,
    eggIntervalBase: 500,   // divided by a food-surplus factor

    // --- Lifecycle (ticks) ---
    eggHatch: [500, 700],
    larvaPupate: [1100, 1600],
    pupaEmerge: [600, 900],
    workerLifespan: [9000, 15000],
    larvaStarve: 3000,      // hunger ticks before a larva dies

    // --- Castes ---
    roleReviewInterval: 240,
    roleSwitchMargin: 0.08, // hysteresis band before an ant changes job

    // --- Weather & threats ---
    rainIntensity: 0.35,
    collapseChance: 0.015,   // per water tick, chance to sample a cave-in
    drownTicks: 240,         // submerged ticks an ant survives

    // --- Palette ---
    dirtColor: '#8B5A2B',
    tunnelColor: '#1a0f0a',
    skyTop: '#5BA3D9',
    skyBottom: '#9FD4F0',
    waterColor: '#3d6b8f',
    antColor: '#1a1a1a',
    foragerColor: '#2b2b2b',
    nurseColor: '#6b4f2a',
    diggerColor: '#4a3b2a',
    queenColor: '#9932CC',
    eggColor: '#fffff0',
    larvaColor: '#FFD700',
    pupaColor: '#E8C39E',
    foodColor: '#32CD32',
    corpseColor: '#5a4030',
    antlionColor: '#7a3b2a',
};

// Random integer in an inclusive-ish [min, max) range from a CONFIG pair.
export const between = ([min, max]) => min + Math.random() * (max - min);
