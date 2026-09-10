export const floorVSText = `
    precision mediump float;

    uniform vec4 uLightPos;
    uniform mat4 uWorld;
    uniform mat4 uView;
    uniform mat4 uProj;
    
    attribute vec4 aVertPos;

    varying vec4 vClipPos;

    void main () {
        gl_Position = uProj * uView * uWorld * aVertPos;
        vClipPos = gl_Position;
    }
`;
export const floorFSText = `
    precision mediump float;

    uniform mat4 uViewInv;
    uniform mat4 uProjInv;
    uniform vec4 uLightPos;

    varying vec4 vClipPos;

    void main() {
        vec4 wsPos = uViewInv * uProjInv * vec4(vClipPos.xyz/vClipPos.w, 1.0);
        wsPos /= wsPos.w;

        float checkerWidth = 5.0;
        float i = floor(wsPos.x / checkerWidth);
        float j = floor(wsPos.z / checkerWidth);
        vec3 color = mod(i + j, 2.0) * vec3(1.0);

        vec4 lightDirection = uLightPos - wsPos;
        float dot_nl = dot(normalize(lightDirection), vec4(0.0, 1.0, 0.0, 0.0));
	    dot_nl = clamp(dot_nl, 0.0, 1.0);
	
        gl_FragColor = vec4(clamp(dot_nl * color, 0.0, 1.0), 1.0);
    }
`;
// =======================
// 🎐 EXTRA CREDIT: TEXTURE MAPPING
// =======================
export const sceneVSText = `
    precision mediump float;

    attribute vec3 vertPosition;
    attribute vec2 aUV;
    attribute vec3 aNorm;
    attribute vec4 skinIndices;
    attribute vec4 skinWeights;

    attribute vec3 v0;
    attribute vec3 v1;
    attribute vec3 v2;
    attribute vec3 v3;
    
    varying vec4 lightDir;
    varying vec2 uv;
    varying vec4 normal;
 
    uniform vec4 lightPosition;
    uniform mat4 mWorld;
    uniform mat4 mView;
    uniform mat4 mProj;

    uniform vec3 jTrans[64];
    uniform vec4 jRots[64];

    vec3 qtrans(vec4 q, vec3 v) {
        return v + 2.0 * cross(cross(v, q.xyz) - q.w * v, q.xyz);
    }

    void main () {

        int i0 = int(skinIndices.x);
        int i1 = int(skinIndices.y);
        int i2 = int(skinIndices.z);
        int i3 = int(skinIndices.w);
 
        float w0 = skinWeights.x;
        float w1 = skinWeights.y;
        float w2 = skinWeights.z;
        float w3 = skinWeights.w;
 
        vec3 p0 = jTrans[i0] + qtrans(jRots[i0], v0);
        vec3 p1 = jTrans[i1] + qtrans(jRots[i1], v1);
        vec3 p2 = jTrans[i2] + qtrans(jRots[i2], v2);
        vec3 p3 = jTrans[i3] + qtrans(jRots[i3], v3);
 
        vec3 skinnedPos = w0 * p0 + w1 * p1 + w2 * p2 + w3 * p3;

        vec4 worldPosition = mWorld * vec4(skinnedPos, 1.0);
        gl_Position = mProj * mView * worldPosition;
        
        lightDir = lightPosition - worldPosition;
        normal = normalize(mWorld * vec4(aNorm, 0.0));
	
        uv = aUV;
    }
`;
export const sceneFSText = `
    precision mediump float;

    varying vec4 lightDir;
    varying vec2 uv;
    varying vec4 normal;

    uniform sampler2D uTexture;
    uniform int hasTexture;

    void main () {

        vec3 n = normalize(normal.xyz);
        vec3 l = normalize(lightDir.xyz);
        float diff = max(dot(n, l), 0.0);

        if (hasTexture == 1) {
            // 🎐 EXTRA CREDIT: sample texture
            vec4 texColor = texture2D(uTexture, uv);
            gl_FragColor = vec4(texColor.rgb * diff, texColor.a);
        } else {
            // fallback shading (lit normal coloring)
            vec3 base = (n + 1.0) * 0.5;
            gl_FragColor = vec4(base * diff, 1.0);
        }
    }
`;
// =======================
// SKELETON
// =======================
export const skeletonVSText = `
    precision mediump float;

    attribute vec3 vertPosition;
    attribute float boneIndex;
    
    uniform mat4 mWorld;
    uniform mat4 mView;
    uniform mat4 mProj;

    uniform vec3 bTrans[64];
    uniform vec4 bRots[64];

    varying float vBoneIndex;

    vec3 qtrans(vec4 q, vec3 v) {
        return v + 2.0 * cross(cross(v, q.xyz) - q.w*v, q.xyz);
    }

    void main () {
        int index = int(boneIndex);
        vBoneIndex = boneIndex;
        gl_Position = mProj * mView * mWorld * vec4(bTrans[index] + qtrans(bRots[index], vertPosition), 1.0);
    }
`;
export const skeletonFSText = `
    precision mediump float;

    varying float vBoneIndex;
    uniform float uHighlightBone;

    void main () {
        if (abs(vBoneIndex - uHighlightBone) < 0.5) {
            gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0);
        } else {
            gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
        }
    }
`;
// =======================
// HIGHLIGHT
// =======================
export const highlightVSText = `
    precision mediump float;
 
    attribute vec3 vertPosition;
    attribute float boneIndex;
    
    uniform mat4 mWorld;
    uniform mat4 mView;
    uniform mat4 mProj;
 
    uniform vec3 bTrans[64];
    uniform vec4 bRots[64];
 
    vec3 qtrans(vec4 q, vec3 v) {
        return v + 2.0 * cross(cross(v, q.xyz) - q.w*v, q.xyz);
    }
 
    void main () {
        int index = int(boneIndex);
        gl_Position = mProj * mView * mWorld * vec4(bTrans[index] + qtrans(bRots[index], vertPosition), 1.0);
    }
`;
export const highlightFSText = `
    precision mediump float;
 
    void main () {
        gl_FragColor = vec4(1.0, 1.0, 0.0, 1.0);
    }
`;
// =======================
// SCRUB BAR
// =======================
export const sBackVSText = `
    precision mediump float;

    attribute vec2 vertPosition;

    varying vec2 uv;

    void main() {
        gl_Position = vec4(vertPosition, 0.0, 1.0);
        uv = vertPosition;
        uv.x = (1.0 + uv.x) / 2.0;
        uv.y = (1.0 + uv.y) / 2.0;
    }
`;
export const sBackFSText = `
    precision mediump float;

    varying vec2 uv;

    void main () {
        gl_FragColor = vec4(0.1, 0.1, 0.1, 1.0);
        if (abs(uv.y-.33) < .005 || abs(uv.y-.67) < .005) {
            gl_FragColor = vec4(1, 1, 1, 1);
        }
    }
`;
//# sourceMappingURL=Shaders.js.map