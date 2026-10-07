/*
 * Minimal WebGL 2 mesh viewer: faceted shading over a print-bed grid, with orbit, pan and zoom.
 * One shared offscreen context also renders the still thumbnails shown in the file grid.
 */
const MESH_COLOR = [0.74, 0.76, 0.84]
const MESH_VIEW_LIMIT = 400 * 1024 * 1024
const MESH_THUMB_LIMIT = 40 * 1024 * 1024
const DEFAULT_VIEW = { yaw: -0.65, pitch: 0.45 }
const FOV = 0.6

// Distance at which the bounding sphere fits the view both horizontally and vertically.
const fitDistance = (radius, aspect) => radius / Math.sin(Math.min(FOV / 2, Math.atan(Math.tan(FOV / 2) * aspect))) * 1.08

/* ---------- loading ---------- */

/*
 * Parsing and preparing a model runs in a worker, so a large file never freezes the window.
 * Resolves to the prepared mesh (see prepareMesh in mesh.js), or null when the file holds none.
 */
let meshWorker = null
let meshJobs = 0
const meshReplies = new Map()

function loadMeshInWorker(name, bytes) {
  if (!meshWorker) {
    meshWorker = new Worker('mesh-worker.js')
    meshWorker.onmessage = ({ data }) => {
      const reply = meshReplies.get(data.id)
      meshReplies.delete(data.id)
      data.error ? reply.reject(new Error(data.error)) : reply.resolve(data.mesh)
    }
  }
  const id = ++meshJobs
  return new Promise((resolve, reject) => {
    meshReplies.set(id, { resolve, reject })
    meshWorker.postMessage({ id, name, bytes }, [bytes.buffer])
  })
}

/* ---------- matrices (column-major) ---------- */

const vec = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  normalize: a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l) },
}

function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far)
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]
}

function lookAt(eye, target, up) {
  const z = vec.normalize(vec.sub(eye, target))
  const x = vec.normalize(vec.cross(up, z))
  const y = vec.cross(z, x)
  return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -vec.dot(x, eye), -vec.dot(y, eye), -vec.dot(z, eye), 1]
}

function multiply(a, b) {
  const out = new Float32Array(16)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let sum = 0
    for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k]
    out[c * 4 + r] = sum
  }
  return out
}

const orbitEye = view => [
  view.target[0] + view.distance * Math.cos(view.pitch) * Math.sin(view.yaw),
  view.target[1] + view.distance * Math.sin(view.pitch),
  view.target[2] + view.distance * Math.cos(view.pitch) * Math.cos(view.yaw),
]

/* ---------- renderer ---------- */

const MESH_SHADERS = [`#version 300 es
in vec3 position;
in vec3 normal;
uniform mat4 viewProjection;
out vec3 vNormal;
out vec3 vPosition;
void main() {
  vNormal = normal;
  vPosition = position;
  gl_Position = viewProjection * vec4(position, 1.0);
}`, `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vPosition;
uniform vec3 eye;
uniform vec3 color;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  vec3 toEye = normalize(eye - vPosition);
  if (dot(n, toEye) < 0.0) n = -n; // models are often not watertight: shade both sides
  vec3 key = normalize(vec3(0.45, 0.8, 0.55));
  vec3 fill = normalize(vec3(-0.6, 0.25, -0.45));
  float diffuse = max(dot(n, key), 0.0) * 0.7 + max(dot(n, fill), 0.0) * 0.25;
  float sky = 0.5 + 0.5 * n.y;
  float specular = pow(max(dot(n, normalize(key + toEye)), 0.0), 48.0) * 0.22;
  outColor = vec4(color * (0.22 + 0.2 * sky + diffuse) + specular, 1.0);
}`]

const GRID_SHADERS = [`#version 300 es
in vec3 position;
uniform mat4 viewProjection;
void main() { gl_Position = viewProjection * vec4(position, 1.0); }`, `#version 300 es
precision highp float;
uniform vec4 color;
out vec4 outColor;
void main() { outColor = color; }`]

function compile(gl, [vertexSource, fragmentSource]) {
  const program = gl.createProgram()
  for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    gl.attachShader(program, shader)
  }
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program))
  return program
}

// Grid spacing rounded to 1, 2 or 5 times a power of ten.
function niceStep(value) {
  const power = 10 ** Math.floor(Math.log10(value))
  return [1, 2, 5, 10].map(m => m * power).find(step => step >= value)
}

function gridLines(radius, ground) {
  const extent = radius * 2.4
  const step = niceStep(extent / 6)
  const half = Math.ceil(extent / step) * step
  const lines = []
  for (let v = -half; v <= half + 1e-9; v += step) lines.push(v, ground, -half, v, ground, half, -half, ground, v, half, ground, v)
  return new Float32Array(lines)
}

