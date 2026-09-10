# Overview

This project implements skeletal animation with GPU skinning using WebGL. It includes:
- Bone-based mesh deformation using linear blend skinning (LBS)
- Keyframe animation
- Bone highlighting
- Root joint translation (extra credit)
- Texture mapping (extra credit)
  
# Features
## Mandatory Features
- Bone Hierarchy & Skinning
- Keyframe Animation
- Bone Highlighting
- GUI Controls
## Extra Credit Features
- Root Joint Translation 
- Texture Mapping
- Total Extra Credit: +10 points

# How to Run
- Install dependencies and run a local server (for example, using http-server):
- npm install -g http-server
- http-server
- Open the project in your browser:
- http://127.0.0.1:8080 (or your local host/port)
- Interact with the GUI: Rotate bones, Translate the root bone (extra credit). Toggle texture mapping, Play animation keyframes, Reset pose

# File Structure
- App.ts – main application logic
- Scene.ts – defines meshes, bones, and animation data
- AnimationFileLoader.ts – loads mesh, geometry, and skeleton data
- Shaders.ts – vertex and fragment shaders
