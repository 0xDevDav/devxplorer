/*
 * Name rules and free-name lookup shared by every file operation.
 */
const fs = require('fs')
const path = require('path')

const INVALID_NAME = /[<>:"/\\|?*\x00-\x1f]|[. ]$/
// Device names Windows reserves in every folder, with or without an extension: Explorer cannot
// open or delete an item named like this.
const RESERVED_NAME = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i

const validName = name => !!name && !INVALID_NAME.test(name) && !RESERVED_NAME.test(name)

// The path itself when free, otherwise "name (2).ext", "name (3).ext"… A folder keeps any dots in
// its name whole: "v1.2" becomes "v1.2 (2)".
function uniquePath(p) {
  if (!fs.existsSync(p)) return p
  const ext = fs.statSync(p).isDirectory() ? '' : path.extname(p)
  const stem = p.slice(0, p.length - ext.length)
  for (let i = 2; ; i++) {
    const candidate = `${stem} (${i})${ext}`
    if (!fs.existsSync(candidate)) return candidate
  }
}

module.exports = { validName, uniquePath }
