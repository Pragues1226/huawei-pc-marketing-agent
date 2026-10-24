---
name: 华为 PC 内容工作台 · 越过想象
description: Mostar 完整景观、横向功能卡片与居中内容工作面板
colors:
  studio-background: "#f4f3ef"
  paper: "#fffefa"
  ink: "#1e3538"
  muted: "#647674"
  status-error: "#8c3434"
  line: "#e2e5de"
  action-primary: "#215e5c"
  action-primary-hover: "#164a48"
  action-generate: "#237858"
  action-text: "#f7faf2"
  deck-cream: "#fff2de"
  deck-ink: "#203b3b"
  deck-icon: "#2689a5"
  deck-hover: "#fffaee"
  deck-selected: "#fff9ed"
  deck-selected-line: "#256b70"
  deck-secondary: "#4f635a"
  panel-shell: "#fff9ef"
  panel-heading: "#fff8ed"
  scenic-text: "#fff7e9"
  portal-sky: "#79b7dd"
  portal-cream: "#fdf1e1"
  portal-button-ink: "#173b3c"
  field-line: "#dfe5dd"
  field-focus: "#72a791"
  studio-focus: "#9fc8b6"
typography:
  settings-field:
    fontSize: "14px"
    lineHeight: 1.6
  settings-section:
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.5
  mobile-field:
    fontSize: "16px"
    lineHeight: 1.6
  display:
    fontFamily: "\"思源宋体 VF\", \"Source Han Serif SC VF\", \"Songti SC\", serif"
    fontSize: "clamp(72px, 11vw, 190px)"
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: ".05em"
  portal-subtitle:
    fontFamily: "\"Ogg Medium\", Georgia, serif"
    fontSize: "clamp(17px, 2.4vw, 34px)"
    lineHeight: 1.5
    letterSpacing: ".12em"
  feature-title:
    fontFamily: "Inter, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif"
    fontSize: "21px"
    fontWeight: 650
    lineHeight: 1.25
  panel-title:
    fontFamily: "Inter, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif"
    fontSize: "19px"
    fontWeight: 600
    lineHeight: 1.4
  product-title:
    fontFamily: "Inter, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif"
    fontSize: "21px"
    fontWeight: 600
    lineHeight: 1.4
  product-intro:
    fontFamily: "\"思源宋体 VF\", \"Source Han Serif SC VF\", serif"
    fontSize: "15px"
    lineHeight: 1.9
  body:
    fontFamily: "Inter, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif"
    fontSize: "13px"
  label:
    fontFamily: "Inter, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif"
    fontSize: "12px"
    fontWeight: 600
  button:
    fontFamily: "Inter, \"Segoe UI\", \"PingFang SC\", \"Microsoft YaHei\", sans-serif"
    fontSize: "12px"
    fontWeight: 550
rounded:
  control: "7px"
  compact-control: "6px"
  thumbnail: "5px"
  product: "12px"
  panel: "17px"
  panel-mobile: "13px"
  feature: "20px"
  pill: "99px"
spacing:
  field-padding: "12px 13px"
  button-padding: "10px 16px"
  portal-button-padding: "17px 25px"
  deck-gap: "16px"
  deck-padding: "13px 34px 9px"
  feature-padding: "22px 24px 19px"
  panel-heading-padding: "17px 24px"
  form-padding: "22px 28px 28px"
  mobile-form-padding: "18px"
