import { Mat4, Quat, Vec3 } from "../lib/TSM.js";
import { AttributeLoader, MeshGeometryLoader, BoneLoader, MeshLoader } from "./AnimationFileLoader.js";

export class Attribute {
  values: Float32Array;
  count: number;
  itemSize: number;

  constructor(attr: AttributeLoader) {
    this.values = attr.values;
    this.count = attr.count;
    this.itemSize = attr.itemSize;
  }
}

export class MeshGeometry {
  position: Attribute;
  normal: Attribute;
  uv: Attribute | null = null;
  skinIndex: Attribute;
  skinWeight: Attribute;
  v0: Attribute;
  v1: Attribute;
  v2: Attribute;
  v3: Attribute;

  constructor(mesh: MeshGeometryLoader) {
    this.position   = new Attribute(mesh.position);
    this.normal     = new Attribute(mesh.normal);
    if (mesh.uv) { this.uv = new Attribute(mesh.uv); }
    this.skinIndex  = new Attribute(mesh.skinIndex);
    this.skinWeight = new Attribute(mesh.skinWeight);
    this.v0 = new Attribute(mesh.v0);
    this.v1 = new Attribute(mesh.v1);
    this.v2 = new Attribute(mesh.v2);
    this.v3 = new Attribute(mesh.v3);
  }
}

export class Bone {
  public parent: number;
  public children: number[];

  public initialPosition: Vec3;
  public initialEndpoint: Vec3;

  public position: Vec3;
  public endpoint: Vec3;

  public localRotation: Quat;
  public rotation: Quat;

  public localTranslation: Vec3;

  constructor(bone: BoneLoader) {
    this.parent   = bone.parent;
    this.children = Array.from(bone.children);
    this.initialPosition = bone.position.copy();
    this.initialEndpoint = bone.endpoint.copy();
    this.position = bone.position.copy();
    this.endpoint = bone.endpoint.copy();
    this.localRotation = new Quat().setIdentity();
    this.rotation      = bone.rotation.copy();
    this.localTranslation = new Vec3();
  }
}

export class Mesh {
  public geometry: MeshGeometry;
  public worldMatrix: Mat4;
  public rotation: Vec3;
  public bones: Bone[];
  public materialName: string;
  public imgSrc: String | null;

  private boneIndices: number[];
  private bonePositions: Float32Array;
  private boneIndexAttribute: Float32Array;

  private keyframes: Quat[][] = [];

  constructor(mesh: MeshLoader) {
    this.geometry    = new MeshGeometry(mesh.geometry);
    this.worldMatrix = mesh.worldMatrix.copy();
    this.rotation    = mesh.rotation.copy();
    this.bones       = [];
    mesh.bones.forEach(bone => { this.bones.push(new Bone(bone)); });
    this.materialName       = mesh.materialName;
    this.imgSrc             = null;
    this.boneIndices        = Array.from(mesh.boneIndices);
    this.bonePositions      = new Float32Array(mesh.bonePositions);
    this.boneIndexAttribute = new Float32Array(mesh.boneIndexAttribute);
  }

  // ── Bone manipulation ─────────────────────────────────────────────────────

  public rotateBone(boneIndex: number, deltaQ: Quat): void {
    const bone = this.bones[boneIndex];

    // deltaQ is a world-space rotation delta.
    //
    // We store localRotation such that:
    //   bone.rotation (world) = parent.rotation * bone.localRotation
    //
    // We want to prepend deltaQ in world space:
    //   newWorldRot = deltaQ * bone.rotation
    //
    // Solving for the new localRotation:
    //   newWorldRot = parent.rotation * newLocalRot
    //   newLocalRot = parent.rotation^{-1} * newWorldRot
    //               = parent.rotation^{-1} * deltaQ * bone.rotation
    //               = parent.rotation^{-1} * deltaQ * parent.rotation * bone.localRotation
    //
    // So: newLocalRot = (parentInv * deltaQ * parentRot) * oldLocalRot
    //
    // This is the only correct formula — anything else causes drift/circles.

    if (bone.parent < 0) {
      // Root: world == local, just prepend
      bone.localRotation = Quat.product(deltaQ, bone.localRotation);
    } else {
      const parentRot = this.bones[bone.parent].rotation.copy();
      const parentInv = parentRot.copy();
      parentInv.conjugate();
      // Convert world-space delta into parent-local space
      const localDelta = Quat.product(Quat.product(parentInv, deltaQ), parentRot);
      localDelta.normalize();
      bone.localRotation = Quat.product(localDelta, bone.localRotation);
    }

    bone.localRotation.normalize();
    this.updateBoneWorld(boneIndex);
  }

