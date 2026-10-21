# Install CIDA POS on Android

1. Open the HTTPS POS website in Chrome on the Android POS machine.
2. Tap **Install POS app** (`ติดตั้งแอป POS`) on the login page or in the POS tools, then confirm Chrome's installation prompt.
3. If the prompt is unavailable, use Chrome's **⋮ → Add to Home screen → Install**.
4. Open **CIDA POS** from the home-screen icon. It launches `/pos` in fullscreen; log in normally if the session has expired.

The app uses the same accounts, saved terminal selection, printer pairing and central daily reports as the website. It still requires a network connection to record sales. Installation is a browser-managed web app, with no separate APK or app-store download. Device/browser support determines whether fullscreen or standalone display is used.

The manifest includes regular 192/512 px PNG icons and a padded maskable icon for Android launchers. It requests fullscreen with standalone fallback and allows login and admin pages within the installed app's scope. The install component handles Chrome's native prompt, dismissal, errors and installed display modes. This change adds no service-worker caching of financial data.

See the [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps) and [Chrome's manifest guidance](https://web.dev/articles/add-manifest) for the installation model.