components:
  button-primary:
    backgroundColor: "{colors.action-primary}"
    textColor: "{colors.action-text}"
    rounded: "{rounded.control}"
    padding: "{spacing.button-padding}"
    typography: "{typography.button}"
  button-primary-hover:
    backgroundColor: "{colors.action-primary-hover}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "#506453"
    rounded: "{rounded.control}"
    padding: "{spacing.button-padding}"
    typography: "{typography.button}"
  button-generate:
    backgroundColor: "{colors.action-generate}"
    textColor: "{colors.action-text}"
    rounded: "{rounded.control}"
    height: "44px"
    typography: "{typography.button}"
  portal-enter:
    backgroundColor: "{colors.portal-cream}"
    textColor: "{colors.portal-button-ink}"
    rounded: "{rounded.pill}"
    padding: "{spacing.portal-button-padding}"
  feature-card:
    backgroundColor: "{colors.deck-cream}"
    textColor: "{colors.deck-ink}"
    rounded: "{rounded.feature}"
    padding: "{spacing.feature-padding}"
    width: "292px"
    height: "176px"
  feature-card-hover:
    backgroundColor: "{colors.deck-hover}"
  feature-card-selected:
    backgroundColor: "{colors.deck-selected}"
  feature-panel:
    backgroundColor: "{colors.panel-shell}"
    rounded: "{rounded.panel}"
  feature-panel-heading:
    backgroundColor: "{colors.panel-heading}"
    padding: "{spacing.panel-heading-padding}"
    typography: "{typography.panel-title}"
  field:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "{spacing.field-padding}"
    typography: "{typography.body}"
  platform-choice-selected:
    backgroundColor: "#ecf3eb"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
  product-hero:
    backgroundColor: "#f4f5f2"
    rounded: "{rounded.product}"
  product-thumbnail:
    backgroundColor: "#f5f7f1"
    rounded: "{rounded.thumbnail}"
    width: "72px"
    height: "56px"
---

# Design System: 华为 PC 内容工作台

## Overview

**Creative North Star: "穿过石桥，进入创作"**

用户选定的 Mostar 天空、远城、石桥和河岸照片构成完整场景。封面以奶油白宋体“越过想象”邀请进入，工作台延续清晰可见的景观。暖奶油功能卡片沿顶部横向排列；选择功能后，卡片整体退后缩小淡化，当前工作面板来到屏幕正中心。

工作面板使用不透明暖白纸面承载表单、产品原文、图片与稿件。景观负责氛围，面板负责阅读和操作；官网产品摄影在产品区有明确份量，原文和条件可展开核对。此文档从现有原生 HTML/CSS/JavaScript 提取，记录用户已批准的界面变化；项目没有 PRODUCT.md，不补造产品设定。

**Key Characteristics:**

- 完整 Mostar 景观持续可见，最终暖白遮罩仅为 7%。
- 七张横向功能卡片与可关闭、可用 Esc 收起的正中工作面板。
- 中文宋体封面和官网引文，配合系统无衬线表单与导航。
- 对应型号的官网原文、可切换产品图和本地 v7 指导明确标注来源。

本轮按五项指定设计技能的约束整理：taste 保留景观方向和真实浏览器检查；impeccable 同步规范、状态和令牌；shadcn 仅借用 Carousel/Tabs 及可访问组件的组织原则，未安装组件或迁移到 React；UI UX Pro Max 用于可读性、焦点、触控和响应布局检查；Design MD Collection 仅借鉴其 Apple 参考中产品摄影的份量与留白，保留 Mostar 方向，该集合不是官方品牌规范。

当前视觉来源：`app/static/style.css` → `studio.css` → `portal.css` → `feature-deck.css` → `product-stage.css`，以 `index.html` 的实际加载顺序和最终选择器覆盖为准；行为见同名 JavaScript。前置令牌为规范值，`.impeccable/design.json` 只扩展动效、深度、断点、依赖和可渲染组件。

## Colors

### 创作等待反馈

任务提交按钮上方使用单一浅色状态区：背景 `#f3f6f0`，边框 `#dfe5dd`，圆角 7px，内边距 16px（手机 14px），不加阴影。标题 13px/600/1.6；阶段、说明和用时 12px，用时使用等宽数字。文字沿用深青 `#1e3538`、次级 `#526558`；进度条高 5px，填充 `#215e5c`、轨道 `#dfe5dd`。

固定四步：读取资料、提取事实、创作文案、核验图文。进度按服务端实际进入的阶段更新，不随时间增长；同时显示用时与服务连接状态。只有生成并核验通过才填满，失败/待补充保留已完成步骤和具体原因。15px CSS 加载环仅在运行期间旋转，终态停止；减少动态效果时使用静态标记，仍保留阶段与文字反馈。手机端允许用时换行，阶段保持四列。

以暖奶油纸面、河流深青、天空青建立照片与工作面板之间的连续感；色彩角色来自实际界面，不替换照片本身的自然颜色。

