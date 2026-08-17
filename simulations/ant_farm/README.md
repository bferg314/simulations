# Ant Colony

**The World:** A cross-section of soil behind glass. A single founding queen
sinks a shaft, excavates a royal chamber, and raises a colony that has to feed
itself, dig its own nest, and survive the weather.

## Layout

```
simulations/ant_farm/
  index.html      panels + toolbar markup
  style.css       panel/toolbar styling
  script.js       scene, sim loop, UI wiring
  render.js       ImageData painter, glass + wooden bezel
  config.js       every tuning constant
  classes/
    World.js      grid, terrain, pheromone fields, water, cave-ins
    Colony.js     food store, census, caste assignment, brood promotion
    Ant.js        movement, cargo, ageing, trail laying
    Queen.js      founding, chamber excavation, egg laying
    Worker.js     forager / nurse / digger behaviour
    Brood.js      Egg, Larva, Pupa
    Food.js       forage items and corpses
    Antlion.js    surface predator
```

## The grid

One `Uint8Array` cell per pixel: `AIR`, `DIRT`, or `WATER`. Three derived views
of a column matter, and conflating them caused most of the hard bugs:

| | Meaning |
| --- | --- |
| `surfaceAt(x)` | Nominal terrain height, the sine landscape, never changes |
| `groundTop(x)` | Topmost solid cell *now* — moves as ants dig pits and pile spoil |
| `skyLine(x)` | `floor(surfaceAt)`. At or below it is "inside the ground" |

`skyLine` is deliberately the untouched terrain line rather than the live ground
top. A column tunnelled clean through has its first solid cell far below the
surface, so `groundTop` would report an ant standing in the royal chamber as
being outdoors.

## Navigation

Two breadth-first distance fields over the open cells, rebuilt every 150 ticks:
`distOut` (to daylight) and `distNest` (to the royal chamber). Ants walk
downhill on whichever they need.

This is load-bearing. Greedy step-toward navigation does not survive a
branching nest: a laden ant standing in a gallery has solid rock overhead, so
every move that shortens its straight-line distance fails and it shuffles on
the spot until it happens to stumble into the shaft. Before the fields existed,
diggers spent about twelve ticks hauling for every one spent digging; afterwards
the ratio inverted and the nest actually grows.

## Movement

Ants grip; they do not fall. Inside the nest a wall is always within reach, so
movement is unrestricted. Above ground they must stay in contact with soil,
which is what keeps them from drifting into the sky. A `settle()` step catches
anyone left hanging in open air after the ground is dug out from under them.

An earlier version modelled per-cell gravity. Every attempt to climb was undone
by the fall on the next tick, and whole castes oscillated between two cells
forever — the colony never left its own chamber.

The entrance is a **cone**, not a shaft. Each column is one step deeper than its
neighbour so the walls form a continuous ramp. Only the rim of that cone has
soil adjacent to the ground line, so it is the one place ants can cross between
the surface and the nest.

## Pheromones

Two fields, `home` and `foodField`, decayed **lazily**: each cell stores a value
and the tick it was written, and a read scales it by `rate^age` from a lookup
table. That replaces a 240k-float sweep per frame with O(1) per access, and ties
decay to sim ticks so the speed control cannot alter colony behaviour.

Deposits take `max()`, never `+=`. Summing saturates the field into a
featureless blob; the maximum preserves a gradient back to the source. Strength
falls off with distance travelled since the ant's last anchor event — leaving
the nest, or picking up food.

Ants **follow trails to food but navigate home by dead reckoning**, which is what
real ants do. The home field is near-flat wherever traffic is heavy, because
every outbound ant leaves the nest at full strength, so ascending it is a slow
random walk. Trails earn their keep recruiting nestmates to a find.

Turn on **Show pheromone trails** to see both fields — food in green, home in
blue.

## Castes

`Worker.role` is reassigned on a review interval with a hysteresis band, driven
by colony need:

