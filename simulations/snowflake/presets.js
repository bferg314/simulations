// Presets, named by the form they produce. The (alpha, beta, gamma) values
// are read from the figures of Reiter (2005); README.md says which figure
// each one comes from. alpha = diffusion, beta = background vapour,
// gamma = vapour supply.
//
// `steps` is how many model steps the preset takes to reach the edge of a
// radius-200 field (measured, used to pace the growth speed). `form` is the
// matching label on the Nakaya inset, if there is one.

export const PRESETS = {
    plate:           { label: 'Plate',               alpha: 1,     beta: 0.4,  gamma: 0.5,    form: 'plate' },
    sectoredPlate:   { label: 'Sectored plate',      alpha: 1,     beta: 0.9,  gamma: 0.05,   form: 'sectored' },
    stellarPlate:    { label: 'Broad star',          alpha: 1,     beta: 0.6,  gamma: 0.01,   form: null },
    stellarDendrite: { label: 'Stellar dendrite',    alpha: 1,     beta: 0.35, gamma: 0.001,  form: 'dendrite' },
    fern:            { label: 'Fern',                alpha: 1,     beta: 0.3,  gamma: 0.0001, form: 'dendrite' },
    fernBranched:    { label: 'Fern, many branches', alpha: 2.003, beta: 0.4,  gamma: 0.0001, form: 'dendrite' },
    // Reiter's Fig. 7 (left): plate growth, then gamma drops and arms grow.
    // The paper does not say when it switched; 15% of the radius is a guess
    // that looks like the figure.
    plateToDendrite: {
        label: 'Plate, then dendrite arms', alpha: 1, beta: 0.4, gamma: 0.5, form: null,
        then: { atRadius: 0.15, beta: 0.4, gamma: 0.001 },
    },
};

const STEPS = {
    plate: 395, sectoredPlate: 198, stellarPlate: 987, stellarDendrite: 5837,
    fern: 9054, fernBranched: 2157, plateToDendrite: 3539,
};
for (const [key, steps] of Object.entries(STEPS)) PRESETS[key].steps = steps;