### Primary

- **河流深青**：`action-primary` / `action-primary-hover` 用于常规主要操作，`ink` 与 `deck-ink` 承载正文和卡片标题。
- **生成绿色**：`action-generate` 是生成按钮实际生效的独立颜色，仍由既有高优先级规则控制，不能假定与常规主按钮完全统一。

### Secondary

- **天空青**：`portal-sky` 是封面资源加载前的底色。
- **清水蓝**：`deck-icon` 只用于功能线性图标，避免抢过正文和产品摄影。
- **奶油邀请**：`portal-cream` 用于封面标题和入口，`deck-cream` / `deck-hover` / `deck-selected` 区分功能卡片状态。

### Neutral

- **暖白纸面**：`paper` 用于表单与内容区，`panel-shell` / `panel-heading` 用于外层面板及标题栏。
- **石灰白与细边线**：`studio-background` 参与背景洗色，`line` / `field-line` 区分边界。
- **次级深绿灰**：`muted` 是继承的基础次级色；卡片说明实际使用 `deck-secondary`。模式文字、占位符等保留各自最终覆盖值，不把所有小字误归为同一颜色。
- **景观浅字**：`scenic-text` 与文字阴影配合用于景观上的导航和提示。字段与功能按钮分别使用实际绿色或浅色焦点轮廓。

**The Photograph Rule.** 保留用户选定的真实 Mostar 照片层次；场景资源不可用时如实提示，不以抽象渐变或虚构景观冒充。

## Typography

中文封面标题优先使用本机“思源宋体 VF”，接续 Source Han Serif SC VF、Songti SC 和系统 serif。官网介绍与景观中的中文引导也用宋体栈；字体没有下载或内嵌到项目，本机未安装时字形可能不同。英文封面副标题通过外链加载 Ogg Medium，失败时使用 Georgia / serif。

导航、表单、状态和工作面板标题采用系统无衬线栈；前置 `body`、`label`、`button` 令牌给出当前角色。功能卡片不再输出英文眉题或编号，中文功能名直接建立层级。封面中的品牌英文与“BEYOND THE BRIEF”仍保留，不应误写成所有英文均已删除。

- **封面展示字**：使用 `display`；800px 以下字号为 14vw，460px 以下为 15vw。
- **功能标题**：使用 `feature-title`；760px 以下为 19px。说明文字为 12px / 1.5，窄屏为 11px。
- **面板标题**：使用 `panel-title`；760px 以下为 17px。面板描述最终统一为 12px。
- **产品标题与引文**：使用 `product-title` 和 `product-intro`；600px 以下分别为 18px 与 14px，原文保持可换行和可滚动。
- **任务字段**：正文为 `body`，字段高度至少 42px；字段标签使用 `label`。不要将封面大字用于任务设置。

## Layout

封面固定铺满视口，保留天空、光晕、远城、石桥与左右前景的独立构图。标题起点为 18vh，入口位于高度 58%，头部留白为 30px / 40px；石桥默认宽 67.2vw，前景宽 118vw。宽高比至少 2:1 时调整桥与河岸底部位置、标题移至 13vh。800px 以下石桥/前景分别为 138vw / 185vw，460px 以下为 190vw / 245vw，不能把这些独立层全部粗略替换为单张 cover。

进入后，工作台占满 100svh，页面外层不滚动；顶部景观栏默认高 82px、左右内边距 34px。其下七张功能卡片横向滚动，使用吸附定位，隐藏视觉滚动条但保留触控、滚轮、左右按钮与键盘入口。默认卡片尺寸见令牌，1500px 以上宽 310px；760px 以下宽 245px、高 153px，栏内边距 20px、间距 12px。导航下方有位置计数和操作提示，空闲时下方保留景观与一句引导。

工作面板固定于视口的 left/top 50%，通过 translate(-50%,-50%) 正中定位。默认宽 min(1060px, 100% - 96px)、高 min(740px, 78svh)；1500px 以上为 min(1120px, 100% - 120px) 与 min(800px, 80svh)。760px 以下宽 100% - 28px、高 80svh，并限制最大高度为 100svh - 124px。标题栏固定，内容区独立纵向滚动，防止整页横向溢出。

