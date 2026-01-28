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
    }
];

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
        card.style.animationDelay = `${index * 100}ms`; // Staggered animation

        card.innerHTML = `
            <div class="card-image-placeholder">
                ${sim.icon}
            </div>
            <div class="card-content">
                <h2 class="card-title">${sim.title}</h2>
                <p class="card-description">${sim.description}</p>
                <div class="tags" style="margin-bottom: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
                    ${sim.tags.map(tag => `
                        <span style="background: rgba(255,255,255,0.1); padding: 0.25rem 0.75rem; border-radius: 99px; font-size: 0.75rem; color: #94a3b8;">#${tag}</span>
                    `).join('')}
                </div>
                <!-- Note: In production on GitHub Pages, we need to handle relative paths carefully. 
                     For now, we assume simple relative linking. -->
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
    renderSimulations(simulations);
});