| Role | Job | Scales with |
| --- | --- | --- |
| **Forager** | Find surface food, carry it to the chamber, lay food trail | Surges when the store runs low |
| **Nurse** | Draw a meal from the store, carry it to the hungriest larva | Number of unfed larvae |
| **Digger** | Cut galleries, haul spoil to the mound, repair cave-ins | Takes the remainder |

Only unencumbered ants change job, so nobody abandons a load midway.

## The spoil mound

Diggers cut galleries below the terrain line only — an ant that has just dumped
its load would otherwise turn round and dig the same cell straight back out.

Spoil goes onto a **trapezoid profile**: the heap rises one cell per column from
the throat, holds a plateau, then tapers back to nothing at the rim. Every step
is a single cell, which is the most an ant can climb or drop in one stride.

Two other rules were tried and both failed in instructive ways. Constraining a
column only against its outward neighbour let the inner face grow into a
sixteen-cell cliff that penned foragers outside the nest holding food they
could not deliver. Constraining against both neighbours fixed the cliff but
pinned the whole heap at height two against the untouched apron, so it spread
flat to the far radius and a single pellet became a thousand-tick round trip.

A digger always dumps on **its own side** of the entrance. Sending it to the
nearest column regardless of side makes it try to cross the funnel; stepping
into the bowl puts it below the ground line, its navigation walks it straight
back out, and it see-saws on the rim forever without unloading.

An apron of untouched ground separates the funnel rim from the heap, and the
midden — where corpses go — sits out past the working face.

## Food economy

`Colony.foodStore` is the single resource. Foragers add to it, nurses spend it
on larvae, and the queen's laying rate scales with the surplus, so famine
visibly throttles the colony instead of the queen laying regardless. Everyone
draws a trickle of upkeep. An empty store starves the brood first, then the
queen — with a long fuse, so only a sustained famine kills her.

Set **Food abundance** to zero to watch the whole thing wind down.

## Weather and threats

- **Rain** floods the funnel and drains through the galleries. Standing water
  soaks into the surrounding soil, so the nest drains rather than becoming a
  permanent sump.
- Wet tunnels **collapse**: a ceiling cell drops into the void below and is
  queued for a digger to re-excavate, which is what gives diggers a standing job
  rather than a one-off build phase.
- Ants caught underwater **drown**.
- Heavy rain (intensity ≥ 0.6) drives workers underground and foraging stops for
  the duration. Diggers seal the doorway with a bounded plug; the colony breaks
  it open again once the weather clears. That reopening is guaranteed rather
  than left to the repair queue — relying on diggers to find it meant the nest
  sometimes stayed sealed for good and starved behind a wall it had built
  itself.
- An **antlion** pit sits somewhere out on the surface. Foragers that wander in
  lose their footing and slide toward the mandibles.

A long downpour at high intensity can destroy a colony. That is the intended
hazard; rain is off by default.

## Rendering

The sim paints into a persistent `ImageData` and uploads it as a texture on a
plane. Everything that depends only on the row — strata tint, depth shading, sky
gradient — is precomputed, so the pixel loop is a couple of array reads plus a
**baked** per-cell noise offset. Recomputing that noise per frame is what made
the old build's soil boil like TV static.

The camera is orthographic with rotation disabled: it is a flat pane, and the
old perspective orbit only ever let you look at the back of it. A wooden bezel
sits in front to crop the soil edges, with a glass sheen and vignette over the
pane.

## Verifying changes

The simulation classes are pure logic with no `three` or DOM dependency, so they
can be driven headlessly under Node — which is far more informative than
watching the glass. Copy the folder somewhere with `{"type":"module"}` in a
`package.json`, import `World` and `Colony`, and step them in a loop.

Things worth asserting: the queen reaches the laying state, food is actually
delivered, tunnel volume keeps growing rather than plateauing, no ant sits with
a rising stuck counter, and both pheromone fields hold a peak well above their
mean. The single most diagnostic number is the diggers' carrying-to-free tick
ratio — if it climbs above about one, they are stuck hauling and the nest has
stopped growing.

A healthy 40,000-tick run reaches roughly 90 workers, 300+ deliveries and 900+
cells excavated beyond the starting shaft.
