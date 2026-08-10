# PixelSnack

PixelSnack 是一款本地优先的拼豆绘图与图片转拼豆 Web/PWA。它面向桌面、平板和手机，作品与上传图片默认只在用户设备中处理。

在线体验：<https://pixelsnack-studio.qianhuangsheng00.chatgpt.site>

## 功能

- 最高 256×256 的 Canvas 拼豆画布
- 画笔、橡皮、填充、吸管、平移、网格和分板线
- 鼠标、触控笔、单指绘制及双指缩放/平移
- 图片裁切、三种缩放方式、OKLab 色板匹配和 Floyd–Steinberg 抖动
- 浅色参考底图互动描摹，或直接生成完整像素图
- IndexedDB 自动保存和 `.pixelsnack` 工程导入/导出
- PNG 成品图；PDF 提供作品总览、材料统计、全局坐标、逐板施工图和 100 mm 打印校准尺
- 离线 PWA

## 技术栈

- React 19、TypeScript、Vinext/Vite
- Canvas 2D、Zustand、Dexie/IndexedDB
- Web Worker、JSZip、pdf-lib
- Vitest、Playwright、ESLint

## 本地开发

需要 Node.js 22.13 或更高版本。

```bash
npm install
npm run dev
```

常用命令：

```bash
npm run lint        # 代码检查
npm test            # 算法单元测试
npm run test:render # 生产构建和服务端渲染测试
npm run test:e2e    # Playwright 交互测试
npm run build       # 生产构建
```

## 项目结构

```text
app/
  PixelSnackApp.tsx     主编辑器界面
  PixelCanvas.tsx       分层画布、导航器和输入交互
  ImageConverter.tsx    图片裁切与转换流程
  image-convert-core.ts OKLab 匹配和抖动算法
  editor-core.ts        项目模型与网格算法
  editor-store.ts       编辑状态与撤销重做
  pdf-export.ts         PDF 总览、分板和材料图纸生成
  project-io.ts         本地存储和导出
public/
  image-worker.js       同源图片转换线程
tests/                  单元、渲染和端到端测试
```

## 工程与隐私

- 用户图片不会上传到应用服务器。
- 工程默认保存到浏览器 IndexedDB。
- `.pixelsnack` 是 ZIP 容器，包含 `manifest.json`、`cells.bin`、可选的 `guide.bin` 和 `preview.png`。
- 当前内置的是明确标记的开发示例色板；正式品牌色号需要使用获得授权的数据。

## 当前阶段

项目处于公开测试前的 MVP 阶段。社区、账户和云同步不在当前版本范围内。
