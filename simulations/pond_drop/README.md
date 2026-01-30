# Pond Drop Microcosm

**The World:** A single drop of pond water viewed at 400x magnification, teeming with life across multiple trophic levels.

## Organisms & Behaviors

| Organism | Visual Style | Behavior |
|----------|--------------|----------|
| **Paramecia** | Translucent ovals with visible cilia (animated hair-like fringe), internal vacuoles as subtle circles | Spiral swimming patterns, chemotaxis toward bacteria clusters, avoidance of predators, conjugation when two meet |
| **Amoebas** | Blobby shapes using metaball rendering or marching squares, pseudopods extending/retracting | Slow crawling along surfaces, engulfing smaller organisms with visible phagocytosis animation |
| **Rotifers** | Vase-shaped with spinning corona (wheel-like cilia at head), transparent body showing simple gut | Anchor to debris, create feeding currents visualized as particle streams, retract rapidly when disturbed |
| **Diatoms** | Geometric glass-like shells (circles, pennate shapes) with golden-brown chloroplasts | Passive drifting, occasional gliding motility, reproduce by splitting (shell gets smaller each generation until auxospore formation) |
| **Green Algae** | Filamentous chains or single spheres with bright green chloroplasts | Photosynthesis (oxygen bubbles when lit), clump formation, serve as food source |
| **Bacteria** | Tiny dots that cluster into colonies with Brownian motion | Exponential growth in nutrient-rich areas, biofilm formation on surfaces |
| **Vorticella** | Bell-shaped on coiled stalks | Rhythmic feeding, dramatic coil-snap retraction when touched |

## Environmental Systems

- **Light Cycle:** Gradual day/night affecting algae oxygen production, color temperature shifts
- **Nutrient Gradients:** Visualized as subtle color fields (brownish = organic matter, greenish = algae-produced oxygen)
- **Debris Layer:** Bottom sediment with dead organic matter, bacteria hotspots
- **Water Currents:** Gentle flows from rotifer feeding, user breath/touch

## User Interactions

- **Zoom slider:** 100x to 1000x magnification with appropriate detail levels
- **Pipette tool:** Add nutrients (causes bacteria bloom → paramecia boom → eventual crash)
- **Light control:** Lamp intensity affects algae and the whole food web
- **Touch/blow:** Create currents that scatter organisms
- **Focus plane:** Rack focus to different depths, organisms blur in/out

## Technical Approach

- **Rendering:** Pixi.js for performance with hundreds of entities, custom shaders for the watery caustic lighting effect
- **Movement:** Boids-like flocking for bacteria, individual state machines for larger organisms
- **Procedural shapes:** Bezier curves for amoeba pseudopods, sine-wave cilia animation
- **Spatial partitioning:** Quadtree for efficient collision/proximity detection

## Emergent Possibilities

Population dynamics should emerge naturally—bacteria blooms lead to paramecia population explosions, which crash when food runs out. Algae death from darkness cascades through the system.
