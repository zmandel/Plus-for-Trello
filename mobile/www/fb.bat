\bin\sed "s/\"css\/jquery\.mobile\.icons\.min\.css\"/\"https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jquery-mobile\/1\.4\.5\/jquery\.mobile\.icons\.min\.css\"/; s/\"css\/jquery\.mobile\.structure-1\.4\.5\.min\.css\"/\"https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jquery-mobile\/1\.4\.5\/jquery\.mobile\.structure\.min\.css\"/; s/\"js\/lib\/jquery\.js\"/\"https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jquery\/1\.7\.1\/jquery\.min\.js\"/; s/\"js\/lib\/jquery\.mobile-1\.4\.5\.min\.js\"/\"https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jquery-mobile\/1\.4\.5\/jquery\.mobile\.min\.js\"/" index.html > index2.html
del index.tmp
rename index.html index.tmp
rename index2.html index.html
echo //empty  > cordova.js
call firebase deploy
del index.html
rename index.tmp index.html
del cordova.js
