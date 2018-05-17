Plus-for-Trello
===============

Plus for Trello - Chrome extension and Android app<br>
Add from the [Chrome store](https://chrome.google.com/webstore/detail/plus-for-trello-time-trac/gjjpophepkbhejnglcmkdnncmaanojkf?hl=en) and [Android Play](https://play.google.com/store/apps/details?id=com.zigmandel.plusfortrello) <br>
[Master branch](https://github.com/zmandel/Plus-for-Trello) at https://github.com/zmandel/Plus-for-Trello

Webapp code is the same as the mobile app

The code here may not be the latest one. To view the latest code, see:
Chrome extension: Use [Chrome extension source code viewer](https://chrome.google.com/webstore/detail/chrome-extension-source-v/jifpbeccnghkjeaalbbjmodiffmgedin)

Mobile app: https://app.plusfortrello.com

Coding best practices
We plan to eventually move to typescript. Keep in mind that:

1. This was my first nontrivial javascript chrome extension (2012) and I was just learning javascript then.

2. As a point to learn javascript, sometimes I did not use libraries or advanced time-saving features. Or maybe Chrome didnt support them at the time, since a Chrome extension is not a regular webapp.

3. That has changed over time as I became more familiar with more advanced javascript thus you will find a mix.

4. Chrome extensions as content scripts are special, sometimes you must overuse things like css "!important" because of existing trello styles or future-proofing against Trello changes.

5. Trello, over time, has changed quite a lot their page. Because they release changes to users over time we must support various trello DOM layouts while Trello does the transition. Thus something as simple as finding certain Trello DOM element might seem convoluted in the code.

6. The Plus "trello sync" algorithm is quite complex. It evolved as we added more features and also as Trello finalized their API. Initially we didnt use the Trello API (did not exist) and we extracted some details from the interface. Some of those remain and are used for certain scenarios (for example the user has turned off sync)

7. Priority is given to features with the biggest kick in the shortest time, as we are a very small team.

Enjoy!
