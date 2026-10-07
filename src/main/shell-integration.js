/*
 * "Open in DevXplorer" entry in the File Explorer context menu, for folders, drives and folder
 * backgrounds. Written under HKCU so no administrator rights are needed. On Windows 11 such
 * classic verbs appear under "Show more options".
 *
 * Making DevXplorer the default file manager turns that entry into the default action of folders
 * and drives (double click on the Desktop, "open folder" from other programs) and points Win+E at
 * it, as Directory Opus and similar apps do. Everything else (the desktop, the taskbar, the
 * Recycle Bin, Open and Save dialogs) stays with Windows.
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
  await unsetDefault()
  for (const [key] of KEYS) await reg(['delete', key, '/f']).catch(() => {})
}

const VERB = 'DevXplorer'
const DEFAULT_PARENTS = ['HKCU\\Software\\Classes\\Directory\\shell', 'HKCU\\Software\\Classes\\Drive\\shell']
// "This PC", which Win+E opens; a command here replaces the one File Explorer registers.
const WIN_E = 'HKCU\\Software\\Classes\\CLSID\\{52205fd8-5dfb-447d-801a-d0b52f2e83e1}'

async function isDefault() {
  try {
    return (await reg(['query', DEFAULT_PARENTS[0], '/ve'])).includes(VERB)
  } catch {
    return false
  }
}

async function setDefault(label, launch) {
  await enable(label, launch)
  for (const key of DEFAULT_PARENTS) await reg(['add', key, '/ve', '/d', VERB, '/f'])
  const command = WIN_E + '\\shell\\opennewwindow\\command'
  await reg(['add', command, '/ve', '/d', launch.map(part => `"${part}"`).join(' '), '/f'])
  await reg(['add', command, '/v', 'DelegateExecute', '/d', '', '/f'])
}

// Gives folders back to File Explorer; only values DevXplorer set are removed.
async function unsetDefault() {
  if (!(await isDefault())) return
  for (const key of DEFAULT_PARENTS) await reg(['delete', key, '/ve', '/f']).catch(() => {})
  await reg(['delete', WIN_E, '/f']).catch(() => {})
}

module.exports = { isEnabled, enable, disable, isDefault, setDefault, unsetDefault }
