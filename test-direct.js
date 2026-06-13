const { searchWebForEvidence } = require("./.next/server/app/api/chat/route") || {};
// We can't import easily. Let's just create a large system prompt with fake search results and send to LM Studio.

async function testDirect() {
  const messages = [
    { role: "system", content: "You are AIOPH. \n\n Search results: " + "fake search result ".repeat(500) },
    { role: "user", content: "วันนี้มีข่าวอะไรน่าสนใจ" }
  ];

  const res = await fetch("http://127.0.0.1:1234/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemma-4-e4b",
      messages,
      stream: true
    })
  });

  console.log("LM Studio Status:", res.status);
  
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      console.log("STREAM DONE");
      break;
    }
    console.log("CHUNK:", decoder.decode(value, { stream: true }));
  }
}

testDirect().catch(console.error);
