# Blood Vessel Ecology

**The World:** Interior of a capillary or small blood vessel, viewed as a flowing environment with cellular inhabitants.

## The Flow Environment

- **Plasma:** Pale yellow background with subtle flow lines (laminar near walls, faster in center)
- **Vessel Wall:** Endothelial cells as a tiled surface with tight junctions, occasional gaps
- **Flow physics:** Cells tumble and deform realistically based on position in flow

## Cellular Cast

| Cell Type | Visual Style | Behavior |
|-----------|--------------|----------|
| **Red Blood Cells** | Biconcave discs (torus-like from side), deform through tight spaces, stack into rouleaux when flow slows | Passive flow, carry oxygen (color shifts from bright to dark red based on O2 load) |
| **Platelets** | Tiny irregular fragments | Flow passively until vessel damage triggers activation—then extend pseudopods, clump together |
| **Neutrophils** | Larger spheres with multi-lobed nuclei visible | Roll along vessel walls, squeeze through gaps (diapedesis) toward infection signals |
| **Monocytes** | Large round cells | Patrol, can exit vessel and transform into macrophages |
| **Lymphocytes** | Round with large nucleus | Circulate, occasionally exit at specific sites |
| **Pathogens** | (Optional invasion event) Bacteria as rods/spheres with distinct coloring | Enter through wound, multiply, trigger immune response |

## Physiological Events (User-Triggerable or Random)

**1. Wound Response**
- User clicks vessel wall to create damage
- Collagen exposed (yellow fibers)
- Platelets activate, aggregate, form plug
- Fibrin mesh weaves through (white threads)
- Clot stabilizes, flow routes around

**2. Inflammation Response**
- Introduce bacteria through wound
- Endothelium activates (cells plump up, express adhesion molecules visualized as surface receptors)
- Neutrophils slow, roll, stick, squeeze through
- Outside-vessel view shows neutrophils chasing and engulfing bacteria

**3. Oxygen Exchange**
- If positioned at capillary in tissue, show O2 diffusing out (red cells lighten), CO2 entering
- Tissue cells visible beyond vessel wall, respiring

## Flow Dynamics Detail

- Fåhræus–Lindqvist effect: RBCs migrate to center, leaving cell-free layer near walls
- RBC deformation through narrow sections
- Rouleaux formation in slow zones (stacked coins appearance)
- Pulsatile flow option (pressure waves from heartbeat)

## User Interactions

- **Flow rate control:** Adjust heart rate/blood pressure, watch cellular behavior change
- **Wound tool:** Damage vessel wall, observe clotting cascade
- **Pathogen injection:** Trigger immune response
- **Oxygen toggle:** Switch between arterial (oxygenated) and venous (deoxygenated) conditions
- **Follow cell:** Click any cell to track it through the system
- **Zoom to wall:** See detailed endothelial cell biology

## Technical Approach

- **Fluid simulation:** Simplified Navier-Stokes or particle-based (SPH) for plasma flow
- **Soft body physics:** For RBC deformation (mass-spring systems or position-based dynamics)
- **Shaders:** For the flowing plasma effect, oxygen gradient coloring
- **State machines:** For immune cell behavior (patrol → activate → migrate → attack)

## Visual Mood

Warm reds and yellows, slightly pulsing ambient light synced to heartbeat, peaceful until an event triggers dramatic immune activity.
