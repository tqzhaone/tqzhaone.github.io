// The backend's home page: https://<project>.netlify.app/
//
// Shows whether the store can be read, how many messages and visits it holds, and whether the
// admin password has been set. Below that it loads the official Twikoo client, so the owner
// can open the admin panel here (and set the password) before the website links to this
// backend.
import { openDatabase } from "../../lib/storage.mjs";

export const config = { path: "/" };

// Keep equal to the twikoo-netlify version in package.json: the admin panel warns when the
// client and the server versions differ.
const TWIKOO_CLIENT = "2.0.17";
const SITE = "https://tqzhaone.github.io/";
const THREAD = "/guestbook/";

export default async (request) => {
  const api = new URL("/.netlify/functions/twikoo", request.url).href;
  const status = await readStatus();
  return new Response(page(api, status), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
};

async function readStatus() {
  try {
    const db = openDatabase();
    const [messages, counter, settings] = await Promise.all([
      db.getAllComments(),
      db.getCounter("/"),
      db.getConfig(),
    ]);
    return {
      ok: true,
      messages: messages.filter((m) => !m.isSpam).length,
      visits: counter?.time ?? 0,
      password: Boolean(settings?.ADMIN_PASS),
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function escape(text) {
  return String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// JSON that is safe to place inside a <script> element.
function inline(value) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function rows(status) {
  if (!status.ok) {
    return `<dt>存储</dt><dd class="bad">读不出数据：${escape(status.error)}</dd>`;
  }
  const password = status.password
    ? `<dd>已设置</dd>`
    : `<dd class="bad">还没设置。谁先设置，谁就能管理留言板，请现在就在下面设置。</dd>`;
  return `
        <dt>存储</dt><dd class="ok">正常（Netlify Blobs）</dd>
        <dt>留言</dt><dd>${status.messages} 条</dd>
        <dt>首页访问量</dt><dd>${status.visits}</dd>
        <dt>管理密码</dt>${password}`;
}

function page(api, status) {
  const sources = [
    `https://registry.npmmirror.com/twikoo/${TWIKOO_CLIENT}/files/dist/twikoo.min.js`,
    `https://cdn.jsdelivr.net/npm/twikoo@${TWIKOO_CLIENT}/dist/twikoo.min.js`,
  ];
  const settings = { envId: api, el: "#tcomment", path: THREAD, href: SITE, lang: "zh-CN" };
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>留言板后台 | Tianqi Zhao</title>
    <meta name="robots" content="noindex, nofollow">
    <style>
      body { margin: 0; background: #f4f5fa; color: #1d2033; font: 16px/1.7 system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
      main { max-width: 760px; margin: 0 auto; padding: 48px 20px 80px; }
      h1 { margin: 0 0 12px; font-size: 28px; font-weight: 600; }
      p { margin: 0 0 12px; }
      code { font-size: 14px; word-break: break-all; }
      a { color: #0b7a55; }
      .box { margin-top: 28px; padding: 24px; border-radius: 16px; background: #fff; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06); }
      dl { display: grid; grid-template-columns: max-content 1fr; gap: 8px 24px; margin: 0; }
      dt { color: #5b6078; }
      dd { margin: 0; }
      .ok::before { content: ""; display: inline-block; width: 8px; height: 8px; margin: 0 8px 2px 0; border-radius: 50%; background: #18b77e; vertical-align: middle; }
      .bad { color: #b4232c; }
      @media (max-width: 480px) { dl { grid-template-columns: 1fr; gap: 0; } dd { margin-bottom: 8px; } }
    </style>
  </head>
  <body>
    <main>
      <h1>留言板后台</h1>
      <p><a href="${SITE}">tqzhaone.github.io</a> 的留言板和访问量统计都由这里提供。网站通过这个地址读写数据：</p>
      <p><code>${escape(api)}</code></p>
      <div class="box">
        <dl>${rows(status)}
        </dl>
      </div>
      <div class="box">
        <p>点评论区右上角的齿轮图标打开管理面板。第一次打开时先设置管理密码，以后用这个密码登录。登录后可以删除、隐藏或置顶留言，也可以设置邮件提醒。</p>
        <div id="tcomment">正在加载管理面板……</div>
      </div>
    </main>
    <script>
      (function () {
        var sources = ${inline(sources)};
        var settings = ${inline(settings)};
        var box = document.getElementById("tcomment");
        function load(i) {
          if (i >= sources.length) {
            box.textContent = "管理面板没能加载出来，请检查网络后刷新页面。";
            return;
          }
          var script = document.createElement("script");
          script.src = sources[i];
          script.onload = function () {
            box.textContent = "";
            twikoo.init(settings);
          };
          script.onerror = function () {
            script.remove();
            load(i + 1);
          };
          document.head.appendChild(script);
        }
        load(0);
      })();
    </script>
  </body>
</html>
`;
}
