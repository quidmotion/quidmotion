/**
 * Call loginAction via Next.js server-action protocol and report result.
 */
import fs from "node:fs";

function loadActionId() {
  const raw = fs.readFileSync(
    ".next/server/server-reference-manifest.json",
    "utf8",
  );
  const manifest = JSON.parse(raw);
  for (const [id, meta] of Object.entries(manifest.node ?? {})) {
    if (meta.exportedName === "loginAction") return id;
  }
  throw new Error("loginAction id not found — hit /login once first");
}

const actionId = loadActionId();
const base = "http://127.0.0.1:3000";
const boundary = "----FormBoundaryLoginTest";

function buildBody(fields) {
  let body = "";
  for (const [name, value] of fields) {
    body += `--${boundary}\r\n`;
    body += `Content-Disposition: form-data; name="${name}"\r\n\r\n`;
    body += `${value}\r\n`;
  }
  body += `--${boundary}--\r\n`;
  return body;
}

async function tryLogin(label, fields) {
  const t0 = Date.now();
  const res = await fetch(`${base}/login`, {
    method: "POST",
    headers: {
      "Next-Action": actionId,
      Accept: "text/x-component",
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body: buildBody(fields),
    redirect: "manual",
  });
  const text = await res.text();
  const cookies = res.headers.getSetCookie?.() ?? [];
  console.log(`\n=== ${label} ===`);
  console.log("status:", res.status, "ms:", Date.now() - t0);
  console.log("x-action-redirect:", res.headers.get("x-action-redirect"));
  console.log("cookies:", cookies.length);
  for (const c of cookies) console.log(" ", c.slice(0, 120));
  console.log("body:", text.slice(0, 500).replace(/\n/g, " | "));
  return { res, text, cookies };
}

console.log("actionId:", actionId);

// Warm compile
await fetch(`${base}/login`).catch(() => {});

// useActionState encodes prev as arg0 and form fields under 1_
const ok = await tryLogin("valid investor (useActionState encoding)", [
  ["1_email", "investor@quidmotion.com"],
  ["1_password", "password123"],
  ["1_next", "/dashboard"],
  ["0", "null"],
]);

await tryLogin("wrong password", [
  ["1_email", "investor@quidmotion.com"],
  ["1_password", "wrongpassword"],
  ["1_next", "/dashboard"],
  ["0", "null"],
]);

// Follow redirect with cookies if login succeeded
const redirectTo = ok.res.headers.get("x-action-redirect");
if (redirectTo && ok.cookies.length) {
  const cookieHeader = ok.cookies.map((c) => c.split(";")[0]).join("; ");
  const dash = await fetch(`${base}${redirectTo.startsWith("/") ? redirectTo : "/dashboard"}`, {
    headers: { Cookie: cookieHeader },
    redirect: "manual",
  });
  console.log("\n=== dashboard with session cookies ===");
  console.log("status:", dash.status);
  console.log("location:", dash.headers.get("location"));
  const html = await dash.text();
  console.log("has Gustavo?", html.includes("Gustavo"));
  console.log("has portfolio?", /portfolio|Total portfolio|Available/i.test(html));
}