任务表单最大宽 850px；同一工作面板按当前功能切换表单或结果，不再同时展示旧左右双栏。预览稿最大宽 760px；连接设置在窄屏单栏，最近任务默认两列、窄屏单列。旧侧栏、顶部条、页面大标题、流程条与工作区页脚仍在原有结构中，但当前界面隐藏；不能沿用它们的旧宽度或断点描述新布局。

官网产品介绍位于任务面板内。主图容器完整展示图片，图像宽 100%、高 clamp(210px, 34vh, 360px)，使用 object-fit: contain，不裁掉产品。缩略图横向滚动，默认宽 72px、高 56px；600px 以下宽 64px。主图下方依次为来源与读取时间、原文介绍、可展开的官网完整原文和本地 v7 指导。

## Elevation & Depth

景深由真实照片的遮挡与推进建立。进入工作台时，脚本新增天空、光晕和远城的完整景观层（cover），与推进末帧交叉淡入；最终不是仅保留被镜头放大的城镇一角。后加载的功能导航样式把背景暖白遮罩覆盖为 7%，照片持续清晰可见。外层工作面板和功能卡片有环境投影，内部表单与结果纸面保持无投影。

- **封面入口**：`0 10px 40px #092e3533`。
- **功能卡片**：`0 7px 20px rgba(5,47,55,.10)`；当前卡片再加 2px 深青内描边。
- **正中面板**：`0 22px 70px rgba(6,36,39,.3)`。
- **字段焦点**：绿色边线与 `0 0 0 3px #14795f0c` 光晕；焦点轮廓不依靠投影单独传达状态。

封面推进总长 2400ms，使用 easeOutCubic，镜头场景进度停在 0.58；行程 68% 后开始揭示工作台，背景景观和工作台以 1100ms、cubic-bezier(.2,.7,.3,1) 淡入。播放前允许指针视差（横向约 ±9px、纵向约 ±4px），播放和工作台状态停止响应。直接进入使用同一目标状态。

选择功能后，导航组以 620ms、cubic-bezier(.16,1,.3,1) 执行 translateY(-34px)、translateZ(-200px)、scale(.83)，透明度以 460ms 降至 .32，模糊 .7px；悬停或焦点进入导航时透明度回到 .65 并清除模糊。760px 以下采用 -28px / -100px / .8 和 .28。面板以 620ms 归位、360ms 显现；关闭时以 480ms 退到 translate(-50%,-46%) scale(.92)、240ms 淡出，随后隐藏并禁止交互，卡片恢复。

产品主图成功载入后以 760ms、cubic-bezier(.16,1,.3,1) 从下移 32px、scale(.92)、透明度 0 自然进入。减少动态效果设置下，点击入口后直接就绪，关闭封面推进和指针视差，并取消景观、功能导航、面板及产品图的这些过渡；旧业务界面所有微交互并未统一承诺取消。

**The Clear Surface Rule.** 景观保持可见，正文与操作放在不透明纸面上；不要通过提高整屏白遮罩来解决局部可读性。

## Shapes

功能卡片采用宽而柔和的圆角，工作面板采用略小的圆角，窄屏进一步收敛。字段和常规按钮使用紧凑圆角；主图、缩略图和胶囊入口分别使用前置对应令牌。石桥拱洞来自透明照片层，不替换成几何门洞。图标为细线 SVG，功能卡片图标默认 38px、窄屏 32px；关闭图标为 18px，实际关闭按钮点击区至少 44px，卡片翻页按钮为 40px 方形。

## Components

### 封面与双状态容器

“开始创作”触发单次推进，播放期间防止重复触发，状态由 role=status 宣读；“直接进入工作台”可跳过。封面显示时工作台 hidden / inert；进入后封面作为固定背景、不接收点击并对辅助技术隐藏，首次焦点移至功能卡片。返回封面重置镜头、收起面板并聚焦入口，无需刷新整页。每次打开或刷新都先显示封面，旧 #studio 地址不会自动跳过。

### 功能卡片与中心面板

