**Skinning — GPU Skeletal Animation (WebGL)**

One-line summary: a compact WebGL demo that implements skeletal animation with GPU skinning (linear blend skinning), keyframe playback, bone highlighting, and a small GUI for interactive exploration.

Why this project is interesting
- Demonstrates core real-time graphics techniques: bone hierarchies, quaternion rotations, linear blend skinning executed in the vertex shader, and GPU-driven vertex deformation.
- Shows end-to-end implementation: model/skeleton loader, animation interpolation, shader-based skinning, and an interactive GUI for playback and debugging.

Key features
- Linear Blend Skinning (LBS) implemented on the GPU via vertex shader
- Bone hierarchy and per-bone transforms (translations + quaternion rotations)
- Keyframe animation with interpolation and playback controls
- Bone highlighting and a wireframe "cage" to visualize a bone's influence
- Texture mapping support for models that include UVs
- Extra: root-joint translation and simple scene floor lighting

What I worked on (high level)
- Implemented and integrated the skinning pipeline: loader → CPU-side skeleton updates → GPU vertex deformation
- Wrote compact, readable WebGL helper utilities and a small GUI for interaction and debugging

Technologies
- TypeScript source (compiled to the distributable in `dist/`)
- WebGL 1.0 (with extensions: `OES_element_index_uint`, `OES_vertex_array_object`)
- Minimal HTML/CSS for the demo UI

Running the demo (quick)
1. Open `dist/index.html` in a static web server. The simplest option is to run a lightweight static server from the repository root. Example using Node.js's `http-server`:

```bash
npm install -g http-server   # if you don't already have one
cd dist
http-server -c-1 .
# then open http://127.0.0.1:8080 in your browser
```

2. Alternatively, open `dist/index.html` in a browser that allows local file module imports (Chrome with appropriate flags, or use a local server as above).

How to interact
- Use the on-screen GUI to:
	- Load different sample models (DAE files are included under `dist/static/assets/skinning/`)
	- Toggle playback modes (scrub / play / step)
	- Hover a bone to highlight it and show a cyan wireframe cage of the bone's influence
	- Toggle textures on and off for models that include UVs

Where to inspect the implementation (technical pointers)
- Application entry: `dist/skinning/index.js` (or source at `src/skinning/index.ts`)
- Core application loop and rendering: `dist/skinning/App.js` → `SkinningAnimation`
- Model/skeleton loader: `dist/skinning/AnimationFileLoader.js` (source in `src/skinning/AnimationFileLoader.ts`)
- Shaders used for skinning and skeleton display: `dist/skinning/Shaders.js` (source in `src/skinning/Shaders.ts`)
- WebGL helpers: `src/lib/webglutils/` (`CanvasAnimation.ts`, `RenderPass.ts`, etc.) — these contain the utility functions that keep the rendering code small and readable.

Notes 
- The `dist/` folder contains a compiled, runnable demo. The `src/` folder contains the TypeScript source and is intentionally small and well-structured to make technical review straightforward.
- Look at `dist/skinning/Shaders.js` to see the GPU-side LBS implementation (vertex shader) — that's the most technically interesting part.

Advanced functionality
- Root-joint translation: the demo supports translating the root bone and correctly propagates transforms through the hierarchy.
- Texture mapping: models with UVs will render with an included texture.
