# Sourcely site: setup (about 20 minutes)

1. Create a new Google Sheet named "Sourcely Orders". Extensions > Apps Script. Paste all of `sourcely-backend.gs`, save.
2. Run `setup()` once (approve the permission prompts). It creates the Orders, Reports, Sessions and Codes tabs.
3. Project Settings > Script properties: add `ADMIN_PASSWORD` (long, unique), `SITE_URL` (your live site URL, no trailing slash), optional `PILOT_CAP` (default 10) and `NOTIFY_EMAIL`.
4. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone. Copy the web app URL.
5. Edit `site/assets/config.js`: `window.SLY_API = 'PASTE_URL_HERE';`
6. Upload the `site` folder contents to a new GitHub repo, import it in Vercel (no build step, output = root). Turn off Vercel Authentication if the preview is private.
7. Replace `https://YOUR-DOMAIN.com` and `hello@YOUR-DOMAIN.com`: rerun `python3 gen/build.py https://yourdomain.com you@yourdomain.com` and re-upload (or find/replace in site/).
8. Visit /admin/, sign in, place a test order on /free-pilot/, publish a test report.

After changing the Apps Script code: Deploy > Manage deployments > edit > New version (the URL stays the same).
