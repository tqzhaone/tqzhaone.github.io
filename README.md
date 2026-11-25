# tqzhaone.github.io

Tianqi Zhao 的个人学术主页：<https://tqzhaone.github.io>

纯手写的静态网页（HTML / CSS / JavaScript），不依赖模板或框架，字体也是自托管的，国内打开不受影响。
唯一会访问外部网站的是留言板（见下文），而且只在访客滚动到留言板附近时才发请求。
改动推送到 `main` 分支后，GitHub Actions 会把 `site/` 目录发布到 `gh-pages` 分支，一两分钟后上线。

## 常改的地方

| 想改什么 | 在哪里改 |
| --- | --- |
| 页面文字 | `site/index.html`。中英文成对出现：`data-l="en"` 是英文，`data-l="zh"` 是中文，两边都要改。 |
| 加一篇论文 | `site/index.html` 的 `id="publications"` 一节：复制一篇同类论文的 `<li class="pub">…</li>`（第一作者的就复制一篇第一作者的），改期刊、标题、作者和 DOI。再把 BibTeX 加进页面底部 `id="bibtex"` 的 JSON，键名和按钮上的 `data-bib` 一致。筛选按钮上的篇数会自动更新；“简历”一节里的论文总数是手写的，记得一起改。 |
| 邮箱 | `site/index.html` 里的 `data-user` 和 `data-domain`（共两处）。完整地址由脚本拼出来，HTML 源码里不出现，能挡掉一部分抓邮箱的爬虫。 |
| 颜色、字体、版式 | `site/assets/css/site.css` 开头的变量。 |
| 首屏的余辉动画 | `site/assets/js/site.js` 第 4 部分。 |
| 分享到社交网络时的预览图 | `site/assets/img/og.png`（1200 × 630）。 |
| 照片 | `site/assets/img/portrait.webp`（360 × 450）和 `portrait@2x.webp`（720 × 900），竖版 4:5。换照片时两张都换，比例保持 4:5。 |
| 「实验室之外」的照片 | `site/assets/img/life/g318.webp`（760 × 507）和 `g318@2x.webp`（1520 × 1013），横版 3:2。文字和图注在 `site/index.html` 里 `id="life"` 一节。中文标题和引语用的宋体是按网页用到的字裁出来的（`site/assets/fonts/serif-sc.woff`），改这里的中文时新字可能显示成系统字体，告诉我重新生成字体文件即可。 |
| 各区块的背景图 | `site/assets/img/bg/ribbon-*.webp`：一条贯穿全页的余辉光带。首屏是激发的那一刻，往下每个区块各画一段，颜色按首屏色标从红、琥珀、绿、蓝走到紫，亮度一段比一段暗，像余辉衰减；每张都有普通和 `@2x` 高清两个版本。图是黑底发光，网页用滤色（screen）叠到底色上，黑色部分不显示，所以换图时也要用黑底。`grain.png` 是铺在深色底上的细颗粒。位置、亮度和每个区块的底色光晕在 `site.css` 的 Backgrounds 一段。 |

中文标题用的是精简过的思源宋体（`site/assets/fonts/serif-sc.woff`），只包含现在页面上用到的字。
以后在标题里加了新字，新字会用系统自带的宋体显示，不影响阅读；想让字形完全统一，需要重新生成这个字体文件。

旧地址 `/publications/` 和 `/cv/` 会自动跳到首页对应的位置，`/guestbook/` 会跳到留言板。

## 留言板

留言和页脚的访问量存在 [Twikoo](https://twikoo.js.org)（开源评论系统）里。后台是 Netlify 上的项目 `tqzhao-guestbook`，数据存在 Netlify 自带的存储（Netlify Blobs）里，不需要另外的数据库。后台代码在本仓库的 `guestbook-server` 分支，部署和升级方法见那里的 README。
网页上的留言板是自己写的（`site/assets/js/guestbook.js`），通过 Twikoo 的接口读写留言，样式和首屏的余辉动画是一套。

- 后台首页：<https://tqzhao-guestbook.netlify.app/>，可以看存储是否正常、留言数和访问量，也能打开管理面板
- 接口地址：`https://tqzhao-guestbook.netlify.app/.netlify/functions/twikoo`

| 想做什么 | 怎么做 |
| --- | --- |
| 删除、隐藏、置顶留言，改设置 | 打开 <https://tqzhaone.github.io/guestbook/admin/> 或后台首页，点评论区右上角的齿轮图标，用管理密码登录。两个页面加载的都是 Twikoo 官方的管理面板。 |
| 以博主身份回复 | 先在上面的管理页登录（同一个浏览器），然后在留言板上用 `BLOGGER_EMAIL` 里的邮箱留言，留言会带“博主”标记。 |
| 换后端地址 | `site/index.html` 里 `id="guestbook"` 一节和页脚访问量的 `data-api`，以及 `site/guestbook/admin/index.html` 里的 `api`。 |
| 升级 Twikoo | 后台和管理页的版本要一致（现在是 2.0.17）：后台按 `guestbook-server` 分支的 README 升级，管理页改 `site/guestbook/admin/index.html` 里两个链接中的版本号。 |

页脚的访问量也记在这个后台里（Twikoo 的计数功能）：同一个人一次浏览只算一次，刷新或切换语言不重复计数；本地预览不计数；连不上服务器时页脚就不显示数字。代码在 `site/assets/js/visits.js`。

人机验证（验证码）不要开：这个留言板没有接验证码，开了之后访客会发不出留言。

## 旧版

原来基于 al-folio 模板的版本保存在 `al-folio-backup` 分支。

## 字体许可

Cardo、Fira Sans 和 Noto Serif CJK（思源宋体）均采用 SIL Open Font License 1.1，许可文本在 `site/assets/fonts/`。