七个功能为“创作任务、内容策略、资料与配图、图文预览、核验与导出、最近任务、知识库连接”。卡片是原生按钮，使用 aria-pressed 和 aria-controls；左右/Home/End 在卡片间移动焦点，滚轮在卡片区转为横向滚动，Ctrl+滚轮保留缩放行为。导航提供位置计数和前后按钮。

首次打开将焦点放在面板标题；关闭按钮或 Esc 收起面板，恢复原卡片焦点。隐藏面板使用 inert 和 aria-hidden，内容保留以继续任务。面板未声明为模态 dialog，也没有焦点陷阱，卡片与页头仍是可用导航；不要把这一行为写成已实现模态组件。

无稿件时，策略、预览与核验提供填写需求的空状态；资料功能可引导浏览知识库和检查连接。已有稿件时复用相应结果，复制/导出按当前稿件状态启用或禁用，不因界面换位假造结果。

核验响应异常但已有有效草稿时，使用既有待复核结果页保留内容；结果页顶部提供「只重新核验」主要按钮，沿用现有按钮样式。旁边小字说明原稿和资料保留、操作会调用一次模型；运行时按钮显示「正在重新核验…」并禁用，完成后更新实际核验结果。核验通过前不开放最终稿复制或导出，不使用成功颜色暗示草稿已经通过。

核验页优先显示需处理项，其次显示待复核项；通过项放入默认折叠的原生 details，仅在没有待处理项时展开。标题显示待处理数，说明显示已检查数。操作区以「按问题修稿并核验」为主要按钮，「只重新核验」为次要按钮；前者修正图文不匹配或表述，后者处理漏项或核验响应异常。两者均显示加载文字并禁用当前按钮。沿用深青文字、暖白纸面和细分隔线，操作间距 10px，触控高度至少 44px；手机上允许换行，不增加图标装饰或新组件依赖。

### 按钮、字段与平台选择

常规主要/次要按钮、独立生成按钮及字段使用前置组件令牌。次要按钮有细边线，字段聚焦时边框和轻光晕同时变化。占位符最终颜色为 #647469，模式切换文字默认 #526558、选中 #345d45；表单脚注为 #526558 / 11px。面板描述最终为 12px，功能滚动提示和品牌副标最终为 11px；这些后置覆盖也作用于窄屏，避免继承过浅或过小的旧样式。平台选择仍保留小红书、公众号、朋友圈及选中边线，不引入新的前端依赖。

景观上的链接、卡片和翻页按钮使用白色 3px 焦点轮廓、4px 外偏移；封面按钮为奶油白 3px / 5px；常规工作按钮沿用浅绿 3px / 3px。产品缩略图、原文展开和链接使用深青 2px / 3px。字段保留自身焦点反馈。

### 官网产品介绍与图片

真实创作模式下可独立“读取官网介绍与图片”，读取本身不需要模型。展示服务端确认的完整型号、官网链接、读取时间、官网介绍原文、带说明条件的原文折叠区，以及实际读取的 v7 指导标题。介绍仅整理 HTML 空白，不为视觉精简而改写、截掉限制条件或生成产品宣传语。

官网 KV 主视觉优先排列为默认图片，主图加载成功后自然进入；缩略图有名称和 aria-pressed。某张图失败时显示明确提示，隐藏失败图；再次点击其他缩略图会先恢复可见状态，成功载入后移除错误提示。模型未配置仍可读资料，但不表示广告已生成。

官网型号清单固定为十个明确型号：HUAWEI MateBook 14（鸿蒙版）、HUAWEI MateBook Pro（鸿蒙版）、HUAWEI MateBook Pro S、HUAWEI MateBook Fold 非凡大师、HUAWEI MateBook 14 酷睿 Ultra、HUAWEI MateBook D 14 2024、HUAWEI MateBook D 16 2024、HUAWEI MateBook D 16 SE 版 2024、HUAWEI MateBook GT 14、HUAWEI MateBook X Pro 酷睿 Ultra 微绒典藏版。不明确型号不可自动猜测，不能把“十个”描述为全部华为 PC 产品。

