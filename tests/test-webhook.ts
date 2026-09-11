import assert from "node:assert";
import { POST, GET } from "../app/api/telegram/route";

async function testWebhook() {
  console.log("=========================================");
  console.log("TESTING TELEGRAM WEBHOOK ROUTE");
  console.log("=========================================");

  // 1. Test GET Health Check
  console.log("\n[Test 1] Testing GET /api/telegram health check...");
  const getRes = await GET();
  assert.strictEqual(getRes.status, 200);
  const getData = await getRes.json();
  assert.strictEqual(getData.status, "online");
  console.log("✓ GET health check returned 200 OK with status: online");

  // 2. Test POST with Telegram update
  console.log("\n[Test 2] Testing POST /api/telegram update processing...");
  const mockPayload = {
    update_id: 123456,
    message: {
      message_id: 88,
      from: { id: 777888, first_name: "Marcus" },
      chat: { id: 777888, type: "private" },
      date: Math.floor(Date.now() / 1000),
      text: "What are some hidden gem coffee shops in Bugis?",
      location: {
        latitude: 1.3005,
        longitude: 103.8558,
      },
    },
  };

  const req = new Request("http://localhost:3000/api/telegram", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(mockPayload),
  });

  const postRes = await POST(req);
  assert.strictEqual(postRes.status, 200, "Webhook must always return status 200 to prevent Telegram retries");
  const postData = await postRes.json();
  assert.strictEqual(postData.success, true);
  console.log("✓ POST webhook responded with 200 OK within milliseconds!");

  console.log("\n=========================================");
  console.log("WEBHOOK ROUTE TESTS PASSED (2/2)!");
  console.log("=========================================\n");
}

testWebhook().catch((err) => {
  console.error("Webhook test failed:", err);
  process.exit(1);
});
