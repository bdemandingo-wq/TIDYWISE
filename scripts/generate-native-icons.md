# Generate Native App Icons (iOS/Android)

Apple rejected the build because the app shipped with placeholder icons.

This project uses **Capacitor** and `@capacitor/assets` to generate all required icon sizes from one source image.

## Source icon

- `src/assets/app-icon-1024.png` (1024×1024)

## Run

After pulling latest code and installing dependencies:

```bash
npm install

# Generate iOS + Android icons/splashes into the native projects
npx capacitor-assets generate --assetPath src/assets/app-icon-1024.png

# Then sync native projects
npx cap sync
```

## Verify in Xcode

1. `npx cap open ios`
2. In Xcode: **App Icons and Launch Images** → confirm the icon set is populated with your TidyWise icon.

## Notes

- Run the `capacitor-assets generate` step anytime you change `app-icon-1024.png`.
- This fixes App Store Review Guideline **2.3.8 (Accurate Metadata)** for placeholder icons.
