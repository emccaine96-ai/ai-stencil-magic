/**
 * Lightweight CRDT-ish realtime collab over Supabase Realtime broadcast.
 * - Append-only stroke deltas (each peer broadcasts new VectorStrokes).
 * - Peer presence (cursor + color).
 * Production-grade Yjs swap-in is one adapter file away; this gets us shipping
 * with zero extra deps.
 */
import { supabase } from "@/integrations/supabase/client";
import type { VectorStroke } from "./stroke-vector";

export type CollabPeer = { id: string; name: string; color: string; x: number; y: number };

export type CollabHandlers = {
  onStroke?: (stroke: VectorStroke, from: string) => void;
  onPresence?: (peers: CollabPeer[]) => void;
};

export class CollabSession {
  private channel: ReturnType<typeof supabase.channel> | null = null;
  private me: CollabPeer;

  constructor(
    public roomId: string,
    me: Omit<CollabPeer, "x" | "y">,
    private handlers: CollabHandlers = {},
  ) {
    this.me = { ...me, x: 0, y: 0 };
  }

  async join() {
    const ch = supabase.channel(`studio:${this.roomId}`, {
      config: { presence: { key: this.me.id } },
    });
    this.channel = ch;
    ch.on("broadcast", { event: "stroke" }, (msg) => {
      const { stroke, from } = msg.payload as { stroke: VectorStroke; from: string };
      if (from === this.me.id) return;
      this.handlers.onStroke?.(stroke, from);
    });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState() as Record<string, CollabPeer[]>;
      const peers: CollabPeer[] = [];
      for (const k of Object.keys(state)) for (const p of state[k]) peers.push(p);
      this.handlers.onPresence?.(peers);
    });
    await ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") await ch.track(this.me);
    });
  }

  async leave() {
    if (!this.channel) return;
    await this.channel.unsubscribe();
    this.channel = null;
  }

  sendStroke(stroke: VectorStroke) {
    this.channel?.send({
      type: "broadcast",
      event: "stroke",
      payload: { stroke, from: this.me.id },
    });
  }

  updateCursor(x: number, y: number) {
    this.me = { ...this.me, x, y };
    this.channel?.track(this.me);
  }
}
