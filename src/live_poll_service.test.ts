import { strict as assert } from "node:assert";
import { decideHandoff } from "./live_poll_service.js";

const result = decideHandoff([{ buyerId: "a", choice: "L" }, { buyerId: "b", choice: "L" }, { buyerId: "c", choice: "M" }], ["M", "L"]);
assert.deepEqual(result, { choice: "L", votes: 2, status: "handoff" });
console.log("handoff decision test passed");
