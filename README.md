Plus-for-Trello
===============

Plus for Trello - Chrome extension and Android app<br>
Add from the [Chrome store](https://chrome.google.com/webstore/detail/plus-for-trello-time-trac/gjjpophepkbhejnglcmkdnncmaanojkf?hl=en) and [Android Play](https://play.google.com/store/apps/details?id=com.zigmandel.plusfortrello) <br>
[Master branch](https://github.com/zmandel/Plus-for-Trello) at https://github.com/zmandel/Plus-for-Trello

[Donate] (https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=FH223PYNLWZQU&lc=US&item_name=Plus%20for%20Trello&currency_code=USD&bn=PP%2dDonationsBF%3abtn_donate_SM%2egif%3aNonHosted)

NOTE: We have pendign work to upgrade the build process to gulp. Until then, the code here is not the latest one, both the Chrome extension and mobile app. Webapp code is the same as the mobile app

Workarround
Chrome extension: Use [Chrome extension source code viewer](https://chrome.google.com/webstore/detail/chrome-extension-source-v/jifpbeccnghkjeaalbbjmodiffmgedin)

Mobile app: debug the mobile app from https://app.plusfortrello.com to view or download the latest source.

Coding best practices
We plan to eventually move to typescript. Keep in mind that:

1. This was my first nontrivial javascript chrome extension (2012) and I was just learning javascript then.

1.5. Dont worry, I come from a strong C++ background and "big software company" standards for coding, testing and reviewing. Im also an expert in markdown list numbering.

2. As a point to really learn javascript, sometimes I did not use libraries or advanced time-saving features. Or maybe Chrome didnt support it back then.

3. These has changed over time as I became more familiar with more advanced javascript (including lately service workers) thus you will find a mix.

4. Chrome extensions as content scripts are special, sometimes you must overuse things like css "!important" because of existing trello styles or future-proofing against Trello changes.

5. Trello, over time, has changed quite a lot their page. Because they release changes to users over time we must support various trello DOM layouts while Trello does the transition. Those checks usually stay in place in case Trello changes back something. So something as simple as finding certain Trello DOM element might seem convoluted in the code.

6. The Plus "trello sync" algorithm is quite complex. It evolved as we added more features and also as Trello finalized their API. Initially we didnt use the Trello API (was not there) and we extracted some details from the interface. Some of those remain and are used for certain scenarios (for example the user has turned off sync)

7. Priority was always given to features with the biggest kick in the shortest time. Sometimes design was sacrificed. Sometimes code ugliness prevailed over giving something useful to users. Sorry :)

Enjoy!
