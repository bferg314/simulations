# Simulation Refinement Plan

A review of all nine simulations as of commit `5d26c42`. Each item names the file and line it concerns. Items marked **(verified)** were confirmed by loading the page in headless Chromium; the rest come from reading the code.

**Status:** every P0 item and cross-cutting items X1 to X5 are done (marked ✓), along with two bugs found while fixing them (listed under "Found during the P0 pass"). Line references in ✓ rows point at the code as it was before the fix.

Priorities:

- **P0**: visibly broken or wrong right now.
- **P1**: performance, leaks, and frame-rate dependence.
- **P2**: behaviour and fidelity (making the sim do what its README says).
- **P3**: UX and polish.

---

## 1. Cross-cutting work (do first, reuse everywhere)

Most sims repeat the same boilerplate and the same mistakes. A small shared module removes a whole class of bugs at once.

| # | Pri | Refinement |
|---|-----|-----------|
| X1 | P1 ✓ | **Shared sim shell** (`shared/shell.js`): back button, resize handling, `setPixelRatio(min(dpr, 2))`, pause when the tab is hidden (`visibilitychange`), a pause/speed control, and a `dt` clamp (e.g. `min(dt, 1/20)`) so returning to a background tab doesn't teleport everything. **Done** as three modules: `shared/clock.js` (fixed-timestep clock that also pauses when the tab is hidden and clamps long gaps), `shared/input.js` and `shared/playback.js` (pause/speed pill, Space to pause). Back buttons and resize code stay per sim. |
| X2 | P1 ✓ | **Frame-rate independence.** Space, aquarium, jellyfish snow, trees (stars, lerps), blood vessel (clot timer, `frameCount`), pond (rAF-driven particles), soil (everything), and the ant farm (`simSpeed` ticks *per frame*, [script.js:214](simulations/ant_farm/script.js#L214)) all run faster on 120/144 Hz displays. Move to a fixed-timestep accumulator so behaviour matches on every monitor. **Done:** every sim now runs its logic in fixed 60 Hz steps from `shared/clock.js`, the ant farm included. |
| X3 | P1 ✓ | **Click vs. drag.** Flowers, trees and jellyfish act on `pointerdown`, so every orbit drag (and every click on the Tweakpane panel) plants a flower / fires a burst / pushes jellies. Add a helper that fires only on a short, low-movement click that started on the canvas. **Done** with `onClick` from `shared/input.js`. |
| X4 | P1 ✓ | **Ad-hoc animation loops.** Pond, aquarium and blood vessel animate ripples, flashes and scars with their own `requestAnimationFrame` / `setInterval` / `setTimeout`, so they ignore pause and speed. Route them through the main ticker. **Done:** routed through an in-loop effects list (pond, blood vessel) or the step function (aquarium). |
| X5 | P1 ✓ | **Object disposal.** Removed Pixi `Graphics` are never `destroy()`ed (pond, blood vessel); Three meshes removed from the scene keep their geometry/material (aquarium food, space galaxy textures). Add a `remove(entity)` helper per engine. **Done** for the cases listed. |
| X6 | P2 | **Spatial hashing.** Aquarium boids, pond predators, soil bacteria, and blood vessel RBC/WBC each scan every entity every frame (O(n²)). One uniform-grid helper serves all four. |
| X7 | P3 | **Mobile layout.** Tweakpane and the custom side panels cover a third or more of a phone screen. Start panels collapsed under ~700px and make sure every tool has a touch equivalent (aquarium relies on double-click and right-click). |
| X8 | P3 | **Docs match reality.** Hub README claims InstancedMesh for the aquarium (it uses ~20 meshes per fish) and "predator avoidance" (no predator exists); pond and soil READMEs describe organisms and tools that were never built (diatoms, vorticella, nematodes, protozoa, focus plane, root stress). Either build them (see P2 items) or move those sections under a "Future ideas" heading. The tech-stack section omits Pixi.js and p5.js. |
| X9 | P3 | **Headless test runner.** The ant farm README describes driving `World`/`Colony` under Node but the script isn't in the repo. Commit it (`simulations/ant_farm/tools/headless.mjs`) and run it in the deploy workflow before publishing. The same pattern would suit pond and blood vessel once their logic is separated from Pixi. |

---

## 2. Whispering Trees (`simulations/trees/`)

| Pri | Refinement |
|-----|-----------|
| P0 ✓ | **Ground is missing (verified).** [script.js:124-125](simulations/trees/script.js#L124) reads Z (always 0 on a `PlaneGeometry`) and overwrites Y, collapsing the plane into a thin strip. Trees and rocks are placed on terrain that isn't there; the screenshot shows them standing on sky. Fix: rotate the geometry first (`groundGeo.rotateX(-PI/2)`), then displace Y from X/Z, and drop the mesh rotation. |
| P0 ✓ | Fireflies are fully implemented but never spawned ([script.js:183](simulations/trees/script.js#L183)). Spawn them at night near the ground, capped, with a pooled light count (each `PointLight` adds shader cost). |
| P0 ✓ | `butterflyCount` and `shrubCount` sliders do nothing ([script.js:588](simulations/trees/script.js#L588)). Wire them to rebuild, or remove them. |
| P1 | `Object.assign(moonLight.shadow, sunLight.shadow)` ([script.js:87](simulations/trees/script.js#L87)) shares one shadow camera/map between two lights. Give the moon its own shadow, or disable moon shadows and keep one 2048 map. |
| P1 (part ✓) | `pane.refresh()` every frame ([script.js:602](simulations/trees/script.js#L602)) and three `new THREE.Color()` per frame. Refresh at ~4 Hz; hoist the colours. *The refresh is throttled to 4 Hz; the per-frame `Color` allocations remain.* |
| P1 | 4,000 single-triangle grass blades cast shadows. Turn off `castShadow` on grass. |
| P2 | Butterflies flap from the wing centre; move the pivot to the body edge. Stars sit in a ±100 cube that includes below-ground; place them on a sky dome. |
| P3 | Sky colour switches abruptly at the 0.2 sun-height threshold; use a continuous gradient keyed to sun elevation. |

## 3. Floral Growth (`simulations/flowers/`)

| Pri | Refinement |
|-----|-----------|
| P0 ✓ | Flowers start at a negative age ([script.js:383](simulations/flowers/script.js#L383)), and the growth branch sets `scale = min(age, 1)` ([script.js:249](simulations/flowers/script.js#L249)), so for their first few seconds they render with negative scale (inside-out). Clamp to `max(0, …)` and hide until age ≥ 0. |
| P0 ✓ | Wither droop never shows: the wind line at [script.js:262](simulations/flowers/script.js#L262) overwrites `rotation.z` right after the wither branch sets it. Add the droop on top of wind. |
| P0 ✓ | Sunflower stem/head mismatch: `height *= 1.2` ([script.js:118](simulations/flowers/script.js#L118)) runs after the head was positioned, and the stem's 1.5× scale is never reset when the slot respawns as another type. |
| P1 | Click-to-plant adds flowers without limit; `flowerCount` only applies on reset. Recycle the oldest flower instead. |
| P1 | Every flower builds its own geometries and materials. Share them per flower type (or move to `InstancedMesh` per part). |
| P2 | Ground has random per-vertex jitter but flowers are planted at y=0, so stems float or sink. Use a deterministic height function (as trees does) and sample it at plant time. Flowers don't cast shadows despite shadows being enabled. |
| P2 | Lifespan of 5 s is short enough that nothing reads as a "cycle". Add seasons or a slower default, seed dispersal (dandelions drift and seed new flowers), and better-shaped rose/lily heads. |

## 4. Neon Jellyfish (`simulations/jellyfish/`)

| Pri | Refinement |
|-----|-----------|
| P0 ✓ | `dt` is always ~0: `getElapsedTime()` ([script.js:317](simulations/jellyfish/script.js#L317)) already calls `getDelta()` internally, so the following `getDelta()` returns nothing. `phase` never advances. Call `getDelta()` once and accumulate time yourself. |
| P0 ✓ | `count`, `speed` and `tentacleLength` are unused; the `count` slider is bound with a "skip for now" comment ([script.js:346](simulations/jellyfish/script.js#L346)). The colour picker updates bells but not tentacles. |
| **P1** | Every frame rebuilds 120 `TubeGeometry` objects ([script.js:253](simulations/jellyfish/script.js#L253)). Keep a fixed-size tube buffer and rewrite its vertex positions, or draw tentacles as `Line2`/ribbon geometry updated in place. |
| P1 ✓ | The tentacle inverse matrix uses last frame's `matrixWorld`, so tentacles lag their bell by a frame. Call `pivot.updateMatrixWorld()` first. |
| P2 | Jellies only bob in place. Add pulse-driven locomotion (thrust on the contraction stroke, drift on relaxation) so the bell pulse actually propels them, with soft bounds so the sonar push can't send them away for good (vertical impulse is currently discarded because `y` is overwritten each frame). |
| P2 | Tentacle nodes are position-only. Switch to Verlet integration so they trail and swing with momentum. |
| P3 | Bloom threshold 0.1 makes the marine snow glow as much as the jellies; raise it and give the bells an emissive rim instead. |

## 5. Digital Aquarium (`simulations/aquarium/`)

| Pri | Refinement |
|-----|-----------|
| P0 ✓ | Fish anatomy is reversed. The head is +Z, but the mouth sits at −0.42 Z ([script.js:339](simulations/aquarium/script.js#L339)), on the tail, and the anal fin is at the front. The left pectoral and ventral fins reuse the right-side geometry without mirroring it, so they point inward and forward. |
| P0 ✓ | Eaten food is moved to y = −999 ([script.js:649](simulations/aquarium/script.js#L649)) and never removed or disposed. |
| **P1** | Heaviest page in the hub (~1 fps in software rendering vs. ~14 for the ant farm). Causes: ~20 meshes and 6 materials per fish (3,000+ draw calls at 150 fish), and a `MeshPhysicalMaterial` with `transmission` on each bubble ([script.js:712](simulations/aquarium/script.js#L712)), which forces an extra transmission render pass. Merge each fish into one skinned or vertex-animated mesh rendered via `InstancedMesh` (tail swing in the vertex shader), and use a cheap additive sprite for bubbles. |
| P1 (part ✓) | Physics is per-frame with no `dt`; `scareTimer -= 0.016` ([script.js:1012](simulations/aquarium/script.js#L1012)) assumes 60 fps. Flocking allocates several `Vector3`s per neighbour pair ([script.js:583](simulations/aquarium/script.js#L583)). *Fixed-step physics and the scare timer are done; the flocking allocations remain.* |
| P2 | Fish are bounded by a sphere inside a box tank, so they ignore the walls, swim through rocks and sand, and never use the corners. Use box bounds with soft wall steering and obstacle avoidance. |
| P2 | Add the predator the README promises (one larger fish whose approach triggers schooling and flight), species-specific schooling (fish align with their own colour), and food that settles on the sand where fish forage. |
| P3 | Double-click and right-click have no touch equivalent; add toolbar buttons. |

## 6. Galactic Voyage (`simulations/space/`)

| Pri | Refinement |
|-----|-----------|
| P0 ✓ | Station blink lights set `opacity` on a non-transparent material ([script.js:247](simulations/space/script.js#L247)), so they never blink. |
| P0 ✓ | "Randomize Adventure" sets every frequency up to 0.02 ([script.js:584](simulations/space/script.js#L584)), 100× the default for black holes. Randomize within each slider's own range. |
| P0 ✓ | Scanner text sticks on "GRAVITY ANOMALY" after a black hole passes unless the mouse is released; touch never updates the scanner text. Warp also triggers when clicking the back button. Switch to pointer events with a single state function. |
| P1 ✓ | Spawning is `Math.random() < freq` per frame ([script.js:697](simulations/space/script.js#L697)), so a 144 Hz display sees 2.4× as many objects. Express frequencies per second or per unit distance travelled. *Spawn rolls are now per fixed step.* |
| P1 | Every galaxy creates a new canvas texture ([script.js:469](simulations/space/script.js#L469)) that `dispose()` never frees; every asteroid creates its own geometry and material. Share one sprite texture and pool asteroids with an `InstancedMesh`. |
| P2 | Galaxies are tiny (radius ~20, point size 0.2) and indistinct. Use a proper log-spiral arm distribution with a bright core and colour gradient. The sun never moves, so the voyage never passes a star; make it a spawnable object. |
| P3 | The HUD font `'OCR A Std'` isn't loaded, so it falls back to the default monospace. `starSize` really controls opacity; rename it. |

## 7. Pond Drop Microcosm (`simulations/pond_drop/`)

| Pri | Refinement |
|-----|-----------|
| P0 ✓ | Motion trails are invisible: they're inserted at index 0 ([script.js:341](simulations/pond_drop/script.js#L341)), underneath the opaque 4000×4000 background. They're created every third frame for every moving organism and cost draw time for nothing. |
| P0 ✓ | Hovering sets `graphics.alpha = 1.2` ([script.js:1102](simulations/pond_drop/script.js#L1102)) and never resets it. |
| P0 ✓ | Population dynamics don't emerge, they're scripted: nothing dies of starvation (energy goes negative indefinitely), paramecia and amoebae never reproduce, hydra "reproduce" by resetting energy but the spawner only handles euglena and rotifers ([script.js:653](simulations/pond_drop/script.js#L653)), and bacteria are topped up whenever they drop below 50 ([script.js:674](simulations/pond_drop/script.js#L674)). Give every organism an energy budget with death at zero (leaving detritus), reproduction above a threshold, and let bacteria grow on detritus/nutrients. Then the README's bloom → boom → crash cycle can actually happen. |
| P1 | The background is a fixed 4000×4000 rect with a filter ([script.js:125](simulations/pond_drop/script.js#L125)); zoomed out on a large monitor its edge shows, and filtering 16M pixels is expensive. Use a screen-sized filtered sprite that ignores camera transform. |
| P1 | Population counts are recomputed with seven `filter()` passes, several times a frame. Maintain counts incrementally on spawn/remove. |
| P2 | Bounds ignore pan offset, so panning reveals empty water. The pipette spawns bacteria directly instead of adding nutrients. Algae never grow or get eaten. |
| P3 | README items not yet built: diatoms, vorticella, focus plane, zoom slider. Pick the two that fit best (vorticella's coil-snap is a good visual) or move them to future ideas. |

## 8. Soil Rhizosphere (`simulations/soil_rhizosphere/`)

| Pri | Refinement |
|-----|-----------|
| P0 ✓ | Bacteria hit the 500 cap within six seconds (verified). Feeding shrinks organic matter to a floor of 2 ([Bacteria.js:44](simulations/soil_rhizosphere/classes/Bacteria.js#L44)) and never removes it, so food is infinite. Meanwhile the stats panel reads "Nutrients: Low". Make organic matter a finite resource that bacteria consume and that releases nutrients into the soil. |
| P0 ✓ | Organic matter "fibers" use `random()` in `display()` ([SoilParticle.js:59](simulations/soil_rhizosphere/classes/SoilParticle.js#L59)), so they flicker every frame. Bake them at construction. |
| P0 ✓ | Resizing the window wipes the whole simulation ([script.js:349](simulations/soil_rhizosphere/script.js#L349)). |
| **P1** | The soil gradient is drawn as one `line()` per pixel row every frame ([script.js:52](simulations/soil_rhizosphere/script.js#L52)); bake it to an offscreen buffer. It also starts at world y=0, so panning down shows an unpainted band. |
| P1 | Each bacterium scans every particle and every root point every frame (~500 × 1,000). Use the shared spatial grid. |
| P1 | Placing organic matter calls `particles.shift()` past 2,000 ([script.js:220](simulations/soil_rhizosphere/script.js#L220)), deleting arbitrary old sand and clay from the top-left of the screen. |
| P2 | The root is static and stops partway down a tall screen (30 segments × 15 px). Make it grow over time with lateral branches, and draw root hairs from the actual root edge (they're offset a fixed 10 px today). |
| P2 | The fungal network never exchanges anything: the "nutrient pulses" pick random nodes via noise. Model carbon flowing out from the root and phosphorus flowing back from organic matter the hyphae reach, and add anastomosis when tips meet. The moisture check samples 3 random particles from the whole screen, so it almost never finds a nearby one. |
| P3 | Add time controls (the README recommends 100×) and one of the promised organisms (nematodes grazing bacteria would close the food web). |

## 9. Blood Vessel Ecology (`simulations/blood_vessel/`)

| Pri | Refinement |
|-----|-----------|
| P0 ✓ | The plasma background renders black instead of the pale amber the shader specifies (verified). Cause: the shader's `uniform vec2 resolution` is overridden by Pixi v7's filter-system global of the same name. |
| P0 ✓ | There are no vessel walls. `vesselRadius` is half the screen height ([script.js:62](simulations/blood_vessel/script.js#L62)), so the "endothelium" is the screen edge and the scalpel can cut the middle of the lumen ([script.js:683](simulations/blood_vessel/script.js#L683)). Draw walls with a visible lumen and only accept cuts on the wall. |
| P0 ✓ | The default view already reads BP 140/93 and 33% plaque (verified): cholesterol sticks immediately. Start from a healthy baseline and let plaque accumulate over minutes. |
| P0 ✓ | The fever vignette's "clear centre" is a zero-alpha fill on top of a red fill ([script.js:198](simulations/blood_vessel/script.js#L198)), which clears nothing; the whole screen tints. Use a radial gradient sprite. |
| P1 | Nothing handles resize: the background rect ([script.js:93](simulations/blood_vessel/script.js#L93)), ECG position and vessel radius are fixed at load. |
| P1 (part ✓) | Clot lifetime counts frames, not `delta` ([Platelet.js:59](simulations/blood_vessel/classes/Platelet.js#L59)). Each RBC scans every entity for clot collisions. *Clot age now counts `delta`; the per-RBC scan remains.* |
| P2 | Platelets only stick inside the wound radius; aggregation onto other platelets (DESIGN.md step 4) and the fibrin mesh (step 6) aren't built, so clots stay one layer thick and never block flow. RBCs pass through each other. |
| P2 | Leukocyte margination and rolling from DESIGN.md: WBCs should drift to the wall and roll slowly along it. |
| P3 | The control panel covers ~40% of an 800 px-wide screen (verified). Make it collapsible like the pond and ant farm panels. |

## 10. Ant Colony (`simulations/ant_farm/`)

The most mature sim: a clean config, documented invariants, and no visible bugs in testing. Refinements are additive.

| Pri | Refinement |
|-----|-----------|
| P1 ✓ | `simSpeed` is ticks per rendered frame ([script.js:214](simulations/ant_farm/script.js#L214)), so colonies age 2.4× faster on a 144 Hz display. Use a ticks-per-second accumulator. *Now ticks per fixed step.* |
| P1 | Commit the headless runner the README describes and assert its health checks (queen laying, food delivered, tunnel volume growing, no floating brood) in CI. See X9. |
| P2 | Add a **reset / new colony** button and a seeded RNG (36 `Math.random()` calls in `classes/`) so a run can be replayed and bug reports reproduced. |
| P2 | Add a population-over-time graph (the pond already has one) so the colony's growth and famine phases are visible without watching the stats tick. |
| P3 | Click an ant to follow it, with a small card showing its caste, age and current task. |

## 11. Hub (`index.html`, `script.js`, `style.css`)

| Pri | Refinement |
|-----|-----------|
| P2 | Card markup is built with `innerHTML` from the data array. Safe today (static data), but switch to `textContent` before any user-supplied data ever reaches it. |
| P3 | The random palette and random card tilt change on every load and every search keystroke (cards re-render with new tilts). Compute tilt once per card. |
| P3 | Regenerate thumbnails after the P0 fixes (the trees thumbnail predates the missing-ground bug or hides it). A Playwright script in `tools/` could screenshot all nine. |
| P3 | Group the cards by section (3D nature, 3D ocean/space, 2D biology) to match the README. |

---

## Found during the P0 pass

| Sim | Finding |
|-----|---------|
| Jellyfish | **Fixed.** Tentacle nodes are world-space but started at the jelly's local offsets, and the spring recovered only 10% of stretch per frame, so every tentacle streamed from its bell to the scene centre. |
| Pond | **Added.** A Node runner, `simulations/pond_drop/tools/headless.mjs`, now steps the ecosystem without a browser; it was used to tune the new population dynamics (see the pond README). |
| Pond | **Not fixed.** The caustic shader also declares `uniform vec2 resolution`, the same name that blacked out the blood vessel plasma. It is unused there, so harmless, but rename it if it is ever used. |

## Suggested order

1. **P0 sweep** across all sims. Mostly small, contained fixes; the trees ground and jellyfish `dt` bugs are one-line causes with large visible effects.
2. **Shared shell (X1-X5)**, migrating one 3D sim and one Pixi sim first to prove the API, then the rest.
3. **Aquarium and jellyfish performance rewrites**, the two biggest P1 items.
4. **Ecosystem fidelity** for pond and soil, which are currently scripted rather than emergent. These are the largest P2 items and benefit most from the spatial grid (X6) and headless testing (X9).
5. **Blood vessel walls and clot aggregation**, then the remaining P2/P3 items as time allows.
