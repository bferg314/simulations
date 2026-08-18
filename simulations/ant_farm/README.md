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
| `skyLine(x)` | `floor(surfaceAt)`. Digging is only allowed below it |
| `outdoorTop(x)` | Lowest cell of the column that still counts as open air |
| `aboveGround(x, y)` | `y <= outdoorTop(x)` — is this ant outdoors? |

`outdoorTop` is the live ground top, *unless* the column has been opened more
than `PIT_TOLERANCE` (20) cells deep, in which case it is the terrain line. That
covers three cases with one rule: an ant on top of the spoil mound is outdoors,
an ant standing in the entrance funnel or the antlion's pit is outdoors, and an
ant down the shaft is not.

Testing against the terrain line alone — the obvious simplification — is wrong in
a way that costs whole castes. The funnel is a dent in the ground line, so its
floor sits *below* that line: an ant on the rim was outdoors, the cell it had to
cross to walk away was not, and the two rules pushed it back and forth over the
same pair of cells until it died. Testing against the live ground top alone is
wrong the other way: a column tunnelled clean through reports its first solid
cell at the bottom of the nest, so ants twenty cells underground believed they
had already reached the surface and stopped climbing.

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

Ants grip; they do not fall. But they grip *something*: `walkable()` requires
soil within two cells, everywhere, above ground and below. Nothing stands in the
middle of an open void. Exempting the underground — on the grounds that a tunnel
wall is always within reach — is what left ants and their cargo hanging in mid-air
across the royal chamber, which is the first thing anyone notices looking at the
glass.

An earlier version modelled per-cell gravity instead. Every attempt to climb was
undone by the fall on the next tick, and whole castes oscillated between two
cells forever. `walkable()` is a footing test, not gravity: it refuses to *enter*
an unsupported cell, so nothing has to be undone afterwards. `settle()` remains
as pure recovery for an ant left hanging when the floor is dug out beneath it,
and it stops the moment the ant has grip again.

Two cells rather than one is deliberate. At one cell, the middle row of any
gallery more than two cells tall is unreachable — the royal chamber split into an
upper and a lower deck, and nurses carrying meals could not get down to the
brood. Two keeps every ant visibly against a surface while leaving ordinary
galleries fully walkable. The grip test is the hottest predicate in the sim, so
it reads from a map that `World.set()` maintains incrementally.

**Loose items obey a stricter rule.** Brood, forage and corpses cannot grip
anything: `World.restItem` drops them until soil is in contact, and pushes them
back *up* out of soil tipped over them. Both halves matter. Without the fall,
every clutch of eggs ends up hanging in mid-air as the chamber floor is dug away
beneath it. Without the rise, the growing spoil mound swallows the surface
forage — and buried seeds still count against the food cap, so the colony starves
in the middle of seventy meals it cannot reach.

The entrance is a **cone**, not a shaft, and it is exactly as deep as it is wide
so that each column is one step deeper than its neighbour. That ratio is not
cosmetic: a searching ant will climb at most two cells per column, and a cone
twice as deep as it was wide held the entire forager caste sweeping back and
forth inside the crater for the rest of their lives.

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

A forager also **gives up on a trail** after `TRAIL_PATIENCE` ticks and goes back
to searching on its own, its patience refilled by a pickup or a delivery. This is
load-bearing rather than decorative. A trail to a patch that has already been
cleared stays above the follow threshold for hundreds of ticks and is topped up
by every ant that walks it, so without the limit the caste circulated inside its
own pheromone for 99% of its working life — a third of a million ant-ticks in
half an hour of simulation, against six hundred spent actually looking — and the
colony starved with the surface full of food.

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

## Digging

A digger picks a target site, works out to the fringe of the nest, cuts one cell,
and hauls the pellet to the surface. Three rules shape what comes out.

**`mayCut` decides whether a cell is worth cutting *here*.** A cell already
surrounded by open space is the wall of a room, and taking it out makes the room
bigger; a cell with only two or three open neighbours is the end of a corridor,
and taking it out makes the corridor longer. Without that distinction every dig
widens whatever is nearest and the nest comes out as a single round cavern under
the entrance with no galleries at all. Three is the threshold that still lets a
new branch start off the side of an existing tunnel while refusing to widen one.
Near a chosen dig site the limit is relaxed, so rooms open out at the ends of
galleries — which is where a real nest keeps its brood and its stores.

**`pushOutward` gets an ant to a face.** It steps to the walkable neighbour
furthest from daylight, biased toward the direction of the target. Every
gallery's far end is a local maximum of `distOut`, so this follows walls to a
working face, which is the one thing greedy stepping cannot do: the middle of an
excavated cavern is open air with nothing to hold, only its walls are walkable,
and a greedy step has no way to get around a corner. Diggers spent well over a
million ticks shuffling between the same three cells before this existed.
(Distance from the *chamber* is worse than useless here — the shaft is the
furthest thing from the chamber that is still underground, so the whole caste
files up it and stands at the entrance.)

**The slab under the royal chamber is off limits.** Brood cannot hold on to
anything, so the moment a digger opens the nursery floor the entire clutch drops
into the gallery below, out of the nurses' reach, and starves.

Galleries are cut below the terrain line only — an ant that has just dumped its
load would otherwise turn round and dig the same cell straight back out. The
working radius grows with the colony, so a young nest is a tight cluster around
the shaft and a mature one reaches across the tank.

## The spoil mound

Spoil goes onto a **trapezoid profile**: the heap rises one cell per column from
the throat, holds a plateau, then tapers back to nothing at the rim.

The profile only describes the finished cone, so a second rule governs how it
gets there: a column may not rise more than one cell above its outward
neighbour. The heap therefore accretes in layers, which is how a real one grows
and, more to the point, is walkable at every stage. Filling each column to its
final height before starting the next — which is what "always fill the nearest
column that is short of profile" does on its own — leaves the working face a
sheer drop of up to `MOUND_MAX_HEIGHT`. Ants can grip their way down a cliff
like that but cannot walk up it, so the heap ends up as a wall ringing the nest
with the foragers penned inside it, pacing the lip.

Constraining a column against its *inward* neighbour as well was also tried: it
pins the whole heap at height two against the untouched apron, so it spreads
flat to the far radius and a single pellet becomes a thousand-tick round trip.

A digger always dumps on **its own side** of the entrance, and only into a column
whose surface is intact. A column with a hole punched through it reads as needing
more fill than any other, so ants queue up to tip pellets down it — the spoil
lands inside the galleries and the colony spends its life filling in the nest it
just dug. Tunnel volume goes backwards.

An apron of untouched ground separates the funnel rim from the heap. The midden —
where corpses go — is bare ground out past the working face of the heap, so it
migrates outward as the mound grows instead of ending up buried under it.

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
mean.

Most of the bugs this simulation has had look identical from the outside — the
colony quietly stops growing — and they are only distinguishable by *where the
ant-ticks go*. Bucket each caste's ticks by the branch it took and print the
totals. Healthy diggers show a few hundred ticks of hauling per cell cut;
diggers walking a million ticks for a thousand cells are lost, not busy.
Foragers should spend most of their time sweeping, not following trails. A
histogram of blocked reversals by distance from the entrance finds terrain the
ants cannot cross, which is what a "they never leave the nest" report usually
turns out to be.

A healthy 54,000-tick (18-day) run reaches roughly 80 workers, a food store in
the hundreds to low thousands, and 2,000+ cells of nest that is still growing at
the end of the run — and, at the eighteen-day mark, no floating brood: every
egg, larva and pupa should have soil in contact with it.
