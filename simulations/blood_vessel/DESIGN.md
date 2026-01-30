# Blood Vessel Ecology - Detailed Design

**Concept:** A high-fidelity microscopic view inside a human capillary. The focus is on the *fluid dynamics* of blood and the *biological response* to trauma.

## 1. The Environment (Physics & Rendering)

### Parabolic Flow Profile
Blood in a vessel follows Laminar Flow.
- **Center of vessel:** Velocity is maximum ($V_{max}$).
- **Near walls:** Velocity approaches zero ($V \approx 0$).
- **Implementation:** Entities calculate their base speed based on their $Y$ distance from the center.
  $$V(y) = V_{max} \cdot (1 - (\frac{y}{R})^2)$$

### The Plasma (Background)
- **Shader:** A custom GLSL shader simulating the "plasma soup" - dissolved proteins, electrolytes.
- **Visuals:** Pale amber color, subtle distortion waves, particulate noise flowing horizontally.

## 2. The Cellular Cast

### Red Blood Cells (Erythrocytes)
- **Visual:** Biconcave disc. Use a sprite that looks "donut-like" but filled.
- **Behavior 1 - Tumbling:** Due to sheer stress (difference in velocity across the cell), RBCs near the walls should rotate/tumble. Center cells flow flat.
- **Behavior 2 - Deformation:** Simple squash/stretch when colliding or moving fast.

### White Blood Cells (Leukocytes)
- **Neutrophils:**
    - **Margination:** They naturally drift toward walls.
    - **Rolling:** They "roll" along the endothelial surface (simulated by friction/rotation when $y$ is near wall).
- **Lymphocytes:** Smaller, rounder, travel in the fast lane (center).

### Platelets (Thrombocytes)
- **Passive State:** Tiny, smooth, discoid.
- **Active State:** Spiky, sticky. Triggered by "Damage" events.

## 3. The Wound Event (Complex Interaction)

**Trigger:** User clicks on the Endothelial Wall.

**Sequence of Events:**
1.  **Vascular Spasm:** The vessel wall visual constricts/shakes.
2.  **Exposure:** A hole appears, revealing **Collagen Fibers** (static jagged graphics).
3.  **Adhesion:** Passing Platelets change state to **Active** (spiky sprite) if they touch the wound.
4.  **Aggregation:** Active platelets stick to the wound AND to each other.
5.  **Clot:** A pile of platelets forms, physically blocking the flow of RBCs (RBCs bounce off the clot).
6.  **Fibrin Mesh:** Over time, white strands weave through the clot (visual polish).

## 4. Optical Details & Atmosphere

- **Lighting:** Sub-surface scattering look. Light comes from "above" (tissue), but blood is translucent.
- **Vignette:** Darker edges to simulate the cylindrical nature of the vessel.
- **Pulse:** The entire flow rate and vessel diameter pulses rhythmically (60 BPM default).

## 5. Implementation Plan

1.  **Setup Pixi.js:** Canvas, simplified Asset loader.
2.  **Plasma Shader:** Get the background feeling liquid.
3.  **Cell Classes:** `RBC.js`, `WBC.js`, `Platelet.js`.
4.  **Physics Engine:** Custom AABB or Circle collision + Flow vector field.
5.  **Interactive Controller:** Handling the "Click to Cut" logic and the resulting clotting cascade.
