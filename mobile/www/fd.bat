chcp 65001
del index2.html
\bin\sed "s/css\/jquery\.mobile\.icons\.min\.css/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jquery-mobile\/1\.4\.5\/jquery\.mobile\.icons\.min\.css/; s/css\/jquery\.mobile\.structure-1\.4\.5\.min\.css/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jquery-mobile\/1\.4\.5\/jquery\.mobile\.structure\.min\.css/; s/js\/lib\/jquery\.js/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jquery\/1\.7\.1\/jquery\.min\.js/; s/js\/lib\/jquery\.mobile-1\.4\.5\.min\.js/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jquery-mobile\/1\.4\.5\/jquery\.mobile\.min\.js/; s/js\/lib\/fastclick.js/https:\/\/cdnjs.cloudflare.com\/ajax\/libs\/fastclick\/1.0.6\/fastclick.min.js/" index.html > index2.html
del index.tmp
rename index.html index.tmp
rename index2.html index.html
echo //empty  > cordova.js
call sw-precache --config=..\sw-precache-config.js
del sw.tmp
\bin\sed "s/css\/jquery\.mobile\.icons\.min\.css/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jquery-mobile\/1\.4\.5\/jquery\.mobile\.icons\.min\.css/; s/css\/jquery\.mobile\.structure-1\.4\.5\.min\.css/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jquery-mobile\/1\.4\.5\/jquery\.mobile\.structure\.min\.css/; s/js\/lib\/jquery\.js/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jquery\/1\.7\.1\/jquery\.min\.js/; s/js\/lib\/jquery\.mobile-1\.4\.5\.min\.js/https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/jquery-mobile\/1\.4\.5\/jquery\.mobile\.min\.js/; s/js\/lib\/fastclick.js/https:\/\/cdnjs.cloudflare.com\/ajax\/libs\/fastclick\/1.0.6\/fastclick.min.js/" service-worker.js > sw.tmp
del service-worker.js
cd ..
call gulp

cd www
call firebase deploy
del index.html
del service-worker.js
rename index.tmp index.html
del cordova.js
