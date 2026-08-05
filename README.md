# AudioSync

AudioSync is a modern, full-stack web application that allows you to turn any mobile device (or another computer) into a wireless speaker for a browser tab.

## Features

- **Share Tab Audio**: Capture high-quality audio from any browser tab (YouTube, Spotify Web, etc.) using `getDisplayMedia`.
- **Low Latency**: Uses WebRTC for near real-time audio streaming.
- **Easy Connection**: Connect easily using a generated Room ID or scan a QR Code.
- **Multiple Listeners**: Broadcast the same audio to multiple devices seamlessly.
- **Beautiful UI**: Modern, dark-mode design with fluid animations and premium glassmorphism effects.

## Tech Stack

- **Frontend**: React 19, Vite, TypeScript, Tailwind CSS v4, Socket.IO Client.
- **Backend**: Node.js, Express, Socket.IO.
- **Networking**: WebRTC (RTCPeerConnection).

## Setup Instructions

### 1. Backend Server

Navigate to the `server` directory and install dependencies:

```bash
cd server
npm install
```

Start the development server:

```bash
npm run dev
```
*(The backend runs on http://localhost:3001 by default)*

### 2. Frontend Client

Navigate to the `client` directory and install dependencies:

```bash
cd client
npm install
```

Start the frontend Vite server:

```bash
npm run dev
```

### 3. Usage & Testing

1. Open the app on your laptop.
2. Click **Start Streaming**.
3. When prompted, select a browser tab that is playing audio, ensure **Share tab audio** is checked, and accept.
4. A Room ID and QR Code will be generated.
5. Join using another browser window or scan the QR Code. (Note: For mobile testing over a local network, WebRTC requires secure contexts (HTTPS) for `getUserMedia` / `getDisplayMedia` to work correctly on some devices, but standard playing `Audio` on the receiver side usually works over HTTP on local network if the host is serving it correctly).

## Folder Structure

- `client/` - React frontend
  - `src/components/` - Reusable UI components
  - `src/pages/` - Core pages (Home, Host, Join)
  - `src/context/` - Socket.IO context for global state
  - `src/utils/` - WebRTC config
- `server/` - Node.js Express backend
  - `src/index.ts` - Express and Socket.IO server
  - `src/socket/roomManager.ts` - Logic for handling WebRTC rooms

## WebRTC Signaling Flow

1. **Host** creates a room and waits for connections.
2. **Client** joins the room.
3. Server notifies Host via `client-joined`.
4. Host creates an `RTCPeerConnection`, adds the audio track, creates an Offer, and sends it to Client via Socket.IO.
5. Client receives the Offer, creates an `RTCPeerConnection`, sets remote description, creates an Answer, and sends it to Host.
6. ICE candidates are gathered on both sides and exchanged via Socket.IO.
7. Once the connection is established, the `ontrack` event fires on the Client, and the audio stream begins playing.
