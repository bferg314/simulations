# Slime Mould

*Physarum polycephalum* foraging. Tens of thousands of simple agents lay down a chemical trail and follow it, and between them they build a transport network linking the food. The model is Jeff Jones's 2010 agent model. The Tokyo layout is after Tero et al. (2010), where the real mould grew a network much like the rail map around Tokyo.

## Using it

- **Click** places an oat flake (food). **Shift-click** places a light. Physarum avoids light, so lit agar repels the mould. **Right-click** or **long-press** removes the nearest flake or light.
- On a touch screen, the pane's *click places* menu switches a tap between oat flake, light and remove, and a long press always removes.
- **Layout:** *Petri dish* (a ring of ten flakes, inoculated in the middle), *Tokyo* (36 flakes on a rough Kanto map, inoculated at Tokyo) and *Bare agar* (no food, for watching the network form and remodel by itself).
- Pause, ½×, 1×, 2× and 4× are at the bottom. Space also pauses.
- The agent sliders are live. *Paper defaults* puts them back to the values below.

## The model

Each agent keeps a floating-point position and heading on a grid of cells. Each step:

1. **Motor stage.** Every agent tries to move SS cells forward. If the target cell is a wall or already holds an agent, the agent stays put and picks a random heading. Otherwise it moves and deposits depT on the trail map.
2. **Sensory stage.** Every agent reads the trail at three sensors SO cells away: straight ahead (F), and SA to the left (FL) and right (FR). If F is strongest it carries on. If F is weakest it turns left or right at random by RA. Otherwise it turns by RA toward the stronger side.
3. **Trail.** The map goes through a 3×3 mean filter and is multiplied by (1 − decayT).
4. **Stimuli.** Food cells add chemoattractant every step. Lit cells are held negative, so the mould turns away from them. Walls (outside the dish, or the sea) absorb.

The grid is half the screen resolution, capped at 1024 × 1024 cells. The trail is drawn through `ImageData` with a palette lookup. The oat flakes, light halos, dish rim and coastline go on a second canvas at full resolution. The model lives in `model.js` with no DOM and a seedable RNG, and the layouts are in `presets.js`.

### Parameter values and where they come from

