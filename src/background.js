/* global browser, axios */

const title = 'lolisafe'

browser.runtime.onInstalled.addListener(details => {
  if (details.reason === 'update') {
    /* == Made changes to storage names. == */
    // browser.storage.local.clear();
  }
})

const contexts = ['image', 'video', 'audio']

let config

browser.storage.local.get(items => {
  config = items
  createMenus()
})

browser.storage.onChanged.addListener((changes, namespace) => {
  for (const key in changes) {
    config[key] = changes[key].newValue
  }
})

async function createMenus () {
  if (Object.keys(config).length === 0 || !config.textDomain) { return }

  await browser.menus.removeAll()
  console.log('Removed old menus.')

  /* == Parent Context Menu == */
  menus.parent = browser.menus.create({
    title,
    contexts: ['all'],
    onclick () {
      browser.tabs.create({url: config.textDomain + '/dashboard'})
    }
  })

  /* == Refresh == */
  if (config.textToken) {
    browser.menus.create({
      title: 'Refresh albums list',
      parentId: menus.parent,
      contexts,
      onclick () {
        createMenus()
      }
    })

    /* == Separator == */
    browser.menus.create({
      parentId: menus.parent,
      contexts,
      type: 'separator'
    })
  }

  /* == Upload normally == */
  browser.menus.create({
    title: 'Send to safe',
    parentId: menus.parent,
    contexts,
    onclick (info) { upload(info.srcUrl, info.pageUrl) }
  })

  browser.menus.create({
    title: 'Screenshot Entire Page',
    parentId: menus.parent,
    contexts: ['page'],
    onclick (info) {
      browser.tabs.captureVisibleTab({
        format: 'png'
      }, data => {
        const blob = b64toBlob(data.replace('data:image/png;base64,', ''), 'image/png')
        uploadScreenshot(blob)
      })
    }
  })

  /*
  browser.menus.create({
    title: 'Screenshot Selection',
    parentId: menus.parent,
    contexts: ['page'],
    onclick (info) {
      browser.tabs.captureVisibleTab({
        format: 'png'
      }, () => {
        browser.tabs.query({ 'active': true }, tabs => {
          browser.tabs.sendMessage(tabs[0].id, { action: 1 })
        })
      })
    }
  })
  */

  if (config.textToken) {
    /* == Separator == */
    browser.menus.create({
      parentId: menus.parent,
      contexts,
      type: 'separator'
    })

    const list = await axios({
      method: 'get',
      url: `${config.textDomain}/api/albums`,
      headers: {
        token: config.textToken
      }
    }).catch(error => {
      console.error(error)
      browser.menus.create({
        title: 'Error getting albums',
        parentId: menus.parent,
        contexts,
        type: 'normal',
        enabled: false
      })
    })

    if (!list) { return }

    if (list.data.albums.length === 0) {
      browser.menus.create({
        title: 'No albums available',
        parentId: menus.parent,
        contexts,
        type: 'normal',
        enabled: false
      })
    } else {
      browser.menus.create({
        title: 'Upload to:',
        parentId: menus.parent,
        contexts,
        type: 'normal',
        enabled: false
      })

      list.data.albums.forEach(album => {
        console.log(album.id, album.name)
        menus.createMenu(album.id, album.name)
      })
    }
  }
}

const menus = {
  parent: null,
  children: {},
  createMenu (id, name) {
    const CM = browser.menus.create({
      title: name.replace('&', '&&'),
      parentId: menus.parent,
      contexts,
      onclick (info) {
        upload(info.srcUrl, info.pageUrl, menus.children[info.menuItemId])
      }
    }, a => {
      menus.children[CM] = id // Binds the Album ID to the Context Menu ID
    })
  }
}

let refererHeader = null

/* == We need to set this header for image sources that check it for auth or to prevent hotlinking == */
browser.webRequest.onBeforeSendHeaders.addListener(details => {
  if (details.tabId === -1 && details.method === 'GET' && refererHeader !== null) {
    details.requestHeaders.push({
      name: 'Referer',
      value: refererHeader
    })
    details.requestHeaders.push({
      name: 'Referrer',
      value: refererHeader
    })
  }
  return {requestHeaders: details.requestHeaders}
}, {urls: ['<all_urls>']}, ['blocking', 'requestHeaders'])

