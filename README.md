# tqzhaone.github.io

Tianqi Zhao 的个人学术主页：<https://tqzhaone.github.io>

纯手写的静态网页（HTML / CSS / JavaScript），不依赖模板或框架，字体和脚本库也都是自托管的，国内打开不受影响。
会访问外部网站的只有：留言板和文章评论、访问量（都在 Twikoo 后台，见下文），以及管理后台（它直接和 GitHub 通信）。
改动推送到 `main` 分支后，GitHub Actions 先用 `tools/build-site.js` 生成论文、新闻、博客和照片等页面，再把 `site/` 目录发布到 `gh-pages` 分支，一两分钟后上线。

## 常改的地方

| 想改什么 | 在哪里改 |
| --- | --- |
| 页面文字 | `site/index.html`。中英文成对出现：`data-l="en"` 是英文，`data-l="zh"` 是中文，两边都要改。 |
| 加一篇论文 | 导航栏「动态」里的「论文」是 `/publications/` 页面，部署时由 `tools/build-site.js` 的 `publicationsPage()` 生成，内容来自两个文件：`site/publications/papers.html`（按年份分组的论文列表）和 `site/publications/bibtex.json`（「复制 BibTeX」按钮复制的内容）。加一篇：在 `papers.html` 里复制一篇同类论文的 `<li class="pub">…</li>`（第一作者的就复制一篇第一作者的，带 `data-first="true"`），改期刊、标题、作者和 DOI；新的一年就复制一整个 `<div class="year">…</div>`。再把 BibTeX 加进 `bibtex.json`，键名和按钮上的 `data-bib` 一致。筛选按钮上的篇数会自动更新；首页「简历」一节里的论文总数是手写的，记得一起改。也可以直接把 DOI 发给我来加。 |
| 邮箱 | `site/index.html` 里的 `data-user` 和 `data-domain`（共两处）。完整地址由脚本拼出来，HTML 源码里不出现，能挡掉一部分抓邮箱的爬虫。 |
| 「关于」里的那句话 | `site/index.html` 里 `class="motto"` 的一段：318 国道路边标语上的「今日走过了所有的弯路，从此人生尽是坦途。」，英文模式下多一行英译。它用的宋体是按网页上已有的字裁出来的（`site/assets/fonts/serif-sc.woff`），换成别的话时新字会显示成系统宋体，告诉我重新生成字体文件即可。以前的「实验室之外」页面 `/life/` 已经删掉，那张照片在「照片」页面里。 |
| 颜色、字体、版式 | `site/assets/css/site.css` 开头的变量。 |
| 首屏的余辉动画 | `site/assets/js/site.js` 第 4 部分。 |
| 首屏的背景照片 | `site/assets/img/hero/mountains.webp`（2172 × 724，雪山全景）。在 `site.css` 的 `.chamber` 里：照片按原比例铺在首屏上半部分（屏幕高度的 58%，或屏幕宽度的三分之一，取大的），雪线以下渐渐暗成网页的深蓝底色，名字和下面几行字在雪线以下，不压在雪上；上沿还压了一层暗角，让菜单看得清；余辉动画的画布用滤色（screen）叠在照片上。换照片时用横版、宽一些的图（宽 2000 像素以上更清楚）。 |
| 「趣味」页面和作品 | 导航栏最右边的「趣味」是 `/playground/` 页面，由 `tools/build-site.js` 的 `playgroundPage()` 在部署时生成，每个作品一张卡片。作品本身是独立网页，放在 `site/playground/<名字>/index.html`（现在有 `pelican` 鹈鹕骑车和 `eiffel` 埃菲尔铁塔之夜），页面右上角有“返回主页”；缩略图在 `site/assets/img/play/<名字>.webp`（1120 × 700，显示时裁成 16:9）。加新作品：新建一个文件夹放网页，放一张同名缩略图，再在 `playgroundPage()` 的 `cards` 里加一项（标题和中英文说明）。 |
| 小游戏「关灯之后」 | `site/playground/lights-off/index.html`，单独的一张网页，不依赖其他文件（只借用网站的字体和图标）。玩法：按住「激发」（或空格键）照亮组织，松开关灯，背景光很快熄灭，肿瘤上的余辉还亮着，趁它没暗下去点中它。难度在 `params()` 里按关卡调（肿瘤数、背景亮点数、余辉和背景的寿命、每关激发次数、亮点大小）；最高分存在访客自己的浏览器里。卡片缩略图是 `site/assets/img/play/lights-off.webp`。 |
| 贪吃蛇和 2048 | `site/playground/snake/index.html` 和 `site/playground/2048/index.html`，各是单独的一张网页，配色都用首页的辐射色标。贪吃蛇：方向键或 WASD 转向，空格暂停，手机上滑动或用棋盘下方的方向键；速度在 `step()` 里随吃到的个数加快，奖励光球每吃 5 个出现一次。2048：方向键、WASD 或滑动，U 撤销一步；进行中的棋盘和最高分存在访客自己的浏览器里，下次打开接着玩。卡片缩略图是 `site/assets/img/play/snake.webp` 和 `2048.webp`。 |
| 「趣味」页的分组 | `tools/build-site.js` 里的 `PLAY_GROUPS`：分成「和研究有关」「经典小游戏」「实用工具」「模拟与动画」四组，每组一个标题、一句说明和几张卡片。加一个作品：在对应的组里加一项（`key` 就是网址里的名字），把页面放进 `site/playground/<key>/index.html`，缩略图放进 `site/assets/img/play/<key>.webp`（1120 × 700），再在 `site/sitemap.xml` 里加一行。卡片标题用的宋体是裁剪过的，新标题里有新字时，告诉我重新生成字体文件。 |
| 新作品共用的样式和脚本 | `site/assets/css/play.css` 和 `site/assets/js/play.js`：余辉密信、夜光涂鸦墙、猜温度、俄罗斯方块、扫雷、生命游戏、余辉寿命拟合、DOI 转参考文献这八个页面共用的字体、颜色、按钮、对话框、语言切换和首页的辐射色标。关灯之后、贪吃蛇、2048 三个页面是自带样式的独立文件。 |
| 余辉密信 | `site/playground/secret/`。两句话用两种「材料」的点阵印在一起：伪装在灯下更亮，真话是长余辉。分享链接把两句话放在网址的 `#` 后面（不会发到服务器），拿到链接的人都能解出来。 |
| 夜光涂鸦墙 | `site/playground/glow-wall/`。四种材料的颜色和余辉时长在页面脚本开头的 `MATS` 里（真实材料能亮几小时，这里按比例缩短成几秒）；红外光会把存着的能量一下子放掉。 |
| 猜温度 | `site/playground/thermometer/`。Cr³⁺ 锐线（约 697 nm）和宽带（约 745 nm）的强度比按玻尔兹曼分布随温度变化，参数（ΔE = 1100 cm⁻¹，25 °C 时比值 0.30）在脚本开头，是示意用的。 |
| 俄罗斯方块、扫雷、生命游戏 | `site/playground/tetris/`、`minesweeper/`、`life/`。俄罗斯方块用标准规则（7 块一袋、SRS 旋转和踢墙、保留、影子、落地延迟，每 10 行升一级）；落定的方块按落下的时间从红冷却到蓝。扫雷第一下不会踩雷，手机上长按插旗。生命游戏的格子在边缘首尾相接，图案用 RLE 写在脚本里。最高分都存在访客自己的浏览器里。 |
| 余辉寿命拟合 | `site/playground/decay-fit/`。模型 y = y₀ + Σ Aᵢ·exp(−t/τᵢ)，寿命用 Levenberg–Marquardt 法、振幅和背景用线性最小二乘（变量投影法），从多个初始值出发取最好的结果；误差来自协方差矩阵。我用 SciPy 的 curve_fit 对比过，数值和误差一致。数据不会上传。 |
| DOI 转参考文献 | `site/playground/cite/`。从 Crossref 取文献信息（访客的浏览器直接请求 api.crossref.org），生成 GB/T 7714—2015、APA 7、ACS、BibTeX、RIS。「用我的论文试试」里的 DOI 列表在脚本开头的 `MY_DOIS`，发了新论文可以加进去。 |
| 分享到社交网络时的预览图 | `site/assets/img/og.png`（1200 × 630）。 |
| 照片 | `site/assets/img/portrait.webp`（360 × 450）和 `portrait@2x.webp`（720 × 900），竖版 4:5。换照片时两张都换，比例保持 4:5。 |
| 各区块的背景图 | `site/assets/img/bg/ribbon-*.webp`：一条贯穿全页的余辉光带。首屏是激发的那一刻，往下每个区块各画一段，颜色按首屏色标从红、琥珀、绿、蓝走到紫，亮度一段比一段暗，像余辉衰减；每张都有普通和 `@2x` 高清两个版本。图是黑底发光，网页用滤色（screen）叠到底色上，黑色部分不显示，所以换图时也要用黑底。`grain.png` 是铺在深色底上的细颗粒。位置、亮度和每个区块的底色光晕在 `site.css` 的 Backgrounds 一段。新闻、博客、照片、趣味四个页面的标题右上方也各有一段（`ribbon-news`、`ribbon-blog`、`ribbon-photos`、`ribbon-play`），颜色跟各页的底色光晕一致，位置在 `pages.css` 的 `.backdrop--pagehead`。 |

