/*
 * Renders assets/icon.svg to assets/icon.png (1024x1024), the source electron-builder turns
 * into the Windows .ico, and the logos the Windows 11 context menu package needs.
 * Run with: npm run icon
 */
const { app, BrowserWindow, nativeImage } = require('electron')
const fs = require('fs')
const path = require('path')

const SIZE = 1024
const svg = fs.readFileSync(path.join(__dirname, '..', 'assets', 'icon.svg'), 'utf8')

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false })
  await win.loadURL('data:text/html,<canvas></canvas>')
  const dataUrl = await win.webContents.executeJavaScript(`new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.querySelector('canvas')
      canvas.width = canvas.height = ${SIZE}
      canvas.getContext('2d').drawImage(img, 0, 0, ${SIZE}, ${SIZE})
      resolve(canvas.toDataURL('image/png'))
    }
    img.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}'
  })`)
  const png = Buffer.from(dataUrl.split(',')[1], 'base64')
  fs.writeFileSync(path.join(__dirname, '..', 'assets', 'icon.png'), png)
  const logos = path.join(__dirname, '..', 'assets', 'shellext', 'Assets')
  fs.mkdirSync(logos, { recursive: true })
  for (const [name, size] of [['StoreLogo', 50], ['Square44x44Logo', 44], ['Square150x150Logo', 150]]) {
    fs.writeFileSync(path.join(logos, name + '.png'), nativeImage.createFromBuffer(png).resize({ width: size, height: size, quality: 'best' }).toPNG())
  }
  // Microsoft Store package: the same logos, plus the wide tile with the icon centred.
  const store = path.join(__dirname, '..', 'assets', 'appx')
  fs.mkdirSync(store, { recursive: true })
  for (const name of ['StoreLogo', 'Square44x44Logo', 'Square150x150Logo']) fs.copyFileSync(path.join(logos, name + '.png'), path.join(store, name + '.png'))
  const wide = await win.webContents.executeJavaScript(`new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.querySelector('canvas')
      canvas.width = 310
      canvas.height = 150
      const context = canvas.getContext('2d')
      context.clearRect(0, 0, 310, 150)
      context.drawImage(img, 95, 15, 120, 120)
      resolve(canvas.toDataURL('image/png'))
    }
    img.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}'
  })`)
  fs.writeFileSync(path.join(store, 'Wide310x150Logo.png'), Buffer.from(wide.split(',')[1], 'base64'))
  app.quit()
})
