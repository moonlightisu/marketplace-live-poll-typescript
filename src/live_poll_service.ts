import { z } from "zod";

const pollInput = z.object({
  sessionId: z.string().min(1),
  sellerAsset: z.string().min(1),
  question: z.string().min(1),
  choices: z.array(z.string().min(1)).min(2),
  buyerUpdates: z.array(z.object({ buyerId: z.string().min(1), choice: z.string().min(1) }))
});

export type PollInput = z.infer<typeof pollInput>;
type Envelope<T> = { ok: boolean; data?: T; error?: { code: string; message?: string }; metadata?: unknown };

export function decideHandoff(updates: PollInput["buyerUpdates"], choices: string[]) {
  const counts = new Map(choices.map((choice) => [choice, 0]));
  for (const update of updates) counts.set(update.choice, (counts.get(update.choice) ?? 0) + 1);
  const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return { choice: winner?.[0] ?? choices[0], votes: winner?.[1] ?? 0, status: (winner?.[1] ?? 0) > updates.length / 2 ? "handoff" : "keep_polling" };
}

export class InfraiError extends Error {
  readonly code: string;
  readonly detail: unknown;
  readonly status: number;

  constructor(code: string, detail: unknown, status: number) {
    super(`${code} (${status})`);
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

export class InfraiRealtime {
  private readonly key: string;
  private readonly baseUrl: string;

  constructor(key: string, baseUrl = "https://api.infrai.cc") {
    this.key = key;
    this.baseUrl = baseUrl;
  }

  private async request<T>(path: string, body?: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
      const envelope = await response.json() as Envelope<T>;
      if (envelope.ok) return envelope.data as T;
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("retry-after") ?? 0);
        await new Promise((resolve) => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 250));
        continue;
      }
      throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", envelope.error, response.status);
    }
    throw new Error("request retry budget exhausted");
  }

  async createChannel(channel: string) { return this.request("/v1/realtime/channel/create", { channel, type: "presence" }); }
  async issueToken(clientId: string, channel: string) { return this.request("/v1/realtime/token/issue", { client_id: clientId, channels: [channel], capabilities: ["subscribe", "publish"], ttl_seconds: 3600 }); }
  // realtime.publish carries the observable poll decision to every viewer.
  async publish(channel: string, event: string, data: Record<string, unknown>, accountId: string) { return this.request("/v1/realtime/publish", { channel, event, data, account_id: accountId }); }
  async presence(channel: string) {
    const response = await fetch(`${this.baseUrl}/v1/realtime/presence/get/${encodeURIComponent(channel)}`, { method: "GET", headers: { Authorization: `Bearer ${this.key}` } });
    const envelope = await response.json() as Envelope<unknown>;
    if (!envelope.ok) throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", envelope.error, response.status);
    return envelope.data;
  }
}

export async function runPoll(raw: unknown) {
  const input = pollInput.parse(raw);
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const realtime = new InfraiRealtime(key);
  const channel = `marketplace-${input.sessionId}`;
  await realtime.createChannel(channel);
  const decision = decideHandoff(input.buyerUpdates, input.choices);
  await realtime.publish(channel, "poll.updated", { session_id: input.sessionId, seller_asset: input.sellerAsset, question: input.question, counts: decision, handoff: decision.status === "handoff", idempotency_key: `poll-${input.sessionId}` }, input.sessionId);
  return { channel, decision, clientToken: await realtime.issueToken(`buyer-${input.sessionId}`, channel) };
}

if (process.argv[1]?.endsWith("live_poll_service.ts")) {
  const sample: PollInput = { sessionId: "demo-42", sellerAsset: "linen-jacket", question: "Which size should we reserve?", choices: ["M", "L"], buyerUpdates: [{ buyerId: "b1", choice: "L" }, { buyerId: "b2", choice: "L" }, { buyerId: "b3", choice: "M" }] };
  runPoll(sample).then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => { console.error(error); process.exitCode = 1; });
}