中文标题用的是精简过的思源宋体（`site/assets/fonts/serif-sc.woff`），只包含现在页面上用到的字。
以后在标题里加了新字，新字会用系统自带的宋体显示，不影响阅读；想让字形完全统一，需要重新生成这个字体文件。

旧地址 `/cv/` 会自动跳到首页的简历，`/guestbook/` 会跳到留言板；以前指向首页 `#publications` 的链接会跳到论文页面。

## 新闻、博客、照片

导航栏的「动态」一组里是论文 `/publications/`（见上面「加一篇论文」）和这三个页面：`/news/`、`/blog/`、`/photos/`；最右边是「趣味」`/playground/`。

**最方便的是用管理后台：<https://tqzhaone.github.io/admin/>**，手机和电脑都能用。
在后台可以写博客（贴图、拖图都行，会自动压缩，可以边写边预览）、发新闻、批量上传照片，也能修改和删除。
每次保存就是仓库里的一次提交，大约一分钟后网站上就能看到，后台会提示什么时候上线。
写到一半的文章会自动存成本机草稿（图片也存着），换了页面或刷新都不会丢；草稿只在这台设备上。

第一次用后台要一把 GitHub 密钥（只需生成一次）：

1. 打开 <https://github.com/settings/personal-access-tokens/new>。
2. Token name 随便填（比如「网站后台」），Expiration 选个期限（比如一年）。
3. Repository access 选 **Only select repositories**，只勾 **tqzhaone.github.io**。
4. Permissions → Repository permissions → **Contents** 选 **Read and write**，其他不用动。
5. 点 Generate token，把 `github_pat_` 开头的那串粘贴进后台。

