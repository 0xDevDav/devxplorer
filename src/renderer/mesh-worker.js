// Parses and prepares 3D models off the main thread for the viewer and the grid thumbnails.
importScripts('mesh.js')

onmessage = async ({ data: { id, name, bytes } }) => {
  try {
    const mesh = await loadMesh(name, bytes)
    postMessage({ id, mesh }, mesh ? [mesh.positions.buffer, mesh.normals.buffer] : [])
  } catch (e) {
    postMessage({ id, error: e.message })
  }
}
