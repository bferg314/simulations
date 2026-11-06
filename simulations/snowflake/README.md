# Snowflake

A single snow crystal grows on a hexagonal grid. Three numbers set the conditions, and changing them changes the form: plates, sectored plates, broad stars, stellar dendrites and ferns. The model is Clifford Reiter's local cellular model (2005).

## Files

- `model.js`: the update rule, with no DOM, so it runs under Node.
- `presets.js`: the presets, with the step count each one takes to grow.
- `render.js`: draws the field to an `ImageData`, with interpolation and fake relief.
- `script.js`: the page: controls, conditions drift, the fixed-step loop, Save PNG.
- `tests/model.test.mjs`: run with `node --test simulations/snowflake/tests/*.test.mjs` from the repo root.

## The model

Source: Reiter's own preprint of the paper, [sfn_pp.pdf](https://webbox.lafayette.edu/~reiterc/mvp/sfn/sfn_pp.pdf), linked from his [auxiliary materials page](https://webbox.lafayette.edu/~reiterc/mvp/sfn/index.html). I read the text and the figures there. I did not see the published version behind the Elsevier paywall, so small differences from the journal text are possible.

Each cell of a hexagonal grid holds a real value *s*, informally an amount of water. A cell with *s* ≥ 1 is ice. One step:

1. **Receptive cells** are ice cells and cells with at least one ice neighbour.
2. Split the field. At receptive cells, *v* = *s* + γ and *u* = 0. Everywhere else, *v* = 0 and *u* = *s*. Receptive cells keep whatever mass reaches them; the rest is free to move.
3. **Diffuse** the free field everywhere, receptive cells included: *u*′ = *u* + (α/12)(Σ*u*<sub>neighbours</sub> − 6*u*). With α = 1, that is the paper's "average of the current cell value with the average of its nearest neighbours": the centre has weight 1/2 and each of the six neighbours has weight 1/12.
4. *s*′ = *u*′ + *v*.

The start is one cell at *s* = 1 in a background of β. Cells at Euclidean distance ≥ *R* from the seed stay at β for good (the paper chose a circular boundary to keep things as isotropic as it can). The paper used a field of about 400 × 400 cells and ran until the ice neighboured the boundary or 10,000 steps had passed. Here *R* = 200, and growth stops when the ice comes within two cells of the boundary.

The diffusion parameter comes from the paper's "Variation on diffusion" section, which derives the α form from a hexagonal Laplacian (α = 8*a*, where *a* is the diffusion constant). The paper notes that the growth is very sensitive to α, and that above about 2 the centre weight goes negative, which gives "explosive" growth at α = 2.69.

**What it is not.** The paper says it uses "general physical notions" but is "not trying to fit equations of the physics." So the controls are named for what they do in the model: background vapour (β), vapour supply (γ), diffusion (α). They are not temperature and humidity.

## Presets

All of them use α = 1 except where noted. Each value set is read from a labelled panel in the preprint's figures.

| Preset | β | γ | α | Source | Fill ratio at R = 200 |
|---|---|---|---|---|---|
| Plate | 0.4 | 0.5 | 1 | Fig. 7 left, first stage (plate growth); Fig. 3 shows plates for every β once γ is high | 1.00 |
| Sectored plate | 0.9 | 0.05 | 1 | Fig. 4, bottom right (the paper calls it "a somewhat abstract sector form") | 0.95 |
| Broad star | 0.6 | 0.01 | 1 | Fig. 4, bottom left ("dendrite growth that has nearly collapsed into a stellar form") | 0.63 |
| Stellar dendrite | 0.35 | 0.001 | 1 | Fig. 4, top right ("thick dendrite") | 0.37 |
| Fern | 0.3 | 0.0001 | 1 | Fig. 4, top left ("thin dendrite", with secondary and tertiary branches) | 0.18 |
| Fern, many branches | 0.4 | 0.0001 | 2.003 | Fig. 5 ("a pretty growth pattern with many levels of dendrites") | 0.18 |
| Plate, then dendrite arms | 0.4 → 0.4 | 0.5 → 0.001 | 1 | Fig. 7 left ("begins with parameters giving plate growth, then γ is changed") | 0.38 |

