# Simulation Hub 🌍

A curated collection of interactive visual simulations exploring nature, space, and procedural generation. Built with modern Web Technologies and Three.js.

[**🚀 Launch Live Demo**](https://bferg314.github.io/simulations/)

## 🎨 Simulations

### 🌸 Floral Growth
Watch procedural flowers grow, bloom, and return to the earth in a mesmerizing cycle of life.
- **Tech**: Three.js, InstancedMesh, Custom Geometry
- **Features**: Wind simulation, growth cycles, dynamic coloring

### 🌌 Galactic Voyage
Embark on an infinite journey through procedurally generated star fields and galaxy formations.
- **Tech**: Three.js Points Material, Particle Systems
- **Features**: Infinite scrolling, depth of field, color grading

### 🌳 Whispering Trees
Observe ancient trees swaying in the wind as the day turns to night and the cycle continues.
- **Tech**: Three.js, Fog, Lighting
- **Features**: Day/Night cycle, atmospheric lighting, wind animation

### 🪼 Neon Jellyfish
Deep sea bioluminescent procedural lifeforms with physics-based tentacles.
- **Tech**: Three.js, Physics
- **Features**: Soft body simulation, bioluminescence

### 🐠 Digital Aquarium
An ecosystem of 150 autonomous fish driven by the Boids flocking algorithm.
- **Tech**: Three.js, InstancedMesh
- **Features**: Flocking behavior, predator avoidance

### 🐜 Ant Colony
A pixel-art style simulation of an ant colony digging tunnels and exploring.
- **Tech**: Canvas API, Cellular Automata
- **Features**: Digging mechanics, pheromone trails

## 🚧 Planned Simulations (Microscopic Web Concepts)

### 💧 Pond Drop Microcosm
A single drop of pond water teeming with life across multiple trophic levels.
- **Concept**: Procedural microorganisms, food webs, caustic lighting.

### 🌱 Soil Rhizosphere
Hidden fungal internet and bacterial cities around plant roots.
- **Concept**: L-system fungal networks, root exudates, nutrient cycling.

### 🩸 Blood Vessel Ecology
Flowing environment inside a capillary with cellular inhabitants.
- **Concept**: Fluid dynamics, soft body cells, immune response.

## 🛠️ Technology Stack
- **Core**: HTML5, Vanilla JavaScript (ES6+)
- **Styling**: CSS3 (Variables, Grid, Flexbox, Animations)
- **3D Graphics**: [Three.js](https://threejs.org/)
- **UI Controls**: [Tweakpane](https://tweakpane.github.io/plugin-essential/)

## 💻 Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/bferg314/simulations.git
   cd simulations
   ```

2. **Serve the application**
   Because this project uses ES Modules and separate simulation folders, you need a local web server to run it properly (opening `index.html` directly won't work due to CORS policies).

   **Using VS Code:**
   - Install "Live Server" extension.
   - Right-click `index.html` -> "Open with Live Server".

   **Using Node/NPM:**
   ```bash
   npx serve .
   ```

   **Using Python:**
   ```bash
   # Python 3
   python -m http.server 8000
   ```

3. **Open in Browser**
   Navigate to `http://localhost:8000` (or whatever port your server uses).

## 📄 License
This project is open source and available under the [MIT License](LICENSE).
