module.exports = {
    staticFileGlobs: [
      '*.html',
      'cordova.js',
      '*.ico',
      '*.png',
      'js/!(intellisense).js',
      'js/lib/*.js',
      'img/*.*',
      'css/*.css',
      'css/images/*.*',
      'power-up/**'
    ],
    ignoreUrlParametersMatching: [/./],
    directoryIndex: false,
    navigateFallback: "/index.html",
    navigateFallbackWhitelist: [/^\/$/],
    dontCacheBustUrlsMatching: /cloudflare|\/lib\/|-v[0-9]/,
    runtimeCaching: [{
        urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\//,
        handler: 'cacheFirst'
    }, {
        urlPattern: /^https:\/\/trello-avatars\.s3\.amazonaws\.com\//,
        handler: 'networkFirst'
    }]
};