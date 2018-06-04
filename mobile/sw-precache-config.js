module.exports = {
    staticFileGlobs: [
      '*.html',
      'cordova.js',
      '*.ico',
      '*.png',
      'js/*.js',
      'js/lib/*.js',
      'img/*.*',
      'css/*.css',
      'css/images/*.*'
    ],
    ignoreUrlParametersMatching: [/./],
    directoryIndex: false,
    dontCacheBustUrlsMatching: /cloudflare|\/lib\//,
    runtimeCaching: [{
        urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\//,
        handler: 'cacheFirst'
    }, {
        urlPattern: /^https:\/\/trello-avatars\.s3\.amazonaws\.com\//,
        handler: 'networkFirst'
    }]
};