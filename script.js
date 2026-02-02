// Simulation Data
const simulations = [
    {
        id: 'flowers',
        title: 'Floral Growth',
        description: 'Watch procedural flowers grow, bloom, and return to the earth in a mesmerizing cycle of life.',
        path: 'simulations/flowers/',
        tags: ['nature', 'procedural', 'calm'],
        icon: '🌸'
    },
    {
        id: 'space',
        title: 'Galactic Voyage',
        description: 'Embark on an infinite journey through procedurally generated star fields and galaxy formations.',
        path: 'simulations/space/',
        tags: ['space', 'particles', 'infinite'],
        icon: '🌌'
    },
    {
        id: 'trees',
        title: 'Whispering Trees',
        description: 'Observe ancient trees swaying in the wind as the day turns to night and the cycle continues.',
        path: 'simulations/trees/',
        tags: ['nature', 'atmospheric', 'day-night'],
        icon: '🌳'
    },
    {
        id: 'jellyfish',
        title: 'Neon Jellyfish',
        description: 'Deep sea bioluminescent procedural lifeforms with physics-based tentacles.',
        path: 'simulations/jellyfish/',
        tags: ['water', 'creatures', 'physics'],
        icon: '🪼'
    },
    {
        id: 'aquarium',
        title: 'Digital Aquarium',
        description: 'An ecosystem of 150 autonomous fish driven by the Boids flocking algorithm.',
        path: 'simulations/aquarium/',
        tags: ['ai', 'nature', 'flocking'],
        icon: '🐠'
    },
    {
        id: 'ant_farm',
        title: 'Ant Colony',
        description: 'A pixel-art style simulation of an ant colony digging tunnels and exploring.',
        path: 'simulations/ant_farm/',
        tags: ['pixel-art', 'calm', 'automata'],
        icon: '🐜'
    },
    {
        id: 'pond_drop',
        title: 'Pond Drop Microcosm',
        description: 'A single drop of pond water teeming with life across multiple trophic levels.',
        path: 'simulations/pond_drop/',
        tags: ['microscopic', 'biology', 'ecosystem', 'planned'],
        icon: '💧'
    },
    {
        id: 'soil_rhizosphere',
        title: 'Soil Rhizosphere',
        description: 'Hidden fungal internet and bacterial cities around plant roots.',
        path: 'simulations/soil_rhizosphere/',
        tags: ['biology', 'fungi', 'underground', 'planned'],
        icon: '🌱'
    },
    {
        id: 'blood_vessel',
        title: 'Blood Vessel Ecology',
        description: 'Flowing environment inside a capillary with cellular inhabitants.',
        path: 'simulations/blood_vessel/',
        tags: ['biology', 'medical', 'flow', 'planned'],
        icon: '🩸'
    }
];

// Bizarre Color Palettes
const palettes = [
    { primary: '#38bdf8', secondary: '#8b5cf6', accent: '#f43f5e', bg: '#0f172a' },
    { primary: '#fbbf24', secondary: '#ec4899', accent: '#06b6d4', bg: '#1e1b4b' },
    { primary: '#22c55e', secondary: '#f97316', accent: '#a855f7', bg: '#111827' },
    { primary: '#ef4444', secondary: '#0ea5e9', accent: '#facc15', bg: '#171717' },
    { primary: '#6366f1', secondary: '#10b981', accent: '#f472b6', bg: '#020617' },
    { primary: '#84cc16', secondary: '#8b5cf6', accent: '#f97316', bg: '#082f49' },
    { primary: '#f43f5e', secondary: '#fbbf24', accent: '#22c55e', bg: '#450a0a' }
];

function applyRandomPalette() {
    const palette = palettes[Math.floor(Math.random() * palettes.length)];
    const root = document.documentElement;
    root.style.setProperty('--primary-color', palette.primary);
    root.style.setProperty('--secondary-color', palette.secondary);
    root.style.setProperty('--accent-color', palette.accent);
    root.style.setProperty('--bg-color', palette.bg);
}

// DOM Elements
const grid = document.getElementById('simulationGrid');
const searchInput = document.getElementById('searchInput');
const noResults = document.getElementById('noResults');

// Render Function
function renderSimulations(list) {
    grid.innerHTML = '';

    if (list.length === 0) {
        noResults.classList.remove('hidden');
        return;
    }

    noResults.classList.add('hidden');

    list.forEach((sim, index) => {
        const card = document.createElement('div');
        card.className = 'simulation-card';

        // Random slight rotation for bizarre effect
        const rotation = (Math.random() * 4 - 2).toFixed(2);
        card.style.transform = `rotate(${rotation}deg)`;
        card.style.animationDelay = `${index * 100}ms`;

        card.innerHTML = `
            <div class="card-image-placeholder">
                ${sim.icon}
            </div>
            <div class="card-content">
                <h2 class="card-title">${sim.title}</h2>
                <p class="card-description">${sim.description}</p>
                <div class="tags">
                    ${sim.tags.map(tag => `
                        <span class="tag">#${tag}</span>
                    `).join('')}
                </div>
                <a href="${sim.path}" class="launch-btn">Launch Simulation</a>
            </div>
        `;

        grid.appendChild(card);
    });
}

// Filter Function
function filterSimulations(query) {
    const lowerQuery = query.toLowerCase();

    const filtered = simulations.filter(sim => {
        return (
            sim.title.toLowerCase().includes(lowerQuery) ||
            sim.description.toLowerCase().includes(lowerQuery) ||
            sim.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
        );
    });

    renderSimulations(filtered);
}

// Event Listeners
searchInput.addEventListener('input', (e) => {
    filterSimulations(e.target.value);
});

// Initial Render
document.addEventListener('DOMContentLoaded', () => {
    applyRandomPalette();
    renderSimulations(simulations);
});
