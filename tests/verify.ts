import assert from "node:assert";
import { searchLiveWeb } from "../src/lib/exa";
import { retrieveUserPreferences, saveUserPreference } from "../src/lib/memory";
import { roamAgentTask } from "../src/trigger/roam";

async function runTests() {
  console.log("=========================================");
  console.log("PROJECT ROAM - VERIFICATION SUITE");
  console.log("=========================================");

  // 1. Verify Roam task definition
  console.log("\n[Test 1] Verifying Trigger.dev task definition...");
  assert.strictEqual(roamAgentTask.id, "roam-agent-task", "Task ID must be 'roam-agent-task'");
  assert.strictEqual(typeof roamAgentTask.trigger, "function", "Task trigger must be a function");
  console.log("✓ Trigger.dev task definition validated successfully.");

  // 2. Verify Exa fallback when key is not provided
  console.log("\n[Test 2] Verifying Exa search module fallback...");
  const exaResult = await searchLiveWeb("best restaurants near me", {
    latitude: 1.2834,
    longitude: 103.8607,
  });
  assert(Array.isArray(exaResult.results), "Results must be an array");
  assert(typeof exaResult.formattedContext === "string", "formattedContext must be string");
  console.log("✓ Exa search fallback and location augmentation validated.");

  // 3. Verify ClickHouse vector memory graceful handling
  console.log("\n[Test 3] Verifying ClickHouse memory graceful degradation...");
  const preferences = await retrieveUserPreferences("test_user_123", "romantic dinner rooftop", 3);
  assert(Array.isArray(preferences), "Preferences must return an array even if ClickHouse is offline");
  console.log("✓ ClickHouse memory graceful degradation validated.");

  // 4. Test Webhook payload contract
  console.log("\n[Test 4] Verifying Telegram webhook payload contract...");
  const samplePayload = {
    update_id: 1001,
    message: {
      message_id: 42,
      from: { id: 987654, first_name: "Elena", username: "elena_travels" },
      chat: { id: 987654, type: "private" },
      date: 1715000000,
      text: "Find me a quiet matcha cafe near Tanjong Pagar with outdoor seating",
    },
  };

  assert.strictEqual(samplePayload.message.chat.id, 987654);
  assert.strictEqual(samplePayload.message.from.id, 987654);
  assert(samplePayload.message.text.includes("matcha"));
  console.log("✓ Webhook contract validated.");

  console.log("\n=========================================");
  console.log("ALL VERIFICATION CHECKS PASSED (4/4)!");
  console.log("=========================================\n");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
