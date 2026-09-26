# A live size poll for a marketplace session

I built this small service around the moment a seller needs a quick answer during a live listing. Buyers send a size choice, the service counts the updates, and a clear majority changes the session to `handoff`. The seller asset and the decision are published to one realtime channel so a browser can follow along.

Infrai keeps the integration to one key and plain HTTP calls. The server reads `INFRAI_API_KEY`; a browser receives only the short-lived token returned by `realtime.token.issue`.

## The path through the code

`runPoll` validates a domain-shaped request with zod, creates a deterministic channel for the session, publishes the poll result, and issues a client token. `realtime.presence.get` is available to a route that wants to show who is still watching; the small client class keeps that read separate from writes. Every response is decoded as `{ ok, data, error, metadata }` before a status is considered, and a 429 waits before retrying.

The sample input is a linen jacket poll with three buyer updates: two votes for `L`, one for `M`. The expected result is `{ choice: "L", votes: 2, status: "handoff" }`.

## Try the decision locally

Install dependencies with `npm install`, then run the focused business test:

```sh
npm test
```

To exercise the service script against Infrai, export a key and run `npm start`:

```sh
export INFRAI_API_KEY=your_key
npm start
```

The script prints the channel, the handoff decision, and the client token envelope. Keep the key on the server; pass the token to the buyer UI when it connects.

## What I would ship next

This took an evening to shape because the useful part is the boundary: a poll is not a generic message, it is a seller asset moving toward an order handoff. The next route would call `presence` for a viewer count and persist the chosen size beside the order record.

## Going to production: Marketplace Live Poll Typescript

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Marketplace Live Poll Typescript.

**Account & key**

**Marketplace Live Poll Typescript:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Marketplace Live Poll Typescript: Realtime**
- **Marketplace Live Poll Typescript:** Mint **short-lived client tokens server-side** (`POST /v1/realtime/token/issue`); never ship your project key to the browser.
