# 明清小说知识图谱

这是一个可部署到 GitHub Pages 的静态网页。将本目录的文件放在仓库根目录，所有资源都使用相对路径。

## 本地预览

在本目录运行：

```powershell
python -m http.server 8000
```

然后打开 <http://localhost:8000>。不要直接双击 `index.html`，因为浏览器需要通过 HTTP 读取图谱 JSON。

## 发布到 GitHub Pages

1. 将本目录内容上传到一个公开 GitHub 仓库。
2. 在仓库的 **Settings → Pages** 中，将发布源设为 **Deploy from a branch**。
3. 选择 `main` 分支和 `/ (root)` 目录并保存。
4. 等待 GitHub Pages 完成发布；页面网址会显示在 Pages 设置中，通常为 `https://<用户名>.github.io/<仓库名>/`。

页面使用 D3.js 公共 CDN；访问者需要联网。