**Verified** against Table 1 of Jones (2010) (author's copy, p. 134, read 2026-11-05):

| Parameter | Jones (2010) Table 1 | Used here |
|---|---|---|
| SA, sensor angle | 22.5 or 45° | 22.5° |
| RA, rotation angle | 45° | 45° |
| SO, sensor offset | 9 pixels | 9 cells |
| SW, sensor width | 1 pixel | 1 cell (a single sample) |
| SS, step size | 1 pixel per step | 1 cell |
| depT, deposit per step | 5 | 5 |
| decayT, diffusion decay | 0.1 | 0.1 |
| diffK, diffusion kernel | 3 | 3×3 mean |
| pCD, chance of a random turn | 0 | 0 (not implemented) |
| sMin, sensitivity threshold | 0 | 0 (not implemented) |
| %p, population | 3–15% of lattice | see below |
| wProj, food projection weight | 0.01–0.1 | see below |

Also verified from the paper's text: the motor stage runs before the sensory stage; a blocked agent deposits nothing and picks a random new heading; the update order is random; one agent per cell. Fig. 4 uses SA 22.5 with RA 45 (a network that keeps remodelling), and Fig. 5 uses SA = RA = 45 (a network that shrinks to a minimal one). The test suite checks both behaviours.

**My reading, not stated outright in the paper:**

- **Decay.** The paper says the mean filter "is subject to an adjustable decay value". I read decayT = 0.1 as keeping 90% after each diffusion step.
- **Food strength 25.** The paper projects stimuli as "stimulus value × weight", with the weight at 0.01–0.1 and the stimulus a grey level in an image. Assuming 8-bit white (255), the top of that range is about 25 per cell per step, so that is the default. The slider runs 0–100.
- **Population.** The paper's %p is 3–15% of the whole lattice. Here the default is 20% of the habitable cells in the dish, 12% of the land on the Tokyo map, and 10% of bare agar. That works out to about 40,000 agents in the dish and about 21,000 for Tokyo on a 1920 × 1080 window. A dish or a coastline wastes a lot of the lattice, and these densities gave the best-looking networks in trials.
- **Inoculum.** The paper usually scatters agents at random. Here they start as a disc around the inoculation point, packed at 40%. Packed much denser, the agents jam into a solid sheet that never opens up, because they can only move into empty cells.
- **Update order.** The motor stage visits agents from a random start with a random stride coprime to the count. This is a cheap stand-in for a full shuffle every step. The sensory stage runs in index order, which is harmless because it only reads the map.
- **Light.** The paper's light and hazard layer is "not described in this article". Holding lit cells at −10 (twice depT) is my choice. So is the plan's idea of "negating the trail" there.
- **Edges.** The paper defaults to periodic boundaries. Here the screen edge, the dish wall and the sea are fixed, absorbing boundaries. The paper also runs networks "without periodic boundary conditions", where they condense further.

### Tokyo layout (approximate)

**Verified** from Tero et al. (2010) (author's copy and the journal page): the template had **36 food sources** at the cities around Tokyo. The plasmodium was placed at **Tokyo**. The arena was bounded by the Pacific coastline and was 17 cm across. In some runs an **illumination mask** kept the mould off mountains, and strong light kept it off the sea and inland lakes. The mould first filled much of the land, then thinned to a network of tubes over about 26 hours. The paper's comparison measures were total length, mean distance and fault tolerance relative to the minimum spanning tree. Tokyo rail came out at about 1.8 times the MST length, and Physarum at 1.75 ± 0.30.

**Not taken from the paper:** the paper doesn't list its 36 cities, and I didn't measure them off its figure. The 36 cities here are my own choice of the larger towns in the region, at city-centre coordinates from general knowledge, rounded to 0.01°. The coastline is a coarse hand-drawn polygon with about 30 vertices, and the map window cuts off at 139.0°E and 34.9°N. The three lit patches (Lake Kasumigaura, Tanzawa, and Okutama–Chichibu) are rough circles standing in for the paper's mask. **Treat the layout as an impression of the experiment, not a reproduction.** This sim doesn't compute the paper's TL/MD/FT measures.

## Performance

Measured in headless Chromium 151 on debdev, at a 1920 × 1080 viewport. Debdev has no GPU, so canvas compositing ran in software (SwiftShader). Other agents were running on the same 4-core i7-8700K, with a load average of about 5.5.

| Agents | Model step | Trail draw | Frame rate at 1× |
|---|---|---|---|
| 40,471 (dish default) | 6.4–7.2 ms | 1.8 ms | 59–60 fps |
| 100,000 | 11.9–12.7 ms | 1.8 ms | 44–47 fps (60 steps/s kept) |

The plan's target was 100,000 agents at 60 Hz. On this machine that target missed, and the default population is lower anyway, for the visual reasons above. At 2× the default dish ran at roughly 22–60 fps, depending on what else was using the CPU. If the frame rate stays under about 45 fps while the model step is the cost (and *auto agents* is on), the sim drops agents by 20% at a time, down to a floor of 15,000. The HUD says when it does this. There is no GPU path yet.

## Tests

```bash
node --test simulations/slime_mould/tests/*.test.mjs
```

- Two food sources, 2,000 steps, fixed seed, default parameters: the trail in a band along the line between the sources is more than 3× the lattice mean, and has no gap.
- With SA = RA = 45°, the network condenses onto that line: more than 5× the control bands either side.
- The defaults match Table 1, and the same seed gives the same run.
- Exclusion holds (never two agents in a cell). Agents stay out of walls, and walls carry no trail.
- Light repels: under 1% of agents end up in a lit disc that covers about 5% of the area.
- Food and lights can be removed. Resizing the population keeps the existing agents.
- The Tokyo layout has 36 cities, all on land.

## References

- Jones, J. (2010). Characteristics of pattern formation and evolution in approximations of *Physarum* transport networks. *Artificial Life* 16(2), 127–153. https://doi.org/10.1162/artl.2010.16.2.16202. Author's copy (read for Table 1): http://eprints.uwe.ac.uk/15260/1/artl.2010.16.2.pdf (offline when checked; read via the [Wayback Machine](https://web.archive.org/web/20181222163214/http://eprints.uwe.ac.uk:80/15260/1/artl.2010.16.2.pdf)). Repository record: https://uwe-repository.worktribe.com/output/980579. *The hub plan had this title wrong ("…approximation of transport networks with a multi-agent model of Physarum"); the DOI was right.*
- Jones, J. (2011). Influences on the formation and evolution of *Physarum polycephalum* inspired emergent transport networks. *Natural Computing* 10(4), 1345–1369. https://doi.org/10.1007/s11047-010-9223-z. Consulted for the food-projection description.
- Tero, A., Takagi, S., Saigusa, T., Ito, K., Bebber, D. P., Fricker, M. D., Yumiki, K., Kobayashi, R. & Nakagaki, T. (2010). Rules for biologically inspired adaptive network design. *Science* 327(5964), 439–442. https://doi.org/10.1126/science.1177894 (DOI confirmed). Author copy: https://pdodds.w3.uvm.edu/files/papers/others/2010/tero2010a.pdf. PubMed: https://pubmed.ncbi.nlm.nih.gov/20093467/