  public translateBone(boneIndex: number, delta: Vec3): void {
    const bone = this.bones[boneIndex];
    if (bone.parent >= 0) return;
    bone.localTranslation = Vec3.sum(bone.localTranslation, delta);
    this.updateBoneWorld(boneIndex);
  }

  private updateBoneWorld(boneIndex: number): void {
    const bone = this.bones[boneIndex];

    if (bone.parent < 0) {
      bone.rotation = bone.localRotation.copy();
      bone.rotation.normalize();
      bone.position = Vec3.sum(bone.initialPosition, bone.localTranslation);
    } else {
      const parent  = this.bones[bone.parent];
      bone.rotation = Quat.product(parent.rotation, bone.localRotation);
      bone.rotation.normalize();

      const offset        = Vec3.difference(bone.initialPosition, parent.initialPosition);
      const rotatedOffset = parent.rotation.multiplyVec3(offset);
      bone.position       = Vec3.sum(parent.position, rotatedOffset);
    }

    const boneVec    = Vec3.difference(bone.initialEndpoint, bone.initialPosition);
    const rotatedVec = bone.rotation.multiplyVec3(boneVec);
    bone.endpoint    = Vec3.sum(bone.position, rotatedVec);

    for (const childIdx of bone.children) {
      this.updateBoneWorld(childIdx);
    }
  }

  // ── Keyframing ────────────────────────────────────────────────────────────

  public addKeyframe(): void {
    this.keyframes.push(this.bones.map(b => b.localRotation.copy()));
  }

  public getNumKeyFrames(): number {
    return this.keyframes.length;
  }

  public applyKeyframePose(t: number): void {
    const n = this.keyframes.length;
    if (n === 0) return;
    if (n === 1) { this.setPose(this.keyframes[0]); return; }

    const scaled   = t * (n - 1);
    const frameIdx = Math.min(Math.floor(scaled), n - 2);
    const alpha    = scaled - frameIdx;

    const interpolated = this.keyframes[frameIdx].map(
      (qa, i) => Quat.slerp(qa, this.keyframes[frameIdx + 1][i], alpha)
    );
    this.setPose(interpolated);
  }

  private setPose(localRotations: Quat[]): void {
    for (let i = 0; i < this.bones.length; i++) {
      this.bones[i].localRotation = localRotations[i].copy();
    }
    for (let i = 0; i < this.bones.length; i++) {
      if (this.bones[i].parent < 0) this.updateBoneWorld(i);
    }
  }

  public resetPose(): void {
    for (let i = 0; i < this.bones.length; i++) {
      this.bones[i].localRotation    = new Quat().setIdentity();
      this.bones[i].rotation         = new Quat().setIdentity();
      this.bones[i].position         = this.bones[i].initialPosition.copy();
      this.bones[i].endpoint         = this.bones[i].initialEndpoint.copy();
      this.bones[i].localTranslation = new Vec3();
    }
    this.keyframes = [];
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  public getBoneIndices(): Uint32Array {
    return new Uint32Array(this.boneIndices);
  }

  public getBonePositions(): Float32Array {
    return this.bonePositions;
  }

  public getBoneIndexAttribute(): Float32Array {
    return this.boneIndexAttribute;
  }

  public getBoneTranslations(): Float32Array {
    const trans = new Float32Array(3 * this.bones.length);
    this.bones.forEach((bone, index) => {
      const res = bone.position.xyz;
      for (let i = 0; i < res.length; i++) { trans[3 * index + i] = res[i]; }
    });
    return trans;
  }

  public getBoneRotations(): Float32Array {
    const trans = new Float32Array(4 * this.bones.length);
    this.bones.forEach((bone, index) => {
      const res = bone.rotation.xyzw;
      for (let i = 0; i < res.length; i++) { trans[4 * index + i] = res[i]; }
    });
    return trans;
  }
}