# 留言板后台

[tqzhaone.github.io](https://tqzhaone.github.io) 的留言板和页脚访问量由这个分支里的代码提供，运行在 Netlify 上。网站本身在 `main` 分支，两边互不影响。

- 程序：[Twikoo](https://twikoo.js.org) 2.0.17 的 Netlify 版（`twikoo-netlify`）
- 数据：留言、设置和访问量都存在这个 Netlify 项目自带的 Netlify Blobs 里，不需要 MongoDB，也没有要保管的数据库密码
- Netlify 项目：`tqzhao-guestbook`（<https://app.netlify.com/projects/tqzhao-guestbook>）
- 后台首页：<https://tqzhao-guestbook.netlify.app/>，显示存储是否正常、留言数、访问量、管理密码是否已设置，下面可以打开 Twikoo 管理面板
- 网站调用的接口：`https://tqzhao-guestbook.netlify.app/.netlify/functions/twikoo`

## 文件

| 文件 | 作用 |
| --- | --- |
| `netlify/functions/twikoo.mjs` | 网站调用的接口。和 Twikoo 官方模板相同，只是数据库换成了 Netlify Blobs |
| `netlify/functions/console.mjs` | 后台首页 |
| `lib/storage.mjs` | 打开 Netlify Blobs 里名为 `twikoo` 的存储 |
| `package.json`、`.node-version` | 依赖版本；Node 24 |
| `netlify.toml` | Netlify 设置（没有构建命令，Netlify 安装依赖后直接打包两个函数） |

## 部署

这个项目是用 Netlify 的拖拽部署（<https://app.netlify.com/drop>）上线的，没有连 GitHub，所以推送到这个分支不会自动部署。改了后台代码后，把这个分支的文件打成 zip（`package.json` 要在压缩包最外层），拖到 Netlify 项目 `tqzhao-guestbook` 的 Deploys 页面，Netlify 会重新安装依赖并部署。

项目的访问设置：正式地址公开（网站要能调用接口），预览版只有 Netlify 团队成员能看。

## 日常管理

- 管理密码：在后台首页或网站的 `/guestbook/admin/` 点评论区右上角的齿轮图标。部署后第一件事就是设置密码，谁先设置谁就能管理。
- 备份：管理面板的「导入/导出」里可以导出全部留言和访问量（JSON 文件）。
- 忘记密码：用 Netlify CLI 删除设置 `netlify blobs:delete twikoo config:main`，再回后台首页重新设置。这会同时清空 Twikoo 的其他设置（邮件提醒等），留言和访问量不受影响。

## 升级 Twikoo

把 `package.json` 里的两个 `2.0.17` 和 `console.mjs` 里的 `TWIKOO_CLIENT` 改成同一个新版本后推送。网站上 `/guestbook/admin/` 页面加载的管理面板版本也要改成一样，否则管理面板会提示版本不一致。

## 费用

Netlify 免费套餐每月有固定额度，个人主页的留言和访问量用不完。免费套餐不绑银行卡，额度用完后只会暂停到下个月，不会扣费。
