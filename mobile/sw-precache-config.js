module.exports = {
    staticFileGlobs: [
      '*.html',
      'cordova.js',
      '*.ico',
      '*.png',
      'js/*.js',
      'js/lib/*.js',
      'img/*.*',
      'css/*.css'
    ],
    ignoreUrlParametersMatching: [/./],
    directoryIndex: false,
    dontCacheBustUrlsMatching: /cloudflare|\/lib\//
};