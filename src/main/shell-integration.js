/*
 * "Open in DevXplorer" entry in the File Explorer context menu, for folders, drives and folder
 * backgrounds. Written under HKCU so no administrator rights are needed. On Windows 11 such
 * classic verbs appear under "Show more options".
 */
const { execFile } = require('child_process')

const KEYS = [
  ['HKCU\\Software\\Classes\\Directory\\shell\\DevXplorer', '%1'],
  ['HKCU\\Software\\Classes\\Directory\\Background\\shell\\DevXplorer', '%V'],
  ['HKCU\\Software\\Classes\\Drive\\shell\\DevXplorer', '%1'],
]

const reg = args => new Promise((resolve, reject) =>
  execFile('reg.exe', args, { windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout)))

async function isEnabled() {
  try {
    await reg(['query', KEYS[0][0]])
    return true
  } catch {
    return false
  }
}

// launch: list of the executable and its fixed arguments; the folder is appended by Explorer.
async function enable(label, launch) {
  for (const [key, target] of KEYS) {
    const command = [...launch, target].map(part => `"${part}"`).join(' ')
    await reg(['add', key, '/ve', '/d', label, '/f'])
    await reg(['add', key, '/v', 'Icon', '/d', launch[0], '/f'])
    await reg(['add', key + '\\command', '/ve', '/d', command, '/f'])
  }
}

async function disable() {
  for (const [key] of KEYS) await reg(['delete', key, '/f']).catch(() => {})
}

module.exports = { isEnabled, enable, disable }
