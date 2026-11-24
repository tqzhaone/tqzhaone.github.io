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
| 各区块的背景图 | `site/assets/img/bg/`：纳米晶体（关于）、发射谱线化作光子落下（研究）、辐射强度等高线（论文）、余辉光迹（联系），每张都有普通和 `@2x` 高清两个版本。都是程序按真实物理画出来的发光图：黑底，网页用滤色（screen）叠到底色上，黑色部分不显示，所以换图时也要用黑底。位置和亮度在 `site.css` 的 Backgrounds 一段。 |

中文标题用的是精简过的思源宋体（`site/assets/fonts/serif-sc.woff`），只包含现在页面上用到的字。
以后在标题里加了新字，新字会用系统自带的宋体显示，不影响阅读；想让字形完全统一，需要重新生成这个字体文件。

旧地址 `/publications/` 和 `/cv/` 会自动跳到首页对应的位置，`/guestbook/` 会跳到留言板。

## 留言板

留言板和页脚的访问量已经写好，但要等后台接上之后才会出现在网页上（菜单里的“留言板”、留言板本身、页脚访问量和 `/guestbook/` 两个页面会一起出现）。

留言存在 [Twikoo](https://twikoo.js.org)（开源评论系统）里：后端是部署在 Netlify 上的 `twikoo-netlify` 函数，数据在 MongoDB Atlas 的免费数据库。
网页上的留言板是自己写的（`site/assets/js/guestbook.js`），通过 Twikoo 的接口读写留言，样式和首屏的余辉动画是一套。

| 想做什么 | 怎么做 |
| --- | --- |
| 删除、隐藏、置顶留言，改设置 | 打开 <https://tqzhaone.github.io/guestbook/admin/>，点评论区上方的齿轮图标，用管理密码登录。这个页面加载的是 Twikoo 官方的管理面板。 |
| 以博主身份回复 | 先在上面的管理页登录（同一个浏览器），然后在留言板上用 `BLOGGER_EMAIL` 里的邮箱留言，留言会带“博主”标记。 |
| 换后端地址 | `site/index.html` 里 `id="guestbook"` 一节的 `data-api`，以及 `site/guestbook/admin/index.html` 里的 `api`。 |
| 升级管理页用的 Twikoo 版本 | `site/guestbook/admin/index.html` 里两个链接中的版本号。后端在 Netlify 上的那个仓库里按 Twikoo 文档升级。 |

页脚的访问量也记在这个后台里（Twikoo 的计数功能）：同一个人一次浏览只算一次，刷新或切换语言不重复计数；本地预览不计数；连不上服务器时页脚就不显示数字。代码在 `site/assets/js/visits.js`。

人机验证（验证码）不要开：这个留言板没有接验证码，开了之后访客会发不出留言。

## 旧版

原来基于 al-folio 模板的版本保存在 `al-folio-backup` 分支。

## 字体许可

Cardo、Fira Sans 和 Noto Serif CJK（思源宋体）均采用 SIL Open Font License 1.1，许可文本在 `site/assets/fonts/`。