function createMeshRenderer(gl) {
  const meshProgram = compile(gl, MESH_SHADERS)
  const gridProgram = compile(gl, GRID_SHADERS)
  let buffers = []
  let arrays = []
  let scene = null

  const buffer = (data, program, attribute, vao) => {
    gl.bindVertexArray(vao)
    const b = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, b)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    const location = gl.getAttribLocation(program, attribute)
    gl.enableVertexAttribArray(location)
    gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0)
    buffers.push(b)
  }

  const release = () => {
    buffers.forEach(b => gl.deleteBuffer(b))
    arrays.forEach(a => gl.deleteVertexArray(a))
    buffers = []
    arrays = []
  }

  return {
    load(prepared) {
      release()
      const meshVao = gl.createVertexArray()
      const gridVao = gl.createVertexArray()
      arrays.push(meshVao, gridVao)
      buffer(prepared.positions, meshProgram, 'position', meshVao)
      buffer(prepared.normals, meshProgram, 'normal', meshVao)
      const grid = gridLines(prepared.radius, prepared.ground)
      buffer(grid, gridProgram, 'position', gridVao)
      scene = { prepared, meshVao, gridVao, gridCount: grid.length / 3 }
    },

    draw(view, { width, height, grid = true }) {
      const { prepared, meshVao, gridVao, gridCount } = scene
      gl.viewport(0, 0, width, height)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
      gl.enable(gl.DEPTH_TEST)
      const eye = orbitEye(view)
      const projection = perspective(FOV, width / height, view.distance / 100, view.distance * 10 + prepared.radius * 4)
      const viewProjection = multiply(projection, lookAt(eye, view.target, [0, 1, 0]))

      gl.useProgram(meshProgram)
      gl.uniformMatrix4fv(gl.getUniformLocation(meshProgram, 'viewProjection'), false, viewProjection)
      gl.uniform3fv(gl.getUniformLocation(meshProgram, 'eye'), eye)
      gl.uniform3fv(gl.getUniformLocation(meshProgram, 'color'), MESH_COLOR)
      gl.bindVertexArray(meshVao)
      gl.drawArrays(gl.TRIANGLES, 0, prepared.positions.length / 3)

      if (grid) {
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
        gl.useProgram(gridProgram)
        gl.uniformMatrix4fv(gl.getUniformLocation(gridProgram, 'viewProjection'), false, viewProjection)
        gl.uniform4fv(gl.getUniformLocation(gridProgram, 'color'), [1, 1, 1, 0.09])
        gl.bindVertexArray(gridVao)
        gl.drawArrays(gl.LINES, 0, gridCount)
        gl.disable(gl.BLEND)
      }
    },

    dispose() {
      release()
      gl.deleteProgram(meshProgram)
      gl.deleteProgram(gridProgram)
    },
  }
}

/* ---------- interactive view ---------- */

// Drag to orbit, right drag or Shift+drag to pan, wheel to zoom, double click to reset.
function createMeshView(container, prepared) {
  const canvas = el('canvas', 'mesh-canvas')
  container.append(canvas)
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true })
  if (!gl) throw new Error('WebGL 2 is not available')
  const renderer = createMeshRenderer(gl)
  renderer.load(prepared)

  const initial = () => ({ ...DEFAULT_VIEW, distance: fitDistance(prepared.radius, (canvas.clientWidth || 1) / (canvas.clientHeight || 1)), target: [0, 0, 0] })
  let view = initial()
  let frame = 0
  const draw = () => { frame = 0; renderer.draw(view, { width: canvas.width, height: canvas.height }) }
  const request = () => { if (!frame) frame = requestAnimationFrame(draw) }

  const resize = new ResizeObserver(() => {
    const ratio = devicePixelRatio || 1
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * ratio))
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * ratio))
    request()
  })
  resize.observe(canvas)

  canvas.addEventListener('pointerdown', e => {
    canvas.setPointerCapture(e.pointerId)
    const pan = e.button === 2 || e.shiftKey
    let last = [e.clientX, e.clientY]
    const move = ev => {
      const dx = ev.clientX - last[0]
      const dy = ev.clientY - last[1]
      last = [ev.clientX, ev.clientY]
      if (pan) {
        const forward = vec.normalize(vec.sub(view.target, orbitEye(view)))
        const right = vec.normalize(vec.cross(forward, [0, 1, 0]))
        const up = vec.cross(right, forward)
        const scale = view.distance * 0.0016
        view.target = view.target.map((v, k) => v - right[k] * dx * scale + up[k] * dy * scale)
      } else {
        view.yaw -= dx * 0.008
        view.pitch = Math.max(-1.5, Math.min(1.5, view.pitch + dy * 0.008))
      }
      request()
    }
    const up = () => {
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerup', up)
    }
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerup', up)
  })
  canvas.addEventListener('wheel', e => {
    e.preventDefault()
    e.stopPropagation()
    view.distance = Math.max(prepared.radius * 0.2, Math.min(prepared.radius * 20, view.distance * Math.exp(e.deltaY * 0.0012)))
    request()
  }, { passive: false })
  canvas.addEventListener('dblclick', e => { e.stopPropagation(); view = initial(); request() })
  canvas.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation() })

  return {
    prepared,
    dispose() {
      resize.disconnect()
      cancelAnimationFrame(frame)
      renderer.dispose()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}

/* ---------- thumbnails ---------- */

// One offscreen context renders every thumbnail, one at a time, so the grid never piles up contexts.
const THUMB_SIZE = [360, 450]
let thumbRenderer = null
let thumbCanvas = null
let thumbQueue = Promise.resolve()

function meshThumbnail(path) {
  const job = thumbQueue.then(async () => {
    const bytes = await call('readBinary', path, MESH_THUMB_LIMIT)
    if (!bytes) return null
    const prepared = await loadMeshInWorker(baseName(path), bytes)
    if (!prepared) return null
    if (!thumbRenderer) {
      thumbCanvas = Object.assign(document.createElement('canvas'), { width: THUMB_SIZE[0], height: THUMB_SIZE[1] })
      thumbRenderer = createMeshRenderer(thumbCanvas.getContext('webgl2', { antialias: true, alpha: true, preserveDrawingBuffer: true }))
    }
    thumbRenderer.load(prepared)
    thumbRenderer.draw({ ...DEFAULT_VIEW, distance: fitDistance(prepared.radius, THUMB_SIZE[0] / THUMB_SIZE[1]), target: [0, 0, 0] }, { width: THUMB_SIZE[0], height: THUMB_SIZE[1], grid: false })
    return thumbCanvas.toDataURL('image/png')
  }).catch(() => null)
  thumbQueue = job
  return job
}
