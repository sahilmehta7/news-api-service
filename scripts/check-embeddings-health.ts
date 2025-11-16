const endpoint = process.env.EMBEDDING_ENDPOINT || "http://localhost:8001/embed";
const healthUrl = (endpoint.endsWith("/embed") ? endpoint.replace(/\/embed$/, "") : endpoint) + "/health";

async function main() {
  try {
    const res = await fetch(healthUrl, { method: "GET" });
    const ok = res.ok;
    const body = await res.text();
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok, status: res.status, body }, null, 2));
    if (!ok) process.exit(1);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
  }
}

void main();


