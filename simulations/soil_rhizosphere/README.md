# Soil Rhizosphere

**The World:** A cross-section of soil at root level, showing the hidden fungal internet and bacterial cities around plant roots.

## Visual Zones (layered depth)

1. **Root surface:** Large curved edge of a plant root with root hairs extending outward
2. **Rhizosphere:** The immediate zone around roots, dense with life
3. **Bulk soil:** Mineral particles, organic matter chunks, air pockets, water films

## Organisms & Elements

| Element | Visual Style | Behavior/Function |
|---------|--------------|-------------------|
| **Mycorrhizal Fungi** | Branching hyphal networks rendered as growing lines with Lindenmayer systems, occasional fruiting body formation | Grow toward roots, form connections, transport nutrients (visualized as traveling particles along hyphae) |
| **Bacteria Colonies** | Clusters of colored dots—different species as different hues | Form biofilms on particles, fix nitrogen (blue glow near legume roots), decompose organic matter |
| **Nematodes** | Translucent worm shapes, simple sinusoidal movement | Graze on bacteria, some attack roots (visible damage), predatory types hunt other nematodes |
| **Protozoa** | Tiny flagellates and ciliates | Graze bacterial populations, excrete plant-available nutrients |
| **Organic Matter** | Brown irregular chunks with visible structure (leaf fragments, dead roots) | Slowly shrink as bacteria decompose them, release nutrient particles |
| **Water Films** | Thin blue layers coating soil particles | Expand/contract with moisture, organisms travel along them |
| **Mineral Particles** | Sand (large, angular), silt (medium), clay (tiny, flat platelets) | Static structure, clay holds nutrients |

## Root Exudate System

The root continuously releases sugars and signaling compounds visualized as a subtle gradient/particle emission. This:
- Attracts beneficial bacteria
- Feeds mycorrhizal partners
- Can shift to attract specific helpers when stressed

## Fungal Network Mechanics

- Hyphae grow using L-system rules with randomness
- When two compatible hyphae meet, they fuse (anastomosis)
- Network transports resources—you can watch carbon (green particles) flow from root to fungus, and phosphorus (orange particles) flow back
- Multiple plants can connect through the network (if you expand the view)

## User Interactions

- **Water dropper:** Add moisture, watch water films expand and organism activity increase
- **Organic matter placement:** Drop a leaf fragment, watch decomposition over accelerated time
- **Root stress button:** Simulate drought or pathogen attack, watch root exudates change and helper organisms respond
- **Time controls:** This system benefits from 100x-1000x time acceleration to see growth patterns
- **Trace nutrient:** Click a nutrient particle and follow its journey through the food web

## Technical Approach

- **L-systems:** For fungal growth with parameterized rules
- **Particle systems:** For nutrient transport, bacterial Brownian motion
- **Signed distance fields:** For smooth organic matter decomposition visuals
- **Layered parallax:** Different soil depths with focus effects

## Educational Angle

Could include an optional "insight mode" showing nutrient cycling stats, species populations, network connectivity metrics.