The fill ratio is frozen area divided by the area of the smallest regular hexagon, centred on the seed, that encloses the ice. The tests use it to tell plates from dendrites.

Not confirmed:
- **When Fig. 7 switches.** The paper does not say how far the plate had grown before γ changed. The preset switches at 15 % of the radius, which I chose because it looks like the figure.
- **Pixel-level match.** I compared shapes by eye with Figs. 3, 4, 5 and 7, not cell by cell. The forms match the figures: the hexagon, the sector form with its gaps, the collapsed star, and the thick and thin dendrites.

## Conditions drift

With the toggle on, β and γ wander as the crystal grows. They follow smooth sums of sines in growth progress (ice radius / *R*), ramp in from the chosen values so the centre grows at those values, and swing about ±0.9 in log₁₀ γ and ±0.1 in β. When β changes, the free (non-ice) vapour is rescaled in proportion, the same move the paper describes for its second Fig. 7 example. This is meant to evoke a crystal falling through changing cloud. The model has no physical cloud in it.

## Rendering

The field is sampled per pixel by barycentric interpolation over the lattice triangle the pixel falls in, so the hex grid never shows, and the ice edge (where *s* crosses 1) is anti-aliased. Ice is shaded by the gradient of log *s*, squashed toward a ceiling with tanh. That fake relief lets the ridges catch a light from the upper left. Thicker (older) ice is tinted clearer and deeper blue. Outside the ice, the vapour field is drawn faintly: it matches the page colour at the background level and darkens where the crystal has drawn vapour down.

## The Nakaya inset

The inset is a simplified redraw of K. G. Libbrecht's snow crystal morphology diagram on [snowcrystals.com](https://www.snowcrystals.com/morphology/morphology.html) (image: `SnowflakeMorphology2.jpg` on that page). It has temperature from 0 to about −38 °C, supersaturation from 0 to 0.3 g/m³, bands of plates, columns, plates, then columns and plates, and the water-saturation curve. I read the band edges (about −3.5, −10 and −22 °C) and the curve off that figure by eye, so they are approximate. Libbrecht's page attributes the diagram to Nakaya and coworkers in the 1930s. The inset highlights where the current preset's form occurs in nature. It is real-world context only, and the model's parameters do not map onto its axes.

For a quantitative modern version, see Libbrecht, K. G. (2023), [A Taxonomy of Snow Crystal Growth Behaviors: 2. Quantifying the Nakaya Diagram](https://arxiv.org/abs/2306.13087). I did not use it for the inset.

## Tests

- **Six-fold symmetry.** For the fern, stellar dendrite and sectored plate presets, the test grows 500 steps from the centred seed. The frozen set must be identical under all five 60° rotations about the seed, and the field must match to within 1e-9.
- **Plate versus fern.** Both are grown to the boundary at *R* = 100. The plate's fill ratio must be above 0.9 and the fern's below 0.3. They come out at about 1.00 and 0.18.
- The ice count never falls, and `setBeta` leaves the fixed boundary at the new level in both buffers.

## References

- Reiter, C. A. (2005). A local cellular model for snow crystal growth. *Chaos, Solitons & Fractals* 23(4), 1111–1119. https://doi.org/10.1016/j.chaos.2004.06.071. Preprint: https://webbox.lafayette.edu/~reiterc/mvp/sfn/sfn_pp.pdf
- Reiter, C. A. Auxiliary materials (animations, more β–γ tables). https://webbox.lafayette.edu/~reiterc/mvp/sfn/index.html
- Libbrecht, K. G. Snow crystal morphology diagram. https://www.snowcrystals.com/morphology/morphology.html
- Nakaya, U. (1954). *Snow Crystals: Natural and Artificial*. Harvard University Press. (Cited by Reiter, not read here.)
