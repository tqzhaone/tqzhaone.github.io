# tqzhaone.github.io

Tianqi Zhao 的个人学术主页：<https://tqzhaone.github.io>

纯手写的静态网页（HTML / CSS / JavaScript），不依赖模板、框架或外部网站，字体也是自托管的，国内打开不受影响。
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

中文标题用的是精简过的思源宋体（`site/assets/fonts/serif-sc.woff`），只包含现在页面上用到的字。
以后在标题里加了新字，新字会用系统自带的宋体显示，不影响阅读；想让字形完全统一，需要重新生成这个字体文件。

旧地址 `/publications/` 和 `/cv/` 会自动跳到首页对应的位置。

## 旧版

原来基于 al-folio 模板的版本保存在 `al-folio-backup` 分支。

## 字体许可

Cardo、Fira Sans 和 Noto Serif CJK（思源宋体）均采用 SIL Open Font License 1.1，许可文本在 `site/assets/fonts/`。
