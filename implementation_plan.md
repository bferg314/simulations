# Simulation Expansion Plan

This document outlines the plan for three new microscopic web simulations, focusing on procedural beauty and emergent behavior.

---

## 1. Pond Drop Microcosm

**The World:** A single drop of pond water viewed at 400x magnification, teeming with life across multiple trophic levels.

### Directory
`simulations/pond_drop/`

### Organisms & Behaviors
- **Paramecia:** Spiral swimming, chemotaxis, avoidance, conjugation.
- **Amoebas:** Metaball rendering, crawling, phagocytosis.
- **Rotifers:** Vase-shaped, feeding currents, rapid retraction.
- **Diatoms:** Geometric splitting shells, passive drift.
- **Green Algae:** Photosynthesis, clumping, food source.
- **Bacteria:** Flocking (Boids), exp growth, biofilm.
- **Vorticella:** Bell-shaped on stalks, coil-snap retraction.

### Environmental Systems
- **Light Cycle:** Affects oxygen and color.
- **Nutrient Gradients:** Organic matter vs Oxygen fields.
- **Debris Layer:** Sediment bottom.
- **Water Currents:** From rotifers and user interaction.

### Tech Stack Recommendation
- **Pixi.js** for performance.
- Custom shaders for caustic lighting.

---

## 2. Soil Rhizosphere

**The World:** A cross-section of soil at root level, showing the hidden fungal internet and bacterial cities around plant roots.

### Directory
`simulations/soil_rhizosphere/`

### Organisms & Elements
- **Mycorrhizal Fungi:** L-system growth, nutrient transport.
- **Bacteria Colonies:** Nitrogen fixing, biofilms.
- **Nematodes:** Sinusoidal movement, predation.
- **Protozoa:** Grazers.
- **Organic Matter:** Decomposing chunks.
- **Water Films:** Moisture on particles.
- **Mineral Particles:** Structural layer.

### Interactions
- **Root Exudates:** Signaling gradients.
- **Fungal Network:** Resource flow visualizaiton.
- **User:** Water dropper, add organic matter, stress events.

### Tech Stack Recommendation
- **p5.js** for organic procedural drawing, or **Pixi.js** for large scale.

---

## 3. Blood Vessel Ecology

**The World:** Interior of a capillary or small blood vessel, viewed as a flowing environment with cellular inhabitants.

### Directory
`simulations/blood_vessel/`

### Cellular Cast
- **RBCs:** Biconcave discs, deformation, rouleaux sizing.
- **Platelets:** Activation upon damage.
- **Neutrophils:** Rolling, spreading, diapedesis.
- **Monocytes/Lymphocytes:** Patrolling.
- **Pathogens:** Invasion events.

### Dynamics
- **Flow Physics:** Fåhræus–Lindqvist effect, laminar flow.
- **Wound Response:** Clotting cascade visuals.
- **Oxygen Exchange:** Color shifts.

### Tech Stack Recommendation
- **Pixi.js** + Simple Physics (Verlet or PBD).

---