密钥只存在那台设备的浏览器里，只能改这一个仓库。用过的公用电脑上记得点后台右上角的「退出」。密钥过期后再生成一个就行。
万一怀疑密钥泄露，在 <https://github.com/settings/personal-access-tokens> 把它删掉，再生成一个新的；网站上被改动的内容可以从 GitHub 的提交历史里恢复。
在登录过后台的浏览器里，新闻、博客、照片页面上会多出「发新闻」「写文章」「编辑这篇」「传照片」这些按钮，别人看不到。

内容都存在 `site/` 里，也可以直接改文件：

| 内容 | 文件 | 说明 |
| --- | --- | --- |
| 博客 | `site/blog/<网址名>/index.md`，图片放在同一个文件夹 | 一篇文章一个文件夹，文件夹名就是网址（只能用小写字母、数字和 `-`）。开头是标题、日期等信息，后面是 Markdown 正文，格式见下。 |
| 新闻 | `site/news/news.json`，配图在 `site/news/img/` | 每条：`id`、`date`（YYYY-MM-DD）、`kind`（`paper` 论文 / `talk` 会议 / `award` 获奖 / `other` 其他）、`text`（中文）、`text_en`（英文，选填）、`link`、`image`（选填）。 |
| 照片 | `site/photos/photos.json`，图片在 `site/photos/img/` | 每张：`id`、`file`（原图，长边不超过 2000 像素）、`thumb`（缩略图，长边 720）、`caption`、`caption_en`、`place`、`date`、`album`。 |

博客文章开头的格式（`---` 之间），`title` 和 `date` 必填：

```
---
title: "文章标题"
date: 2026-11-26
tags: ["余辉", "随笔"]
summary: "一句话摘要，不写就自动取正文开头"
cover: "cover.webp"
pinned: true
lang: "en"
draft: true
---
```

`cover` 不写就用正文第一张图；`pinned` 置顶；`lang: "en"` 表示正文是英文；`draft: true` 表示先不发布。

正文是 Markdown，排版代码是自己写的（`site/assets/js/blog-render.js`，后台预览和网站用的是同一份，所以预览什么样，发出去就什么样）：
`## 小标题`（会进文章目录），`**粗体**`、`*斜体*`、`==高亮==`、`~~删除线~~`、引用、列表、表格、代码，
`[文字](链接)`，脚注 `[^1]`，上下标可以直接写 `H<sub>2</sub>O`、`cm<sup>-1</sup>`。
单独一行的图片 `![图注](图片.webp)` 会显示成带图注的插图，连续几行图片会排成一组，`![图注](图片.webp "wide")` 是加宽的大图。
正文里的网页链接会自动变成可点的链接；为了安全，脚本和 `javascript:` 链接会被去掉。

每篇文章下面有评论区，和首页留言板用同一个 Twikoo 后台（每篇文章是单独的一串评论，管理面板里能统一管理），还会显示阅读量。
博客另有 RSS：`/blog/feed.xml`。

生成的页面（`site/publications/index.html`、`site/blog/index.html`、每篇文章的 `index.html`、`site/news/index.html`、`site/photos/index.html` 等）不放在仓库里，每次部署时现做。
想在自己电脑上预览：在仓库根目录运行 `node tools/build-site.js`（只需要 Node，不用安装别的），再用任意静态服务器打开 `site/`。

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
鹈鹕页标题用的站酷快乐体（ZCOOL KuaiLe）也是 SIL OFL 1.1，只保留了标题那几个字（`zcool-kuaile-subset.woff`），许可文本是 `OFL-ZCOOLKuaiLe.txt`。

## 第三方库

鹈鹕页的 3D 场景用 three.js r128，文件放在仓库里（`site/assets/vendor/three.min.js`），不从外部网站加载。three.js 采用 MIT 许可，许可声明保留在文件开头。
博客的 Markdown 排版、管理后台和构建脚本都是自己写的，没有用第三方库。
