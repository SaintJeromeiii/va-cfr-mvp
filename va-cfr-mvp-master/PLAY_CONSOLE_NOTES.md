# Google Play Console Notes

## Important

Google Play Console is for Android app packages, not a plain website.

This project is currently a web app served by Express:

- [server.js](/Users/jeromeanderson/va-cfr-mvp/va-cfr-mvp-master/server.js)
- [public/index.html](/Users/jeromeanderson/va-cfr-mvp/va-cfr-mvp-master/public/index.html)

That means you cannot upload the current repo directly to Google Play for testers.

## If you want testers now

Use a normal web deployment first:

1. Deploy the app to a stable public URL.
2. Share that URL with testers.
3. Use the checklist in [TESTING_CHECKLIST.md](/Users/jeromeanderson/va-cfr-mvp/va-cfr-mvp-master/TESTING_CHECKLIST.md).
4. Collect feedback before wrapping the app for Android.

## If you want Google Play testers

You need an Android shell around the web app first. The cleanest path is usually one of these:

1. Trusted Web Activity (TWA)
   Best if you want the Play Store app to stay mostly web-based.

2. Capacitor
   Best if you want a hybrid app shell and may later add mobile-specific features.

3. WebView wrapper
   Fastest but usually the least polished long-term option.

## Recommended Next Step

If your goal is to get real testers quickly:

1. Deploy the web app publicly.
2. Run a web testing round.
3. Fix the top tester issues.
4. Then package for Android if Play Store distribution is still important.

## Current Packaging Readiness

This repository now includes the core prep work for a web-to-Android path:

- Progressive Web App metadata in [public/manifest.webmanifest](/Users/jeromeanderson/va-cfr-mvp/va-cfr-mvp-master/public/manifest.webmanifest)
- A service worker in [public/sw.js](/Users/jeromeanderson/va-cfr-mvp/va-cfr-mvp-master/public/sw.js)
- An offline fallback page in [public/offline.html](/Users/jeromeanderson/va-cfr-mvp/va-cfr-mvp-master/public/offline.html)
- Capacitor config in [capacitor.config.json](/Users/jeromeanderson/va-cfr-mvp/va-cfr-mvp-master/capacitor.config.json)
- A generated Android shell in [android/](/Users/jeromeanderson/va-cfr-mvp/va-cfr-mvp-master/android)

The remaining Android steps are Android Studio review, app signing, and building a release/testing artifact.

### Expected Commands

```bash
npm run cap:sync
npm run cap:open:android
```

## Play Console Testing Tracks

Once you have an Android build, the best rollout order is:

1. Internal testing
2. Closed testing
3. Open testing

As of April 29, 2026, Google’s official Play Console testing guidance is documented here:

- [Set up an open, closed, or internal test](https://support.google.com/googleplay/android-developer/answer/9845334)
