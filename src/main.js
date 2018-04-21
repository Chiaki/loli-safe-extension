/* global browser */

const storage = browser.storage.local
const background = browser.extension.getBackgroundPage()

document.addEventListener('DOMContentLoaded', () => {
  storage.get(items => {
    for (const key in items) {
      document.getElementById(key).value = items[key]
    }
  })
})

document.getElementById('save').addEventListener('click', () => {
  const textDomain = document.getElementById('textDomain').value
  const textToken = document.getElementById('textToken').value
  if (!textDomain) {
    alert('lolisafe domain is required.')
    return
  }
  storage.set({
    textDomain,
    textToken: textToken || null
  }, () => {
    background.createMenus()
    const notification = background.notifications.create('basic', 'Settings saved.')
    background.notifications.clear(notification, 5000)
  })
})

document.getElementById('textDomain').addEventListener('blur', () => {
  if (this.value.slice(-1) === '/') { this.value = this.value.slice(0, -1) }
})
