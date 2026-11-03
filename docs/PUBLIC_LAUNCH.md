# VenueLoom public website launch

The public homepage at / must remain accessible without authentication. The CRM and booking application is restricted to /dashboard, /integrations, and authenticated API routes.

## First deployment gates

1. Create a dedicated Netlify site for the public-facing app and connect AstroTat808/venueloom.com.
2. Confirm the build command and monorepo package installation in Netlify; do not add live production database or Resend secrets to a public-only build.
3. Keep beta operational routes behind authentication and disable background workers until separately approved.
4. Confirm DNS for venueloom.com and www, HTTPS, redirects, and security headers.
5. Verify homepage layout at mobile/tablet/desktop, navigation, signup CTA, metadata, sitemap, robots, favicon, performance and accessibility.
6. Confirm contact/lead collection has a working endpoint or remove nonfunctional CTAs.
7. Verify the deployment preview, production build, rollback path and monitoring before changing DNS.

This checklist is not a claim that the site is deployed.
