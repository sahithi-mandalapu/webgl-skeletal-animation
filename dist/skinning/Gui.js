import { Camera } from "../lib/webglutils/Camera.js";
import { Vec3, Vec4, Quat } from "../lib/TSM.js";
export var Mode;
(function (Mode) {
    Mode[Mode["playback"] = 0] = "playback";
    Mode[Mode["edit"] = 1] = "edit";
})(Mode || (Mode = {}));
export class GUI {
    constructor(canvas, animation) {
        this.hoverX = 0;
        this.hoverY = 0;
        this.highlightedBone = -1;
        this.selectedBone = -1;
        this.rotatingBone = false;
        this.translatingBone = false;
        // Axes snapshotted at mousedown — fixed for the entire drag so
        // the rotation direction stays consistent no matter how far you drag
        this.dragAxisH = null;
        this.dragAxisV = null;
        // Bone's localRotation at mousedown — we recompute from scratch each
        // mousemove using total displacement, avoiding incremental accumulation drift
        this.boneLocalRotAtDragStart = null;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.height = canvas.height;
        this.viewPortHeight = this.height - 200;
        this.viewPortOffsetY = this.height - this.viewPortHeight;
        this.width = canvas.width;
        this.prevX = 0;
        this.prevY = 0;
        this.animation = animation;
        this.reset();
        this.registerEventListeners(canvas);
    }
    getNumKeyFrames() {
        const meshes = this.animation.getScene().meshes;
        if (meshes.length === 0)
            return 0;
        return meshes[0].getNumKeyFrames();
    }
    getTime() { return this.time; }
    getMaxTime() {
        return this.getNumKeyFrames() > 1 ? 1.0 : 0;
    }
    reset() {
        this.fps = false;
        this.dragging = false;
        this.time = 0;
        this.mode = Mode.edit;
        this.rotatingBone = false;
        this.translatingBone = false;
        this.highlightedBone = -1;
        this.selectedBone = -1;
        this.dragAxisH = null;
        this.dragAxisV = null;
        this.boneLocalRotAtDragStart = null;
        this.camera = new Camera(new Vec3([0, 0, -6]), new Vec3([0, 0, 0]), new Vec3([0, 1, 0]), 45, this.width / this.viewPortHeight, 0.1, 1000.0);
    }
    setCamera(pos, target, upDir, fov, aspect, zNear, zFar) {
        this.camera = new Camera(pos, target, upDir, fov, aspect, zNear, zFar);
    }
    viewMatrix() { return this.camera.viewMatrix(); }
    projMatrix() { return this.camera.projMatrix(); }
    // ── Ray construction ──────────────────────────────────────────────────────
    screenToRay(screenX, screenY) {
        const ndcX = (screenX / this.width) * 2.0 - 1.0;
        const viewportY = this.height - screenY - this.viewPortOffsetY;
        const ndcY = (viewportY / this.viewPortHeight) * 2.0 - 1.0;
        const projInv = this.projMatrix().inverse();
        const viewInv = this.viewMatrix().inverse();
        const nearNDC = new Vec4([ndcX, ndcY, -1.0, 1.0]);
        let nearView = projInv.multiplyVec4(nearNDC);
        nearView = new Vec4([nearView.x / nearView.w, nearView.y / nearView.w, nearView.z / nearView.w, 1.0]);
        const nearWorld = viewInv.multiplyVec4(nearView);
        const farNDC = new Vec4([ndcX, ndcY, 1.0, 1.0]);
        let farView = projInv.multiplyVec4(farNDC);
        farView = new Vec4([farView.x / farView.w, farView.y / farView.w, farView.z / farView.w, 1.0]);
        const farWorld = viewInv.multiplyVec4(farView);
        const origin = new Vec3([
            nearWorld.x / nearWorld.w,
            nearWorld.y / nearWorld.w,
            nearWorld.z / nearWorld.w,
        ]);
        const dir = new Vec3([
            farWorld.x / farWorld.w - origin.x,
            farWorld.y / farWorld.w - origin.y,
            farWorld.z / farWorld.w - origin.z,
        ]);
        dir.normalize();
        return { origin, dir };
    }
    // ── Ray-cylinder intersection ─────────────────────────────────────────────
    rayCylinder(origin, dir, p, q, radius) {
        const axis = Vec3.difference(q, p);
        const axisLen = axis.length();
        if (axisLen < 1e-6)
            return Infinity;
        const axisN = axis.copy();
        axisN.normalize();
        const dp = Vec3.difference(origin, p);
        const dot_d_a = Vec3.dot(dir, axisN);
        const dot_dp_a = Vec3.dot(dp, axisN);
        const dirPerp = Vec3.difference(dir, axisN.copy().scale(dot_d_a));
        const dpPerp = Vec3.difference(dp, axisN.copy().scale(dot_dp_a));
        const a = Vec3.dot(dirPerp, dirPerp);
        const b = 2.0 * Vec3.dot(dirPerp, dpPerp);
        const c = Vec3.dot(dpPerp, dpPerp) - radius * radius;
        if (Math.abs(a) < 1e-10)
            return Infinity;
        const disc = b * b - 4 * a * c;
        if (disc < 0)
            return Infinity;
        const sqrtDisc = Math.sqrt(disc);
        for (const t of [(-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a)]) {
            if (t < 0)
                continue;
            const hit = new Vec3([origin.x + t * dir.x, origin.y + t * dir.y, origin.z + t * dir.z]);
            const proj = Vec3.dot(Vec3.difference(hit, p), axisN);
            if (proj >= 0 && proj <= axisLen)
                return t;
        }
        return Infinity;
    }
    // ── Bone picking ──────────────────────────────────────────────────────────
    pickBone(screenX, screenY) {
        const yInViewport = this.height - screenY - this.viewPortOffsetY;
        if (yInViewport < 0 || yInViewport > this.viewPortHeight)
            return -1;
        const meshes = this.animation.getScene().meshes;
        if (meshes.length === 0)
            return -1;
        const { origin, dir } = this.screenToRay(screenX, screenY);
        const bones = meshes[0].bones;
        let bestT = Infinity;
        let bestIdx = -1;
        for (let i = 0; i < bones.length; i++) {
            const t = this.rayCylinder(origin, dir, bones[i].position, bones[i].endpoint, GUI.boneRadius);
            if (t < bestT) {
                bestT = t;
                bestIdx = i;
            }
        }
        return bestIdx;
    }
    // ── Cylinder wireframe geometry for highlight ─────────────────────────────
    getCylinderWireframe(boneIndex, segments = 8) {
        const meshes = this.animation.getScene().meshes;
        if (meshes.length === 0 || boneIndex < 0) {
            return { positions: new Float32Array(0), indices: new Uint32Array(0) };
        }
        const bone = meshes[0].bones[boneIndex];
        const base = bone.position;
        const tip = bone.endpoint;
        const axis = Vec3.difference(tip, base);
        axis.normalize();
        let perp = new Vec3([1, 0, 0]);
        if (Math.abs(Vec3.dot(axis, perp)) > 0.9)
            perp = new Vec3([0, 1, 0]);
        const u = Vec3.cross(axis, perp);
        u.normalize();
        const v = Vec3.cross(axis, u);
        v.normalize();
        const r = GUI.boneRadius * 1.5;
        const positions = [];
        const indices = [];
        for (let ring = 0; ring < 2; ring++) {
            const center = ring === 0 ? base : tip;
            for (let s = 0; s < segments; s++) {
                const angle = (s / segments) * 2 * Math.PI;
                positions.push(center.x + r * (Math.cos(angle) * u.x + Math.sin(angle) * v.x), center.y + r * (Math.cos(angle) * u.y + Math.sin(angle) * v.y), center.z + r * (Math.cos(angle) * u.z + Math.sin(angle) * v.z));
            }
        }
        for (let ring = 0; ring < 2; ring++) {
            for (let s = 0; s < segments; s++) {
                indices.push(ring * segments + s, ring * segments + (s + 1) % segments);
            }
        }
        for (let s = 0; s < segments; s++) {
            indices.push(s, segments + s);
        }
        return {
            positions: new Float32Array(positions),
            indices: new Uint32Array(indices),
        };
    }
    // ── Mouse handlers ────────────────────────────────────────────────────────
    dragStart(mouse) {
        if (mouse.offsetY > 600)
            return;
        this.dragging = true;
        this.prevX = mouse.screenX;
        this.prevY = mouse.screenY;
        if (this.highlightedBone >= 0) {
            this.selectedBone = this.highlightedBone;
            if (mouse.button === 0) {
                this.rotatingBone = true;
                // Snapshot axes and starting position once — never updated during drag
                this.dragAxisH = this.camera.up().copy();
                this.dragAxisV = this.camera.right().copy();
                this.dragStartX = mouse.screenX;
                this.dragStartY = mouse.screenY;
                const meshes = this.animation.getScene().meshes;
                if (meshes.length > 0) {
                    this.boneLocalRotAtDragStart =
                        meshes[0].bones[this.selectedBone].localRotation.copy();
                }
            }
            else if (mouse.button === 2) {
                const bone = this.animation.getScene().meshes[0].bones[this.selectedBone];
                if (bone.parent < 0) {
                    this.translatingBone = true;
                }
            }
        }
    }
    incrementTime(dT) {
        if (this.mode === Mode.playback) {
            this.time += dT;
            if (this.time >= this.getMaxTime()) {
                this.time = 0;
                this.mode = Mode.edit;
            }
        }
    }
    drag(mouse) {
        const x = mouse.offsetX;
        const y = mouse.offsetY;
        if (this.dragging) {
            const dx = mouse.screenX - this.prevX;
            const dy = mouse.screenY - this.prevY;
            this.prevX = mouse.screenX;
            this.prevY = mouse.screenY;
            if (this.rotatingBone && this.selectedBone >= 0
                && this.dragAxisH && this.dragAxisV && this.boneLocalRotAtDragStart) {
                const meshes = this.animation.getScene().meshes;
                if (meshes.length > 0) {
                    // Total displacement from drag origin — not incremental delta
                    const totalDX = mouse.screenX - this.dragStartX;
                    const totalDY = mouse.screenY - this.dragStartY;
                    // Build one combined world-space quaternion from total displacement.
                    // Using fixed axes means no matter how far you drag, direction is stable.
                    const angleH = GUI.rotationSpeed * totalDX;
                    const angleV = GUI.rotationSpeed * totalDY;
                    const halfH = angleH * 0.5;
                    const sH = Math.sin(halfH);
                    const axH = this.dragAxisH;
                    const qH = new Quat([axH.x * sH, axH.y * sH, axH.z * sH, Math.cos(halfH)]);
                    qH.normalize();
                    const halfV = angleV * 0.5;
                    const sV = Math.sin(halfV);
                    const axV = this.dragAxisV;
                    const qV = new Quat([axV.x * sV, axV.y * sV, axV.z * sV, Math.cos(halfV)]);
                    qV.normalize();
                    // Combined world-space rotation: horizontal then vertical
                    const totalWorldDelta = Quat.product(qH, qV);
                    totalWorldDelta.normalize();
                    // Reset the bone to its state at drag-start, then apply the total rotation.
                    // This avoids all incremental accumulation — each frame is computed fresh.
                    const bone = meshes[0].bones[this.selectedBone];
                    bone.localRotation = this.boneLocalRotAtDragStart.copy();
                    // Recompute world state from scratch before applying delta
                    if (bone.parent < 0) {
                        bone.rotation = bone.localRotation.copy();
                    }
                    else {
                        bone.rotation = Quat.product(meshes[0].bones[bone.parent].rotation, bone.localRotation);
                    }
                    bone.rotation.normalize();
                    // Now apply the world-space delta through rotateBone
                    meshes[0].rotateBone(this.selectedBone, totalWorldDelta);
                }
            }
            else if (this.translatingBone && this.selectedBone >= 0) {
                const camRight = this.camera.right();
                const camUp = this.camera.up();
                const delta = new Vec3([
                    dx * camRight.x - dy * camUp.x,
                    dx * camRight.y - dy * camUp.y,
                    dx * camRight.z - dy * camUp.z,
                ]);
                delta.scale(GUI.panSpeed);
                this.animation.getScene().meshes[0].translateBone(this.selectedBone, delta);
            }
            else if (dx !== 0 || dy !== 0) {
                // Camera orbit / zoom
                const mouseDir = this.camera.right();
                mouseDir.scale(-dx);
                mouseDir.add(this.camera.up().scale(dy));
                mouseDir.normalize();
                switch (mouse.buttons) {
                    case 1: {
                        let rotAxis = Vec3.cross(this.camera.forward(), mouseDir);
                        rotAxis = rotAxis.normalize();
                        if (this.fps) {
                            this.camera.rotate(rotAxis, GUI.rotationSpeed);
                        }
                        else {
                            this.camera.orbitTarget(rotAxis, GUI.rotationSpeed);
                        }
                        break;
                    }
                    case 2: {
                        this.camera.offsetDist(Math.sign(mouseDir.y) * GUI.zoomSpeed);
                        break;
                    }
                }
            }
        }
        // Hover highlight always tracks mouse freely
        const isInScene = y >= this.viewPortOffsetY && y <= (this.viewPortOffsetY + this.viewPortHeight);
        this.highlightedBone = isInScene ? this.pickBone(x, y) : -1;
    }
    getModeString() {
        switch (this.mode) {
            case Mode.edit: return "edit: " + this.getNumKeyFrames() + " keyframes";
            case Mode.playback: return "playback: " + this.getTime().toFixed(2) + " / " + this.getMaxTime().toFixed(2);
        }
    }
    dragEnd(mouse) {
        this.dragging = false;
        this.prevX = 0;
        this.prevY = 0;
        this.rotatingBone = false;
        this.translatingBone = false;
        this.selectedBone = -1;
        this.dragAxisH = null;
        this.dragAxisV = null;
        this.boneLocalRotAtDragStart = null;
    }
    // ── Keyboard handler ──────────────────────────────────────────────────────
    onKeydown(key) {
        switch (key.code) {
            case "Digit1": {
                this.animation.setScene("./static/assets/skinning/split_cube.dae");
                break;
            }
            case "Digit2": {
                this.animation.setScene("./static/assets/skinning/long_cubes.dae");
                break;
            }
            case "Digit3": {
                this.animation.setScene("./static/assets/skinning/simple_art.dae");
                break;
            }
            case "Digit4": {
                this.animation.setScene("./static/assets/skinning/mapped_cube.dae");
                break;
            }
            case "Digit5": {
                this.animation.setScene("./static/assets/skinning/robot.dae");
                break;
            }
            case "Digit6": {
                this.animation.setScene("./static/assets/skinning/head.dae");
                break;
            }
            case "Digit7": {
                this.animation.setScene("./static/assets/skinning/wolf.dae");
                break;
            }
            case "KeyW": {
                this.camera.offset(this.camera.forward().negate(), GUI.zoomSpeed, true);
                break;
            }
            case "KeyA": {
                this.camera.offset(this.camera.right().negate(), GUI.zoomSpeed, true);
                break;
            }
            case "KeyS": {
                this.camera.offset(this.camera.forward(), GUI.zoomSpeed, true);
                break;
            }
            case "KeyD": {
                this.camera.offset(this.camera.right(), GUI.zoomSpeed, true);
                break;
            }
            case "KeyR": {
                this.animation.reset();
                break;
            }
            case "ArrowLeft": {
                if (this.highlightedBone >= 0) {
                    this.rollBone(this.highlightedBone, -GUI.rollSpeed);
                }
                else {
                    this.camera.roll(GUI.rollSpeed, false);
                }
                break;
            }
            case "ArrowRight": {
                if (this.highlightedBone >= 0) {
                    this.rollBone(this.highlightedBone, GUI.rollSpeed);
                }
                else {
                    this.camera.roll(GUI.rollSpeed, true);
                }
                break;
            }
            case "ArrowUp": {
                this.camera.offset(this.camera.up(), GUI.zoomSpeed, true);
                break;
            }
            case "ArrowDown": {
                this.camera.offset(this.camera.up().negate(), GUI.zoomSpeed, true);
                break;
            }
            case "KeyK": {
                if (this.mode === Mode.edit) {
                    const meshes = this.animation.getScene().meshes;
                    if (meshes.length > 0)
                        meshes[0].addKeyframe();
                }
                break;
            }
            case "KeyP": {
                if (this.mode === Mode.edit && this.getNumKeyFrames() > 1) {
                    this.mode = Mode.playback;
                    this.time = 0;
                }
                else if (this.mode === Mode.playback) {
                    this.mode = Mode.edit;
                }
                break;
            }
            default: {
                console.log("Key : '", key.code, "' was pressed.");
                break;
            }
        }
    }
    // ── Bone roll ─────────────────────────────────────────────────────────────
    rollBone(boneIndex, angle) {
        const meshes = this.animation.getScene().meshes;
        if (meshes.length === 0)
            return;
        const bone = meshes[0].bones[boneIndex];
        const axis = Vec3.difference(bone.endpoint, bone.position);
        if (axis.length() < 1e-6)
            return;
        axis.normalize();
        const half = angle * 0.5;
        const s = Math.sin(half);
        const rollQ = new Quat([axis.x * s, axis.y * s, axis.z * s, Math.cos(half)]);
        rollQ.normalize();
        meshes[0].rotateBone(boneIndex, rollQ);
    }
    // ── Event listeners ───────────────────────────────────────────────────────
    registerEventListeners(canvas) {
        window.addEventListener("keydown", (key) => this.onKeydown(key));
        canvas.addEventListener("mousedown", (mouse) => this.dragStart(mouse));
        canvas.addEventListener("mousemove", (mouse) => this.drag(mouse));
        canvas.addEventListener("mouseup", (mouse) => this.dragEnd(mouse));
        canvas.addEventListener("contextmenu", (event) => event.preventDefault());
    }
}
GUI.rotationSpeed = 0.004;
GUI.zoomSpeed = 0.1;
GUI.rollSpeed = 0.08;
GUI.panSpeed = 0.01;
GUI.boneRadius = 0.01;
//# sourceMappingURL=Gui.js.map