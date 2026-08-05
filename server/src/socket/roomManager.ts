interface Room {
  id: string;
  hostSocketId: string;
  clients: Set<string>;
}

class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private socketToRoom: Map<string, string> = new Map();

  createRoom(roomId: string, hostSocketId: string) {
    this.rooms.set(roomId, {
      id: roomId,
      hostSocketId,
      clients: new Set(),
    });
    this.socketToRoom.set(hostSocketId, roomId);
  }

  joinRoom(roomId: string, clientSocketId: string): boolean {
    const room = this.rooms.get(roomId);
    if (room) {
      room.clients.add(clientSocketId);
      this.socketToRoom.set(clientSocketId, roomId);
      return true;
    }
    return false;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  getRoomBySocketId(socketId: string): Room | undefined {
    const roomId = this.socketToRoom.get(socketId);
    if (roomId) {
      return this.rooms.get(roomId);
    }
    return undefined;
  }

  removeSocket(socketId: string): { roomId: string; isHost: boolean } | null {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return null;

    const room = this.rooms.get(roomId);
    if (!room) return null;

    let isHost = false;
    this.socketToRoom.delete(socketId);

    if (room.hostSocketId === socketId) {
      isHost = true;
      // If host disconnects, we might want to clean up the room or notify clients
      room.clients.forEach((clientId) => {
        this.socketToRoom.delete(clientId);
      });
      this.rooms.delete(roomId);
    } else {
      room.clients.delete(socketId);
      // Clean up empty rooms (though if host is still there, maybe don't delete? We'll delete if host leaves).
    }

    return { roomId, isHost };
  }
}

export const roomManager = new RoomManager();
