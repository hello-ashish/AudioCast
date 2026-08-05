import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import { roomManager } from "./socket/roomManager";

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // In production, we'd restrict this
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 3001;

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Host creates a room
  socket.on("create-room", ({ roomId }) => {
    roomManager.createRoom(roomId, socket.id);
    socket.join(roomId);
    console.log(`Host ${socket.id} created room ${roomId}`);
    socket.emit("room-created", { roomId });
  });

  // Client joins a room
  socket.on("join-room", ({ roomId }) => {
    const success = roomManager.joinRoom(roomId, socket.id);
    if (success) {
      socket.join(roomId);
      console.log(`Client ${socket.id} joined room ${roomId}`);
      
      const room = roomManager.getRoom(roomId);
      if (room) {
        // Notify host that a client joined, so host can initiate WebRTC offer
        io.to(room.hostSocketId).emit("client-joined", { clientId: socket.id });
      }
    } else {
      socket.emit("room-error", { message: "Room not found or invalid" });
    }
  });

  // Host sends an offer to a specific client
  socket.on("offer", ({ clientId, offer }) => {
    console.log(`Sending offer to ${clientId}`);
    io.to(clientId).emit("offer", { hostId: socket.id, offer });
  });

  // Client sends an answer back to the host
  socket.on("answer", ({ hostId, answer }) => {
    console.log(`Sending answer to host ${hostId}`);
    io.to(hostId).emit("answer", { clientId: socket.id, answer });
  });

  // Relay ICE candidates
  socket.on("ice-candidate", ({ targetId, candidate }) => {
    console.log(`Relaying ICE candidate to ${targetId}`);
    io.to(targetId).emit("ice-candidate", { senderId: socket.id, candidate });
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log(`Socket disconnected: ${socket.id}`);
    const result = roomManager.removeSocket(socket.id);
    if (result) {
      const { roomId, isHost } = result;
      if (isHost) {
        // Notify remaining clients that the host has left
        io.to(roomId).emit("host-disconnected");
        console.log(`Host left room ${roomId}, cleaning up`);
      } else {
        // Notify host that a client left
        const room = roomManager.getRoom(roomId);
        if (room) {
          io.to(room.hostSocketId).emit("client-disconnected", { clientId: socket.id });
        }
      }
    }
  });
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
