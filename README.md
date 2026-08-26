# Tranzora Transport Business Management Platform

A responsive Next.js implementation of all 120 application screens visible across the 30 supplied reference boards.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The home page is a complete screen directory; every card links to its own statically generated route.

## Production verification

```bash
npm run build
npm start
```

## Structure

- `app/page.tsx` — screen catalog and navigation hub
- `app/screens/[slug]/page.tsx` — static route generator for all 120 pages
- `components/AppScreen.tsx` — reusable interactive layouts and UI components
- `lib/screens.ts` — canonical screen/route registry
- `app/globals.css` — responsive design system
- `Tranzora — Desktop/` — the original 30 reference boards
