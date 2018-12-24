/* global browser */

const storage = browser.storage.local
const background = browser.extension.getBackgroundPage()

document.addEventListener('DOMContentLoaded', function () {
  storage.get(items => {
    for (const key in items)
      document.getElementById(key).value = items[key]
  })
})

document.getElementById('reset').addEventListener('click', function () {
  document.getElementById('textDomain').value = ''
  document.getElementById('textToken').value = ''

  storage.clear().then(function () {
    background.notifications.create('basic', 'Settings cleared.')
  }).catch(function (error) {
    background.notifications.create('basic', error.toString())
  })
})

document.getElementById('save').addEventListener('click', function () {
  const textDomain = document.getElementById('textDomain').value
  const textToken = document.getElementById('textToken').value || null

  if (textDomain) {
    if (!/^https?:\/\//.test(textDomain))
      return alert('Domain must begin with a valid HTTP/HTTPS protocol.')

    if (/\/$/.test(textDomain))
      return alert('Domain should not have a trailing slash.')
  }

  storage.set({ textDomain, textToken }).then(function () {
    background.createMenus()
    background.notifications.create('basic', 'Settings saved.')
  }).catch(function (error) {
    background.notifications.create('basic', error.toString())
  })
})