官网图片采用本地同源接口返回的内存引用，服务端核验图片签名、按内容去重，缓存约一小时；重启、过期或淘汰后需重新读取。页面预备资料最多复用 45 分钟且按型号、平台、人群与场景匹配；不是永久图片地址或随仓库打包素材。本地 v7 按治理/引用规则、三平台模板、型号角色和客户场景选择指导；学生任务优先学生沟通表达，指导不覆盖产品事实，页面只展示指导标题。

**The Evidence Rule.** 官网介绍保留原文及限制条件；图片来自当前明确型号，v7 只指导表达，演示和未验收的生成能力必须标明。

### 外部资源与当前边界

Mostar 六张图片与 Ogg 字体直接来自 `https://motionsites.org/assets/prompt-media/`，没有本地镜像，依赖网络：

| 用途 | 文件 |
| --- | --- |
| 天空 | ee40c389c0481c86a909.png |
| 光晕 | b5ee731d6c1d435c0267.png |
| 远城 | 5b16d471b78820601ffb.png |
| 石桥 | 9467466de651dd1691cb.png |
| 左河岸 | 05357f8b7c0b8994b686.png |
| 右河岸 | b859e7c694aee8f86cfa.png |
| Ogg Medium | 137479d52b41772b10e7.woff2 |

原封面至少两张图片触发 error 时提示可直接进入；没有图片超时检测、自动离线替换或完整离线场景。新景观层复用天空、光晕和远城 URL，也受同一网络条件限制。中文思源宋体 VF 依赖本机安装。官网读取另依赖华为消费者官网网络；本地 v7 依赖指定目录可读。

本轮用户决定先不配置模型，没有下载或安装模型；真实广告生成尚未验收。已有记录为 97 项业务测试通过，覆盖原流程、官网来源与型号限制、缓存引用、指导匹配及生成/修改上下文；这不替代真实模型运行。本轮主图尺寸、默认 KV 排序、切图错误恢复、低对比文字与功能英文眉题已按复核意见修改；主流程已完成最新浏览器重拍，独立复核确认这些修正通过。已核对的小字对比度为 5.63:1、4.90:1、6.19:1；此记录不扩展为所有旧业务界面均已完成可访问性验收。

## Do's and Don'ts

### 团队生图设置扩展

「连接与生图」复用原有正中工作面板与暖白表单，团队模型设置在连接页上方；文案与图片核验、场景生图分为两个表单，复用管理员身份与团队百炼 Key。配置、身份、创作和结果按纵向顺序排列，以细分隔线分组，不再增加功能卡片或嵌套卡片。表单正文 14px / 1.6，窄屏输入 16px 避免聚焦缩放；帮助文字使用 #526558、13px / 1.7，错误文字 #8c3434。双列输入在 600px 以下变为单列，操作区域至少 44px。新增表单使用原有 7px 控件圆角、#dfe5dd 边框、#72a791 焦点色与 #215e5c 主操作。完整 Key 不回填，加载、保存、失败与权限状态用就近文字反馈。生成结果标注 AI 场景示意，保持与真实产品图片的来源区别。

### Do

- Do 保留完整 Mostar 景观、中文宋体封面和可跳过、可返回的入口。
- Do 使用顶部横向功能卡片；打开功能时让面板居中，关闭或 Esc 后恢复卡片并归还焦点。
- Do 保留官网原文、脚注与条件、型号和来源时间；主图使用 contain，缩略图可切换，失败后能选择其他图恢复。
- Do 按平台、型号角色与场景展示实际读取的 v7 指导标题，保持事实来源与写作指导分开。
- Do 同步检查桌面和窄屏、键盘操作、减少动态效果与长内容滚动，再更新设计令牌。

### Don't

- Don't 把隐藏的旧侧栏、旧双栏网格或 86% 背景遮罩写成当前工作台布局。
- Don't 把原生组件组织原则说成已安装 shadcn 或已迁移到 React；不把 Apple 参考集合说成官方品牌规范。
- Don't 把官网资料或本地 v7 指导说成 ima 实时检索，也不把演示排版说成真实模型广告。
- Don't 宣称外链景观可离线完整运行、本机宋体已随项目分发，或内存图片引用永久有效。
- Don't 用同名近似型号、其他型号配图、被改写的产品介绍或遗漏限制条件替代本次官网证据。