async function upload (url, pageURL, albumid) {
  const notification = notifications.create('basic', 'Retrieving file\u2026', null, true)

  const errored = error => {
    console.error(error)
    notifications.update(notification, {
      type: 'basic',
      message: error.toString(),
      contextMessage: url
    })
  }

  refererHeader = pageURL // Sets the Page URl as the referer url

  const file = await axios({
    method: 'get',
    url,
    responseType: 'blob'
  }).catch(errored)

  if (!file) { return }

  refererHeader = null // Set to null after we're done with it

  notifications.update(notification, {
    type: 'progress',
    message: 'Uploading\u2026',
    progress: 0
  })

  const data = new FormData()
  data.append('files[]', file.data, 'upload' + fileExt(file.data.type))

  const options = {
    method: 'POST',
    url: config.textDomain + '/api/upload',
    data,
    headers: {},
    onUploadProgress (progress) {
      notifications.update(notification, {
        progress: Math.round((progress.loaded * 100) / progress.total)
      })
    }
  }

  if (config.textToken) { options.headers['token'] = config.textToken }

  if (albumid && config.textToken) {
    options.url = options.url + '/' + albumid
  }

  const response = await axios(options).catch(errored)

  if (!response) { return }

  if (response.data.success === true) {
    copyText(response.data.files[0].url)
    notifications.update(notification, {
      type: 'basic',
      message: 'Upload completed.',
      contextMessage: response.data.files[0].url
    })
    notifications.clear(notification, 5000)
  } else {
    notifications.update(notification, {
      type: 'basic',
      message: response.data.description,
      contextMessage: url
    })
  }
}

browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if ('coordinates' in request) {
    console.log(request.coordinates)
  }
})

async function uploadScreenshot (blob, albumid) {
  const notification = notifications.create('progress', 'Uploading\u2026', null, true, 0)

  const data = new FormData()
  data.append('files[]', blob, 'upload.png')

  const options = {
    method: 'POST',
    url: config.textDomain + '/api/upload',
    data,
    headers: {},
    onUploadProgress (progress) {
      notifications.update(notification, {
        progress: Math.round((progress.loaded * 100) / progress.total)
      })
    }
  }

  if (config.textToken) { options.headers['token'] = config.textToken }

  if (albumid && config.textToken) {
    options.url = options.url + '/' + albumid
  }

  const response = await axios(options).catch(error => {
    console.log(error)
    notifications.update(notification, {
      type: 'basic',
      message: 'An error occurred.',
      contextMessage: error.toString()
    })
  })

  if (!response) { return }

  if (response.data.success === true) {
    copyText(response.data.files[0].url)
    notifications.update(notification, {
      type: 'basic',
      message: 'Upload completed.',
      contextMessage: response.data.files[0].url
    })
    notifications.clear(notification, 5000)
  } else {
    notifications.update(notification, {
      type: 'basic',
      message: 'An error occurred.',
      contextMessage: response.data.description
    })
  }
}

const mimetypes = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
  'image/x-icon': '.ico',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'audio/mp4': '.mp4a',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'audio/x-aac': '.aac',
  'audio/x-wav': '.wav'
}

const fileExt = mimetype => {
  return mimetypes[mimetype] || '.' + mimetype.split('/')[1]
}

const copyText = text => {
  // Firefox...
  browser.tabs.executeScript({
    code: `
      (function () {
        const input = document.createElement('textarea')
        document.body.appendChild(input)
        input.value = ${JSON.stringify(text)}
        input.select()
        document.execCommand('Copy')
        input.remove()
      })()
    `
  })
}

// http://stackoverflow.com/a/16245768
const b64toBlob = (b64Data, contentType, sliceSize) => {
  contentType = contentType || ''
  sliceSize = sliceSize || 512

  const byteCharacters = atob(b64Data)
  const byteArrays = []

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize)

    const byteNumbers = new Array(slice.length)
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i)
    }

    const byteArray = new Uint8Array(byteNumbers)

    byteArrays.push(byteArray)
  }

  const blob = new Blob(byteArrays, {type: contentType})
  return blob
}

var notifications = {
  caches: new Map(),
  compatibility (_options) {
    // Sad...
    const options = {}
    Object.assign(options, _options)

    if (options.progress !== undefined) {
      options.type = 'basic'
      options.message = `${options.message} (${options.progress}%)`
      delete options.progress
    }

    if (options.type !== 'basic') {
      options.type = 'basic'
    }

    if (options.contextMessage) {
      options.message = `${options.message}\n${options.contextMessage}`
      delete options.contextMessage
    }

    return options
  },
  create (type, text, altText, sticky, progress) {
    const notificationContent = {
      type,
      title,
      message: text,
      iconUrl: 'logo-128x128.png'
    }

    if (altText) {
      notificationContent.contextMessage = altText
    }

    progress = parseInt(progress)
    if (!isNaN(progress)) {
      notificationContent.progress = progress
    }

    const id = 'lolisafe_' + Date.now()
    notifications.caches.set(id, notificationContent)
    browser.notifications.create(id, notifications.compatibility(notificationContent))
    return id
  },
  update (id, options) {
    // Firefox does not have notifications.update()...
    const properties = ['title', 'message', 'type', 'iconUrl']

    if (!properties.every(property => options[property] !== undefined)) {
      const cache = notifications.caches.get(id)

      if (!cache) { return }

      properties.map(property => {
        if (options[property] === undefined) {
          options[property] = cache[property]
        }
      })
    }

    notifications.caches.set(id, options)
    browser.notifications.create(id, notifications.compatibility(options))
  },
  clear (id, timeout) {
    setTimeout(async () => {
      await browser.notifications.clear(id)
      notifications.caches.delete(id)
    }, timeout || 0)
  }
}

browser.notifications.onClicked.addListener(id => {
  browser.notifications.clear(id)
})
