# WebXR Spatial Ruler 📏

A production-ready WebXR spatial measurement tool built with React, Three.js, and React Three Fiber. 

Unlike native iOS/Android AR apps, this application runs entirely in the mobile browser. It utilizes the WebXR Device API to interface directly with smartphone LiDAR and depth sensors for precise spatial mapping and physical-world measurements.

![AR Demo](link-to-your-gif-here.gif)

## 🛠 Tech Stack
* **Framework:** React 18 + Vite + TypeScript
* **3D Engine:** Three.js
* **Spatial/AR Integration:** `@react-three/xr` (WebXR)
* **3D React Abstraction:** `@react-three/fiber` & `@react-three/drei`
* **Styling:** Tailwind CSS + Radix UI (Glassmorphic HUD)

## ✨ Core Features
* **Real-time Spatial Hit-Testing:** Maps physical surfaces and dynamically aligns 3D targeting reticles to floor and furniture geometry.
* **Live Measurement Preview:** Dynamically calculates and renders Euclidean distance via a glowing 3D tube geometry *before* the user locks in the final anchor.
* **Dual-Unit High-Performance UI:** Bypasses asynchronous React rendering lag by syncing spatial coordinates to refs, driving a high-contrast 3D text overlay (cm & inches) that automatically rotates to face the user's camera.
* **Glancing Angle Compensation:** Utilizes 3D spatial markers to allow users to walk around objects for accurate depth plotting, rather than relying on standard 2D screen-space tapping.

## 🧠 Technical Challenges Overcome
**1. The WebXR Stale Closure Problem:**
React's asynchronous state updates natively conflict with high-frequency WebXR frame loops (running at 60-120hz). To prevent the frame loop from reading stale state during measurement calculations, I implemented a synchronized `useRef` pattern. This allows the physical 3D text and tube geometries to update instantaneously without triggering full React DOM re-renders.

**2. Matrix Auto-Update Conflicts:**
To prevent WebXR from overwriting the targeting reticle's local animations, the structural `hitMatrix` is applied to an outer `<group>` with `matrixAutoUpdate={false}`, while the spinning animation and 90-degree flat floor rotation is applied to an isolated inner `<mesh>`.

## 🚀 How to Run Locally
*Note: WebXR requires a secure `https` context and an AR-compatible mobile browser.*
1. Run `npm install`
2. Run `npm run dev`
3. Expose the local port via an HTTPS tunnel (e.g., `npx ngrok http 5173`)
4. Open the tunnel URL on a WebXR-compatible mobile browser (Chrome for Android, or Mozilla WebXR Viewer for iOS).
